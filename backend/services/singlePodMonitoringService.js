// backend/services/singlePodMonitoringService.js
// New single pod monitoring system with file-based tracking

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');
const emailService = require('./emailService');

class SinglePodMonitoringService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.checkFrequency = '*/1 * * * *'; // Every 1 minute
    this.downPodsFile = path.join(__dirname, '../data/down-pods.json');
    this.previousPodsFile = path.join(__dirname, '../data/previous-pods.json');
    
    // Ensure data directory exists
    this.ensureDataDirectory();
    
    console.log('🔍 Single Pod Monitoring Service initialized');
  }

  ensureDataDirectory() {
    const dataDir = path.dirname(this.downPodsFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Single pod monitoring already running');
      return false;
    }

    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('❌ Cannot start pod monitoring - Kubernetes not configured');
      return false;
    }

    if (!config.emailGroupId) {
      console.log('⚠️ Pod monitoring started without email alerts - no email group configured');
    }

    console.log('🚀 Starting single pod monitoring (checking every 1 minute)');
    
    this.checkInterval = cron.schedule(this.checkFrequency, async () => {
      await this.checkPodChanges();
    }, {
      scheduled: false
    });

    this.checkInterval.start();
    this.isMonitoring = true;

    // Perform initial check after 10 seconds
    setTimeout(() => {
      this.checkPodChanges();
    }, 10000);

    return true;
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Single pod monitoring not running');
      return false;
    }

    console.log('🛑 Stopping single pod monitoring');
    
    if (this.checkInterval) {
      this.checkInterval.stop();
      this.checkInterval = null;
    }
    
    this.isMonitoring = false;
    return true;
  }

  async checkPodChanges() {
    try {
      console.log('🔍 Checking for single pod changes...');
      
      // Get current pods from Kubernetes
      const currentPods = await kubernetesService.getAllPods();
      const currentPodMap = this.createPodMap(currentPods);
      
      // Load previous pods state
      const previousPods = this.loadPreviousPodsState();
      const previousPodMap = this.createPodMap(previousPods);
      
      // Load current down pods
      const currentDownPods = this.loadDownPods();
      
      // Detect changes
      const changes = this.detectPodChanges(previousPodMap, currentPodMap, currentDownPods);
      
      // Process changes
      if (changes.newDownPods.length > 0 || changes.recoveredPods.length > 0) {
        await this.processChanges(changes);
      }
      
      // Save current state for next comparison
      this.savePreviousPodsState(currentPods);
      
      console.log(`✅ Pod change check completed - ${changes.newDownPods.length} new down, ${changes.recoveredPods.length} recovered`);
      
    } catch (error) {
      console.error('❌ Single pod monitoring check failed:', error);
    }
  }

  createPodMap(pods) {
    const podMap = new Map();
    pods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      podMap.set(key, {
        name: pod.name,
        namespace: pod.namespace,
        status: pod.status,
        ready: pod.ready,
        node: pod.node,
        age: pod.age,
        restarts: pod.restarts || 0
      });
    });
    return podMap;
  }

  detectPodChanges(previousPodMap, currentPodMap, currentDownPods) {
    const newDownPods = [];
    const recoveredPods = [];
    const stillDownPods = [];

    // Check for new down pods
    for (const [podKey, previousPod] of previousPodMap) {
      const currentPod = currentPodMap.get(podKey);
      
      if (!currentPod) {
        // Pod disappeared
        if (!currentDownPods.some(dp => dp.key === podKey)) {
          newDownPods.push({
            key: podKey,
            name: previousPod.name,
            namespace: previousPod.namespace,
            reason: 'Pod disappeared',
            lastStatus: previousPod.status,
            downTime: new Date().toISOString(),
            node: previousPod.node
          });
        }
      } else if (!this.isPodHealthy(currentPod)) {
        // Pod exists but not healthy
        if (!currentDownPods.some(dp => dp.key === podKey)) {
          newDownPods.push({
            key: podKey,
            name: currentPod.name,
            namespace: currentPod.namespace,
            reason: `Pod unhealthy (${currentPod.status})`,
            lastStatus: currentPod.status,
            downTime: new Date().toISOString(),
            node: currentPod.node
          });
        }
      }
    }

    // Check for recovered pods
    for (const downPod of currentDownPods) {
      const currentPod = currentPodMap.get(downPod.key);
      
      if (currentPod && this.isPodHealthy(currentPod)) {
        // Pod recovered
        const downDuration = this.calculateDowntime(downPod.downTime);
        recoveredPods.push({
          ...downPod,
          recoveryTime: new Date().toISOString(),
          downDuration: downDuration,
          currentStatus: currentPod.status,
          currentNode: currentPod.node
        });
      } else {
        // Pod still down
        stillDownPods.push(downPod);
      }
    }

    return {
      newDownPods,
      recoveredPods,
      stillDownPods
    };
  }

  isPodHealthy(pod) {
    return pod.ready === true && pod.status === 'Running';
  }

  calculateDowntime(downTimeStr) {
    const downTime = new Date(downTimeStr);
    const now = new Date();
    const diffMs = now - downTime;
    
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  }

  async processChanges(changes) {
    const { newDownPods, recoveredPods, stillDownPods } = changes;
    
    // Update down pods file
    const updatedDownPods = [...stillDownPods, ...newDownPods];
    this.saveDownPods(updatedDownPods);
    
    // Send email alert
    const config = kubernetesConfigService.getConfig();
    if (config.emailGroupId) {
      await this.sendPodStatusAlert({
        newDownPods,
        recoveredPods,
        currentDownPods: updatedDownPods,
        allPodsUp: updatedDownPods.length === 0
      }, config.emailGroupId);
    }
  }

  async sendPodStatusAlert(alertData, emailGroupId) {
    try {
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == emailGroupId);
      
      if (!targetGroup || !targetGroup.enabled) {
        console.log('❌ Email group not found or disabled for pod alerts');
        return false;
      }

      const { newDownPods, recoveredPods, currentDownPods, allPodsUp } = alertData;
      const timestamp = new Date();
      
      // Determine alert type and subject
      let subject, alertType, headerColor;
      if (allPodsUp && recoveredPods.length > 0) {
        subject = `✅ Kubernetes: All Pods Recovered - ${recoveredPods.length} pods back online`;
        alertType = 'ALL_PODS_UP';
        headerColor = '#28a745';
      } else if (recoveredPods.length > 0 && newDownPods.length > 0) {
        subject = `🔄 Kubernetes: Pod Status Changes - ${newDownPods.length} down, ${recoveredPods.length} recovered`;
        alertType = 'MIXED_CHANGES';
        headerColor = '#ff7f00';
      } else if (recoveredPods.length > 0) {
        subject = `✅ Kubernetes: ${recoveredPods.length} Pods Recovered - ${currentDownPods.length} still down`;
        alertType = 'PODS_RECOVERED';
        headerColor = '#28a745';
      } else {
        subject = `🚨 Kubernetes: ${newDownPods.length} Pods Down - ${currentDownPods.length} total down`;
        alertType = 'PODS_DOWN';
        headerColor = '#dc3545';
      }

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails,
        subject: subject,
        html: this.generateAlertEmail({
          alertType,
          headerColor,
          newDownPods,
          recoveredPods,
          currentDownPods,
          allPodsUp,
          timestamp,
          targetGroup
        })
      };

      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 ✅ Pod status alert sent: ${alertType}`);
      return true;
      
    } catch (error) {
      console.error('📧 ❌ Failed to send pod status alert:', error);
      return false;
    }
  }

  generateAlertEmail(data) {
    const { alertType, headerColor, newDownPods, recoveredPods, currentDownPods, allPodsUp, timestamp, targetGroup } = data;
    
    const statusIcon = allPodsUp ? '✅' : (newDownPods.length > 0 ? '🚨' : '🔄');
    const statusText = allPodsUp ? 'ALL PODS OPERATIONAL' : 
                      (newDownPods.length > 0 ? 'POD FAILURES DETECTED' : 'POD STATUS CHANGES');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background-color: ${headerColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">${statusIcon} ${statusText}</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">Kubernetes Pod Monitoring Alert</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px;">
          ${this.generateSummarySection(newDownPods, recoveredPods, currentDownPods, allPodsUp)}
          
          ${newDownPods.length > 0 ? this.generateNewDownPodsSection(newDownPods) : ''}
          ${recoveredPods.length > 0 ? this.generateRecoveredPodsSection(recoveredPods) : ''}
          ${currentDownPods.length > 0 && !allPodsUp ? this.generateCurrentDownPodsSection(currentDownPods) : ''}
          
          ${allPodsUp ? this.generateAllUpSection() : this.generateActionSection()}
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Alert sent to: ${targetGroup.name}</p>
          <p style="margin: 5px 0 0 0;">Generated at: ${timestamp.toLocaleString()}</p>
          <p style="margin: 5px 0 0 0;">Single Pod Monitoring System • 1-minute detection</p>
        </div>
      </div>
    `;
  }

  generateSummarySection(newDownPods, recoveredPods, currentDownPods, allPodsUp) {
    return `
      <div style="display: flex; justify-content: space-around; margin: 20px 0;">
        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
          <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${newDownPods.length}</div>
          <div style="font-size: 12px; color: #666;">New Down</div>
        </div>
        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
          <div style="font-size: 24px; font-weight: bold; color: #28a745;">${recoveredPods.length}</div>
          <div style="font-size: 12px; color: #666;">Recovered</div>
        </div>
        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
          <div style="font-size: 24px; font-weight: bold; color: ${allPodsUp ? '#28a745' : '#dc3545'};">${currentDownPods.length}</div>
          <div style="font-size: 12px; color: #666;">Total Down</div>
        </div>
      </div>
    `;
  }

  generateNewDownPodsSection(newDownPods) {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #dc3545; margin-bottom: 15px;">🚨 New Down Pods (${newDownPods.length})</h3>
        <div style="background: white; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #dc3545; color: white;">
                <th style="padding: 12px; text-align: left;">Pod</th>
                <th style="padding: 12px; text-align: left;">Namespace</th>
                <th style="padding: 12px; text-align: left;">Reason</th>
                <th style="padding: 12px; text-align: left;">Down Since</th>
              </tr>
            </thead>
            <tbody>
              ${newDownPods.map((pod, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                  <td style="padding: 12px; font-weight: bold;">${pod.name}</td>
                  <td style="padding: 12px;">${pod.namespace}</td>
                  <td style="padding: 12px;">${pod.reason}</td>
                  <td style="padding: 12px;">${new Date(pod.downTime).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  generateRecoveredPodsSection(recoveredPods) {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #28a745; margin-bottom: 15px;">✅ Recovered Pods (${recoveredPods.length})</h3>
        <div style="background: white; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #28a745; color: white;">
                <th style="padding: 12px; text-align: left;">Pod</th>
                <th style="padding: 12px; text-align: left;">Namespace</th>
                <th style="padding: 12px; text-align: left;">Downtime</th>
                <th style="padding: 12px; text-align: left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${recoveredPods.map((pod, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                  <td style="padding: 12px; font-weight: bold;">${pod.name}</td>
                  <td style="padding: 12px;">${pod.namespace}</td>
                  <td style="padding: 12px;">${pod.downDuration}</td>
                  <td style="padding: 12px;">
                    <span style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px;">
                      ${pod.currentStatus}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  generateCurrentDownPodsSection(currentDownPods) {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #ff7f00; margin-bottom: 15px;">⚠️ Still Down (${currentDownPods.length})</h3>
        <div style="background: white; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #ff7f00; color: white;">
                <th style="padding: 12px; text-align: left;">Pod</th>
                <th style="padding: 12px; text-align: left;">Namespace</th>
                <th style="padding: 12px; text-align: left;">Down Duration</th>
                <th style="padding: 12px; text-align: left;">Reason</th>
              </tr>
            </thead>
            <tbody>
              ${currentDownPods.slice(0, 10).map((pod, index) => {
                const downDuration = this.calculateDowntime(pod.downTime);
                return `
                  <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                    <td style="padding: 12px; font-weight: bold;">${pod.name}</td>
                    <td style="padding: 12px;">${pod.namespace}</td>
                    <td style="padding: 12px;">${downDuration}</td>
                    <td style="padding: 12px;">${pod.reason}</td>
                  </tr>
                `;
              }).join('')}
              ${currentDownPods.length > 10 ? `
                <tr>
                  <td colspan="4" style="padding: 12px; text-align: center; color: #666; font-style: italic;">
                    ... and ${currentDownPods.length - 10} more pods
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  generateAllUpSection() {
    return `
      <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; color: #155724;">🎉 ALL PODS ARE NOW OPERATIONAL!</h3>
        <ul style="color: #155724; margin: 10px 0;">
          <li>All Kubernetes pods are running and healthy</li>
          <li>Cluster is fully operational</li>
          <li>Monitoring will continue automatically</li>
          <li>You will be notified of any future changes</li>
        </ul>
      </div>
    `;
  }

  generateActionSection() {
    return `
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; color: #856404;">⚠️ Recommended Actions</h3>
        <ul style="color: #856404; margin: 10px 0;">
          <li>Check pod logs: <code>kubectl logs &lt;pod-name&gt; -n &lt;namespace&gt;</code></li>
          <li>Describe pod events: <code>kubectl describe pod &lt;pod-name&gt; -n &lt;namespace&gt;</code></li>
          <li>Check node resources and cluster status</li>
          <li>Verify network connectivity and DNS resolution</li>
          <li>Monitor for auto-recovery or manual intervention needs</li>
        </ul>
      </div>
    `;
  }

  // File operations
  loadDownPods() {
    try {
      if (fs.existsSync(this.downPodsFile)) {
        const data = fs.readFileSync(this.downPodsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading down pods file:', error);
    }
    return [];
  }

  saveDownPods(downPods) {
    try {
      fs.writeFileSync(this.downPodsFile, JSON.stringify(downPods, null, 2));
    } catch (error) {
      console.error('Error saving down pods file:', error);
    }
  }

  loadPreviousPodsState() {
    try {
      if (fs.existsSync(this.previousPodsFile)) {
        const data = fs.readFileSync(this.previousPodsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading previous pods file:', error);
    }
    return [];
  }

  savePreviousPodsState(pods) {
    try {
      fs.writeFileSync(this.previousPodsFile, JSON.stringify(pods, null, 2));
    } catch (error) {
      console.error('Error saving previous pods file:', error);
    }
  }

  // Management methods
  clearDownPods() {
    try {
      if (fs.existsSync(this.downPodsFile)) {
        fs.unlinkSync(this.downPodsFile);
      }
      console.log('🗑️ Down pods file cleared');
      return true;
    } catch (error) {
      console.error('Error clearing down pods file:', error);
      return false;
    }
  }

  getStatus() {
    const downPods = this.loadDownPods();
    
    return {
      isMonitoring: this.isMonitoring,
      checkFrequency: this.checkFrequency,
      currentDownPods: downPods.length,
      downPods: downPods,
      lastCheck: new Date()
    };
  }

  // Manual trigger for testing
  async manualCheck() {
    console.log('🔍 Manual pod check triggered');
    await this.checkPodChanges();
  }
}

module.exports = new SinglePodMonitoringService();