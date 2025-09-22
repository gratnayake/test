// backend/services/snapshotBasedPodMonitoringService.js
// Uses the same logic as the old pod health check - compares against pod-snapshot.json

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');
const emailService = require('./emailService');

class SnapshotBasedPodMonitoringService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.checkFrequency = '*/1 * * * *'; // Every 1 minute
    
    // File paths - using same as old system
    this.snapshotFile = path.join(__dirname, '../data/pod-snapshot.json');
    this.downPodsFile = path.join(__dirname, '../data/down-pods.json');
    
    this.ensureDataDirectory();
    console.log('📸 Snapshot-Based Pod Monitoring Service initialized (like old system)');
  }

  ensureDataDirectory() {
    const dataDir = path.dirname(this.snapshotFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Snapshot-based pod monitoring already running');
      return false;
    }

    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('❌ Cannot start pod monitoring - Kubernetes not configured');
      return false;
    }

    console.log('🚀 Starting snapshot-based pod monitoring (same logic as old system)');
    
    // Take initial snapshot if it doesn't exist
    if (!this.hasSnapshot()) {
      await this.takeSnapshot();
    } else {
      console.log('📸 Using existing snapshot for monitoring');
    }
    
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
      console.log('⚠️ Snapshot-based pod monitoring not running');
      return false;
    }

    console.log('🛑 Stopping snapshot-based pod monitoring');
    
    if (this.checkInterval) {
      this.checkInterval.stop();
      this.checkInterval = null;
    }
    
    this.isMonitoring = false;
    return true;
  }

  async takeSnapshot() {
    try {
      console.log('📸 Taking pod snapshot...');
      
      const currentPods = await kubernetesService.getAllPods();
      
      // Create snapshot in same format as old system
      const snapshot = {
        timestamp: new Date().toISOString(),
        totalPods: currentPods.length,
        pods: currentPods.map(pod => ({
          name: pod.name,
          namespace: pod.namespace,
          status: pod.status,
          ready: pod.ready,
          node: pod.node,
          restarts: pod.restarts || 0,
          age: pod.age
        }))
      };
      
      this.saveSnapshot(snapshot);
      
      console.log(`✅ Snapshot taken: ${currentPods.length} pods captured`);
      return snapshot;
      
    } catch (error) {
      console.error('❌ Failed to take snapshot:', error);
      throw error;
    }
  }

  async checkPodChanges() {
    try {
      console.log('🔍 Checking pods against snapshot (old system logic)...');
      
      if (!this.hasSnapshot()) {
        console.log('⚠️ No snapshot found, taking one now...');
        await this.takeSnapshot();
        return;
      }
      
      // Get current pods from Kubernetes
      const currentPods = await kubernetesService.getAllPods();
      const currentPodMap = this.createPodMap(currentPods);
      
      // Load snapshot
      const snapshot = this.loadSnapshot();
      const snapshotPodMap = this.createPodMap(snapshot.pods);
      
      // Load current down pods tracking
      const currentDownPods = this.loadDownPods();
      
      // SAME LOGIC AS OLD SYSTEM: Compare current vs snapshot
      const changes = this.detectChangesAgainstSnapshot(
        snapshotPodMap,
        currentPodMap,
        currentDownPods
      );
      
      // Process changes if any detected
      if (changes.newDownPods.length > 0 || changes.recoveredPods.length > 0) {
        await this.processChanges(changes);
      }
      
      console.log(`✅ Snapshot check completed - ${changes.newDownPods.length} new down, ${changes.recoveredPods.length} recovered`);
      
    } catch (error) {
      console.error('❌ Snapshot-based pod monitoring check failed:', error);
    }
  }

  detectChangesAgainstSnapshot(snapshotPodMap, currentPodMap, currentDownPods) {
    const newDownPods = [];
    const recoveredPods = [];
    const stillDownPods = [];

    console.log(`🔍 Comparing ${currentPodMap.size} current pods vs ${snapshotPodMap.size} snapshot pods...`);

    // Check each pod from snapshot
    for (const [podKey, snapshotPod] of snapshotPodMap) {
      const currentPod = currentPodMap.get(podKey);
      const isAlreadyTrackedDown = currentDownPods.some(dp => dp.key === podKey);
      
      if (!isAlreadyTrackedDown) {
        let shouldMarkDown = false;
        let reason = '';
        
        if (!currentPod) {
          // Pod from snapshot disappeared
          shouldMarkDown = true;
          reason = 'Pod disappeared from cluster';
          console.log(`📉 Pod disappeared: ${podKey}`);
        } else {
          // Check if pod status changed from snapshot
          const snapshotHealthy = this.isPodHealthy(snapshotPod);
          const currentHealthy = this.isPodHealthy(currentPod);
          
          if (snapshotHealthy && !currentHealthy) {
            // Pod was healthy in snapshot but is now unhealthy
            shouldMarkDown = true;
            reason = `Pod became unhealthy: ${currentPod.status} (was ${snapshotPod.status})`;
            console.log(`📉 Pod became unhealthy: ${podKey} - ${snapshotPod.status} → ${currentPod.status}`);
          }
          
          // Check for restart count increase (this is what was missing!)
          if (currentPod.restarts > snapshotPod.restarts) {
            const restartIncrease = currentPod.restarts - snapshotPod.restarts;
            console.log(`🔄 Pod restart detected: ${podKey} - ${snapshotPod.restarts} → ${currentPod.restarts} (+${restartIncrease})`);
            
            // Mark as down temporarily to track the restart
            shouldMarkDown = true;
            reason = `Pod restarted ${restartIncrease} time(s) (${snapshotPod.restarts} → ${currentPod.restarts})`;
          }
        }
        
        if (shouldMarkDown) {
          newDownPods.push({
            key: podKey,
            name: snapshotPod.name,
            namespace: snapshotPod.namespace,
            reason: reason,
            snapshotStatus: snapshotPod.status,
            currentStatus: currentPod?.status || 'Missing',
            snapshotRestarts: snapshotPod.restarts,
            currentRestarts: currentPod?.restarts || 0,
            downTime: new Date().toISOString(),
            node: snapshotPod.node
          });
        }
      }
    }

    // Check for recovered pods (pods that were down but are now healthy)
    for (const downPod of currentDownPods) {
      const currentPod = currentPodMap.get(downPod.key);
      const snapshotPod = snapshotPodMap.get(downPod.key);
      
      if (currentPod && snapshotPod) {
        // Check if pod is now healthy and matches or exceeds snapshot state
        const currentHealthy = this.isPodHealthy(currentPod);
        const restartCountOk = currentPod.restarts >= snapshotPod.restarts;
        
        if (currentHealthy && restartCountOk) {
          // Pod recovered
          const downDuration = this.calculateDowntime(downPod.downTime);
          console.log(`✅ Pod recovered: ${downPod.key} - down for ${downDuration}`);
          
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
      } else if (!currentPod) {
        // Pod still missing
        stillDownPods.push(downPod);
      } else {
        // Pod exists but still not healthy
        stillDownPods.push(downPod);
      }
    }

    return {
      newDownPods,
      recoveredPods,
      stillDownPods
    };
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
        restarts: pod.restarts || 0,
        age: pod.age
      });
    });
    return podMap;
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
      await this.sendSnapshotBasedAlert({
        newDownPods,
        recoveredPods,
        currentDownPods: updatedDownPods,
        allPodsUp: updatedDownPods.length === 0
      }, config.emailGroupId);
    }
  }

  async sendSnapshotBasedAlert(alertData, emailGroupId) {
    try {
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == emailGroupId);
      
      if (!targetGroup || !targetGroup.enabled) {
        console.log('❌ Email group not found or disabled for snapshot-based alerts');
        return false;
      }

      const { newDownPods, recoveredPods, currentDownPods, allPodsUp } = alertData;
      const timestamp = new Date();
      
      // Determine alert type and subject
      let subject, alertType, headerColor;
      if (allPodsUp && recoveredPods.length > 0) {
        subject = `✅ Kubernetes: All Pods Back to Snapshot State - ${recoveredPods.length} pods recovered`;
        alertType = 'ALL_PODS_UP';
        headerColor = '#28a745';
      } else if (recoveredPods.length > 0 && newDownPods.length > 0) {
        subject = `🔄 Kubernetes: Pod Changes vs Snapshot - ${newDownPods.length} issues, ${recoveredPods.length} recovered`;
        alertType = 'MIXED_CHANGES';
        headerColor = '#ff7f00';
      } else if (recoveredPods.length > 0) {
        subject = `✅ Kubernetes: ${recoveredPods.length} Pods Recovered vs Snapshot - ${currentDownPods.length} still affected`;
        alertType = 'PODS_RECOVERED';
        headerColor = '#28a745';
      } else {
        subject = `🚨 Kubernetes: ${newDownPods.length} Pod Changes Detected vs Snapshot`;
        alertType = 'PODS_CHANGED';
        headerColor = '#dc3545';
      }

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails,
        subject: subject,
        html: this.generateSnapshotAlertEmail({
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
      console.log(`📧 ✅ Snapshot-based pod alert sent: ${alertType}`);
      return true;
      
    } catch (error) {
      console.error('📧 ❌ Failed to send snapshot-based pod alert:', error);
      return false;
    }
  }

  generateSnapshotAlertEmail(data) {
    const { alertType, headerColor, newDownPods, recoveredPods, currentDownPods, allPodsUp, timestamp, targetGroup } = data;
    
    const statusIcon = allPodsUp ? '✅' : '🚨';
    const statusText = allPodsUp ? 'ALL PODS MATCH SNAPSHOT STATE' : 'POD CHANGES VS SNAPSHOT DETECTED';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background-color: ${headerColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">${statusIcon} ${statusText}</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">Snapshot-Based Pod Monitoring Alert</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px;">
          <div style="background-color: #e3f2fd; border: 1px solid #90caf9; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: #1565c0;">📸 Snapshot Monitoring</h3>
            <p style="color: #1565c0; margin: 5px 0; font-size: 14px;">
              This alert compares current pod state against the baseline snapshot, just like the old system.
              It detects pod disappearances, status changes, and restart count increases.
            </p>
          </div>

          ${this.generateSummarySection(newDownPods, recoveredPods, currentDownPods, allPodsUp)}
          
          ${newDownPods.length > 0 ? this.generateNewChangesSection(newDownPods) : ''}
          ${recoveredPods.length > 0 ? this.generateRecoveredPodsSection(recoveredPods) : ''}
          ${currentDownPods.length > 0 && !allPodsUp ? this.generateCurrentIssuesSection(currentDownPods) : ''}
          
          ${allPodsUp ? this.generateAllUpSection() : this.generateActionSection()}
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Alert sent to: ${targetGroup.name}</p>
          <p style="margin: 5px 0 0 0;">Generated at: ${timestamp.toLocaleString()}</p>
          <p style="margin: 5px 0 0 0;">Snapshot-Based Pod Monitoring • 1-minute checks vs baseline</p>
        </div>
      </div>
    `;
  }

  generateSummarySection(newDownPods, recoveredPods, currentDownPods, allPodsUp) {
    return `
      <div style="display: flex; justify-content: space-around; margin: 20px 0;">
        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
          <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${newDownPods.length}</div>
          <div style="font-size: 12px; color: #666;">New Issues</div>
        </div>
        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
          <div style="font-size: 24px; font-weight: bold; color: #28a745;">${recoveredPods.length}</div>
          <div style="font-size: 12px; color: #666;">Recovered</div>
        </div>
        <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 80px;">
          <div style="font-size: 24px; font-weight: bold; color: ${allPodsUp ? '#28a745' : '#dc3545'};">${currentDownPods.length}</div>
          <div style="font-size: 12px; color: #666;">Total Issues</div>
        </div>
      </div>
    `;
  }

  generateNewChangesSection(newDownPods) {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #dc3545; margin-bottom: 15px;">🚨 New Changes vs Snapshot (${newDownPods.length})</h3>
        <div style="background: white; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #dc3545; color: white;">
                <th style="padding: 12px; text-align: left;">Pod</th>
                <th style="padding: 12px; text-align: left;">Namespace</th>
                <th style="padding: 12px; text-align: left;">Issue</th>
                <th style="padding: 12px; text-align: left;">Status Change</th>
                <th style="padding: 12px; text-align: left;">Restarts</th>
              </tr>
            </thead>
            <tbody>
              ${newDownPods.map((pod, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                  <td style="padding: 12px; font-weight: bold;">${pod.name}</td>
                  <td style="padding: 12px;">${pod.namespace}</td>
                  <td style="padding: 12px; font-size: 12px;">${pod.reason}</td>
                  <td style="padding: 12px; font-size: 12px;">${pod.snapshotStatus} → ${pod.currentStatus}</td>
                  <td style="padding: 12px; font-size: 12px;">${pod.snapshotRestarts} → ${pod.currentRestarts}</td>
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
        <h3 style="color: #28a745; margin-bottom: 15px;">✅ Recovered to Snapshot State (${recoveredPods.length})</h3>
        <div style="background: white; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #28a745; color: white;">
                <th style="padding: 12px; text-align: left;">Pod</th>
                <th style="padding: 12px; text-align: left;">Namespace</th>
                <th style="padding: 12px; text-align: left;">Issue Duration</th>
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

  generateCurrentIssuesSection(currentDownPods) {
    return `
      <div style="margin: 20px 0;">
        <h3 style="color: #ff7f00; margin-bottom: 15px;">⚠️ Still Different from Snapshot (${currentDownPods.length})</h3>
        <div style="background: white; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #ff7f00; color: white;">
                <th style="padding: 12px; text-align: left;">Pod</th>
                <th style="padding: 12px; text-align: left;">Namespace</th>
                <th style="padding: 12px; text-align: left;">Issue Duration</th>
                <th style="padding: 12px; text-align: left;">Problem</th>
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
                    <td style="padding: 12px; font-size: 12px;">${pod.reason}</td>
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
        <h3 style="margin-top: 0; color: #155724;">🎉 ALL PODS MATCH SNAPSHOT STATE!</h3>
        <ul style="color: #155724; margin: 10px 0;">
          <li>All Kubernetes pods match the baseline snapshot</li>
          <li>No differences detected in pod states or restart counts</li>
          <li>Cluster is operating as expected</li>
          <li>Monitoring will continue against the snapshot baseline</li>
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
          <li>For restart increases: Check if restarts are expected or indicate issues</li>
          <li>Consider retaking snapshot if current state should be the new baseline</li>
          <li>Review recent deployments or cluster changes</li>
        </ul>
      </div>
    `;
  }

  // File operations
  hasSnapshot() {
    return fs.existsSync(this.snapshotFile);
  }

  loadSnapshot() {
    try {
      if (fs.existsSync(this.snapshotFile)) {
        const data = fs.readFileSync(this.snapshotFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading snapshot file:', error);
    }
    return null;
  }

  saveSnapshot(snapshot) {
    try {
      fs.writeFileSync(this.snapshotFile, JSON.stringify(snapshot, null, 2));
      console.log('💾 Pod snapshot saved');
    } catch (error) {
      console.error('Error saving snapshot file:', error);
    }
  }

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

  clearSnapshot() {
    try {
      if (fs.existsSync(this.snapshotFile)) {
        fs.unlinkSync(this.snapshotFile);
      }
      console.log('🗑️ Pod snapshot cleared');
      return true;
    } catch (error) {
      console.error('Error clearing snapshot:', error);
      return false;
    }
  }

  async retakeSnapshot() {
    try {
      console.log('🔄 Retaking pod snapshot...');
      await this.takeSnapshot();
      return true;
    } catch (error) {
      console.error('Error retaking snapshot:', error);
      return false;
    }
  }

  getStatus() {
    const downPods = this.loadDownPods();
    const snapshot = this.loadSnapshot();
    
    return {
      isMonitoring: this.isMonitoring,
      checkFrequency: this.checkFrequency,
      currentDownPods: downPods.length,
      downPods: downPods,
      lastCheck: new Date(),
      snapshot: {
        exists: !!snapshot,
        timestamp: snapshot?.timestamp,
        totalPods: snapshot?.totalPods,
        ageMinutes: snapshot ? Math.floor((new Date() - new Date(snapshot.timestamp)) / 60000) : null
      }
    };
  }

  getSnapshot() {
    return this.loadSnapshot();
  }

  // Manual trigger for testing
  async manualCheck() {
    console.log('🔍 Manual snapshot-based pod check triggered');
    await this.checkPodChanges();
  }

  // Testing method
  async sendTestAlert(alertType = 'mixed') {
    const config = kubernetesConfigService.getConfig();
    
    if (!config.emailGroupId) {
      throw new Error('No email group configured for alerts');
    }

    let testAlertData;

    if (alertType === 'all-up') {
      testAlertData = {
        newDownPods: [],
        recoveredPods: [
          {
            key: 'test-namespace/test-pod-1',
            name: 'test-pod-1',
            namespace: 'test-namespace',
            reason: 'Test recovery - back to snapshot state',
            downTime: new Date(Date.now() - 600000).toISOString(),
            recoveryTime: new Date().toISOString(),
            downDuration: '10m',
            currentStatus: 'Running'
          }
        ],
        currentDownPods: [],
        allPodsUp: true
      };
    } else {
      testAlertData = {
        newDownPods: [
          {
            key: 'test-namespace/test-pod-down',
            name: 'test-pod-down',
            namespace: 'test-namespace',
            reason: 'Test alert - Pod restarted 2 time(s) (0 → 2)',
            snapshotStatus: 'Running',
            currentStatus: 'Running',
            snapshotRestarts: 0,
            currentRestarts: 2,
            downTime: new Date().toISOString(),
            node: 'test-node-1'
          }
        ],
        recoveredPods: [
          {
            key: 'test-namespace/test-pod-recovered',
            name: 'test-pod-recovered',
            namespace: 'test-namespace',
            reason: 'Test recovery',
            downTime: new Date(Date.now() - 300000).toISOString(),
            recoveryTime: new Date().toISOString(),
            downDuration: '5m',
            currentStatus: 'Running'
          }
        ],
        currentDownPods: [
          {
            key: 'test-namespace/test-pod-still-down',
            name: 'test-pod-still-down',
            namespace: 'test-namespace',
            reason: 'Test - Pod disappeared from cluster',
            downTime: new Date(Date.now() - 900000).toISOString(),
            node: 'test-node-2'
          }
        ],
        allPodsUp: false
      };
    }

    return await this.sendSnapshotBasedAlert(testAlertData, config.emailGroupId);
  }
}

module.exports = new SnapshotBasedPodMonitoringService();