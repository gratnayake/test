// backend/services/hybridSinglePodMonitoringService.js
// Hybrid approach: Snapshot + Rolling comparison

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');
const emailService = require('./emailService');

class HybridSinglePodMonitoringService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.checkFrequency = '*/1 * * * *'; // Every 1 minute
    
    // File paths
    this.downPodsFile = path.join(__dirname, '../data/down-pods.json');
    this.previousPodsFile = path.join(__dirname, '../data/previous-pods.json');
    this.initialSnapshotFile = path.join(__dirname, '../data/initial-snapshot.json');
    
    // In-memory state
    this.initialSnapshot = null;
    this.isInitialized = false;
    
    this.ensureDataDirectory();
    console.log('🔍 Hybrid Single Pod Monitoring Service initialized');
  }

  ensureDataDirectory() {
    const dataDir = path.dirname(this.downPodsFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Hybrid pod monitoring already running');
      return false;
    }

    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('❌ Cannot start pod monitoring - Kubernetes not configured');
      return false;
    }

    console.log('🚀 Starting hybrid pod monitoring (snapshot + rolling detection)');
    
    // Take initial snapshot first
    await this.takeInitialSnapshot();
    
    this.checkInterval = cron.schedule(this.checkFrequency, async () => {
      await this.checkPodChanges();
    }, {
      scheduled: false
    });

    this.checkInterval.start();
    this.isMonitoring = true;

    // Perform initial check after 30 seconds (allow snapshot to settle)
    setTimeout(() => {
      this.checkPodChanges();
    }, 30000);

    return true;
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Hybrid pod monitoring not running');
      return false;
    }

    console.log('🛑 Stopping hybrid pod monitoring');
    
    if (this.checkInterval) {
      this.checkInterval.stop();
      this.checkInterval = null;
    }
    
    this.isMonitoring = false;
    this.isInitialized = false;
    return true;
  }

  async takeInitialSnapshot() {
    try {
      console.log('📸 Taking initial pod snapshot...');
      
      const currentPods = await kubernetesService.getAllPods();
      
      // Filter to only healthy pods for baseline
      const healthyPods = currentPods.filter(pod => this.isPodHealthy(pod));
      
      this.initialSnapshot = {
        timestamp: new Date().toISOString(),
        totalPods: currentPods.length,
        healthyPods: healthyPods.length,
        pods: healthyPods.map(pod => ({
          key: `${pod.namespace}/${pod.name}`,
          name: pod.name,
          namespace: pod.namespace,
          status: pod.status,
          ready: pod.ready,
          node: pod.node,
          restarts: pod.restarts || 0
        }))
      };
      
      // Save snapshot to file
      this.saveInitialSnapshot(this.initialSnapshot);
      
      console.log(`✅ Initial snapshot taken: ${healthyPods.length}/${currentPods.length} healthy pods`);
      console.log(`📋 Snapshot baseline established with ${healthyPods.length} healthy pods`);
      
      this.isInitialized = true;
      return this.initialSnapshot;
      
    } catch (error) {
      console.error('❌ Failed to take initial snapshot:', error);
      throw error;
    }
  }

  async checkPodChanges() {
    try {
      console.log('🔍 Checking for pod changes (hybrid approach)...');
      
      if (!this.isInitialized || !this.initialSnapshot) {
        console.log('⚠️ No initial snapshot available, taking one now...');
        await this.takeInitialSnapshot();
        return;
      }
      
      // Get current pods from Kubernetes
      const currentPods = await kubernetesService.getAllPods();
      const currentPodMap = this.createPodMap(currentPods);
      
      // Load previous pods state
      const previousPods = this.loadPreviousPodsState();
      const previousPodMap = this.createPodMap(previousPods);
      
      // Load current down pods
      const currentDownPods = this.loadDownPods();
      
      // HYBRID DETECTION: Use both approaches
      const changes = await this.detectHybridChanges(
        this.initialSnapshot,
        previousPodMap,
        currentPodMap,
        currentDownPods
      );
      
      // Process changes if any detected
      if (changes.newDownPods.length > 0 || changes.recoveredPods.length > 0) {
        await this.processChanges(changes);
      }
      
      // Save current state for next rolling comparison
      this.savePreviousPodsState(currentPods);
      
      console.log(`✅ Hybrid check completed - ${changes.newDownPods.length} new down, ${changes.recoveredPods.length} recovered`);
      
    } catch (error) {
      console.error('❌ Hybrid pod monitoring check failed:', error);
    }
  }

  async detectHybridChanges(initialSnapshot, previousPodMap, currentPodMap, currentDownPods) {
    const newDownPods = [];
    const recoveredPods = [];
    const stillDownPods = [];

    console.log('🔍 Hybrid Detection: Checking against both snapshot and previous state...');

    // APPROACH 1: SNAPSHOT-BASED DETECTION
    // Check if pods from initial healthy snapshot are now missing/unhealthy
    for (const snapshotPod of initialSnapshot.pods) {
      const podKey = snapshotPod.key;
      const currentPod = currentPodMap.get(podKey);
      const isAlreadyTrackedDown = currentDownPods.some(dp => dp.key === podKey);
      
      if (!isAlreadyTrackedDown) {
        let shouldMarkDown = false;
        let reason = '';
        
        if (!currentPod) {
          // Pod from snapshot disappeared
          shouldMarkDown = true;
          reason = 'Pod disappeared (was healthy at startup)';
        } else if (!this.isPodHealthy(currentPod)) {
          // Pod from snapshot became unhealthy
          shouldMarkDown = true;
          reason = `Pod unhealthy: ${currentPod.status} (was healthy at startup)`;
        }
        
        if (shouldMarkDown) {
          console.log(`📸 Snapshot detection: ${podKey} went down (${reason})`);
          newDownPods.push({
            key: podKey,
            name: snapshotPod.name,
            namespace: snapshotPod.namespace,
            reason: reason,
            lastStatus: snapshotPod.status,
            downTime: new Date().toISOString(),
            node: snapshotPod.node,
            detectionMethod: 'snapshot',
            wasHealthyAtStartup: true
          });
        }
      }
    }

    // APPROACH 2: ROLLING DETECTION  
    // Check for pods that went down since previous check (immediate detection)
    for (const [podKey, previousPod] of previousPodMap) {
      const currentPod = currentPodMap.get(podKey);
      const isAlreadyTrackedDown = currentDownPods.some(dp => dp.key === podKey);
      const wasInSnapshot = initialSnapshot.pods.some(sp => sp.key === podKey);
      
      if (!isAlreadyTrackedDown && !newDownPods.some(np => np.key === podKey)) {
        let shouldMarkDown = false;
        let reason = '';
        
        if (!currentPod && this.isPodHealthy(previousPod)) {
          // Pod disappeared since last check
          shouldMarkDown = true;
          reason = 'Pod disappeared (rolling detection)';
        } else if (currentPod && this.isPodHealthy(previousPod) && !this.isPodHealthy(currentPod)) {
          // Pod became unhealthy since last check
          shouldMarkDown = true;
          reason = `Pod became unhealthy: ${currentPod.status} (rolling detection)`;
        }
        
        if (shouldMarkDown) {
          console.log(`🔄 Rolling detection: ${podKey} went down (${reason})`);
          newDownPods.push({
            key: podKey,
            name: previousPod.name,
            namespace: previousPod.namespace,
            reason: reason,
            lastStatus: previousPod.status,
            downTime: new Date().toISOString(),
            node: previousPod.node,
            detectionMethod: 'rolling',
            wasHealthyAtStartup: wasInSnapshot
          });
        }
      }
    }

    // RECOVERY DETECTION
    // Check for pods that recovered (from down pods list)
    for (const downPod of currentDownPods) {
      const currentPod = currentPodMap.get(downPod.key);
      
      if (currentPod && this.isPodHealthy(currentPod)) {
        // Pod recovered
        const downDuration = this.calculateDowntime(downPod.downTime);
        console.log(`✅ Recovery detected: ${downPod.key} back up (${downDuration})`);
        
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
      stillDownPods,
      detectionSummary: {
        snapshotDetections: newDownPods.filter(p => p.detectionMethod === 'snapshot').length,
        rollingDetections: newDownPods.filter(p => p.detectionMethod === 'rolling').length,
        totalRecoveries: recoveredPods.length
      }
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
        age: pod.age,
        restarts: pod.restarts || 0
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
      await this.sendHybridPodStatusAlert({
        newDownPods,
        recoveredPods,
        currentDownPods: updatedDownPods,
        allPodsUp: updatedDownPods.length === 0,
        detectionSummary: changes.detectionSummary
      }, config.emailGroupId);
    }
  }

  async sendHybridPodStatusAlert(alertData, emailGroupId) {
    try {
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == emailGroupId);
      
      if (!targetGroup || !targetGroup.enabled) {
        console.log('❌ Email group not found or disabled for hybrid pod alerts');
        return false;
      }

      const { newDownPods, recoveredPods, currentDownPods, allPodsUp, detectionSummary } = alertData;
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
        html: this.generateHybridAlertEmail({
          alertType,
          headerColor,
          newDownPods,
          recoveredPods,
          currentDownPods,
          allPodsUp,
          timestamp,
          targetGroup,
          detectionSummary
        })
      };

      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 ✅ Hybrid pod status alert sent: ${alertType}`);
      return true;
      
    } catch (error) {
      console.error('📧 ❌ Failed to send hybrid pod status alert:', error);
      return false;
    }
  }

  generateHybridAlertEmail(data) {
    const { alertType, headerColor, newDownPods, recoveredPods, currentDownPods, allPodsUp, timestamp, targetGroup, detectionSummary } = data;
    
    const statusIcon = allPodsUp ? '✅' : (newDownPods.length > 0 ? '🚨' : '🔄');
    const statusText = allPodsUp ? 'ALL PODS OPERATIONAL' : 
                      (newDownPods.length > 0 ? 'POD FAILURES DETECTED' : 'POD STATUS CHANGES');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background-color: ${headerColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">${statusIcon} ${statusText}</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">Hybrid Pod Monitoring Alert (Snapshot + Rolling Detection)</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px;">
          ${this.generateHybridSummarySection(newDownPods, recoveredPods, currentDownPods, allPodsUp, detectionSummary)}
          
          ${newDownPods.length > 0 ? this.generateHybridNewDownPodsSection(newDownPods) : ''}
          ${recoveredPods.length > 0 ? this.generateHybridRecoveredPodsSection(recoveredPods) : ''}
          ${currentDownPods.length > 0 && !allPodsUp ? this.generateHybridCurrentDownPodsSection(currentDownPods) : ''}
          
          ${allPodsUp ? this.generateAllUpSection() : this.generateHybridActionSection()}
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Alert sent to: ${targetGroup.name}</p>
          <p style="margin: 5px 0 0 0;">Generated at: ${timestamp.toLocaleString()}</p>
          <p style="margin: 5px 0 0 0;">Hybrid Pod Monitoring • Snapshot + Rolling Detection • 1-minute checks</p>
        </div>
      </div>
    `;
  }

  generateHybridSummarySection(newDownPods, recoveredPods, currentDownPods, allPodsUp, detectionSummary) {
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
      
      <div style="background-color: #e3f2fd; border: 1px solid #90caf9; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; color: #1565c0;">🔬 Hybrid Detection Summary</h3>
        <ul style="color: #1565c0; margin: 10px 0; font-size: 14px;">
          <li><strong>Snapshot Detection:</strong> ${detectionSummary.snapshotDetections} pods (vs startup baseline)</li>
          <li><strong>Rolling Detection:</strong> ${detectionSummary.rollingDetections} pods (vs previous minute)</li>
          <li><strong>Total Recoveries:</strong> ${detectionSummary.totalRecoveries} pods back online</li>
        </ul>
        <p style="color: #1565c0; margin: 5px 0 0 0; font-size: 12px; font-style: italic;">
          Hybrid monitoring provides both immediate detection and baseline health tracking
        </p>
      </div>
    `;
  }

  generateHybridNewDownPodsSection(newDownPods) {
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
                <th style="padding: 12px; text-align: left;">Detection</th>
                <th style="padding: 12px; text-align: left;">Down Since</th>
              </tr>
            </thead>
            <tbody>
              ${newDownPods.map((pod, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                  <td style="padding: 12px; font-weight: bold;">
                    ${pod.name}
                    ${pod.wasHealthyAtStartup ? '<br><span style="font-size: 10px; color: #28a745;">✅ Was healthy at startup</span>' : '<br><span style="font-size: 10px; color: #ff7f00;">⚠️ Not in startup baseline</span>'}
                  </td>
                  <td style="padding: 12px;">${pod.namespace}</td>
                  <td style="padding: 12px;">${pod.reason}</td>
                  <td style="padding: 12px;">
                    <span style="background: ${pod.detectionMethod === 'snapshot' ? '#2196f3' : '#ff9800'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">
                      ${pod.detectionMethod === 'snapshot' ? '📸 SNAPSHOT' : '🔄 ROLLING'}
                    </span>
                  </td>
                  <td style="padding: 12px; font-size: 12px;">${new Date(pod.downTime).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  generateHybridRecoveredPodsSection(recoveredPods) {
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

  generateHybridCurrentDownPodsSection(currentDownPods) {
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
                <th style="padding: 12px; text-align: left;">Detection Method</th>
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
                    <td style="padding: 12px;">
                      <span style="background: ${pod.detectionMethod === 'snapshot' ? '#2196f3' : '#ff9800'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">
                        ${pod.detectionMethod === 'snapshot' ? '📸 SNAPSHOT' : '🔄 ROLLING'}
                      </span>
                    </td>
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
          <li>Both snapshot baseline and rolling checks show green status</li>
          <li>Cluster is fully operational</li>
          <li>Hybrid monitoring will continue automatically</li>
        </ul>
      </div>
    `;
  }

  generateHybridActionSection() {
    return `
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; color: #856404;">⚠️ Recommended Actions</h3>
        <ul style="color: #856404; margin: 10px 0;">
          <li><strong>Snapshot detections:</strong> Check for infrastructure issues affecting baseline health</li>
          <li><strong>Rolling detections:</strong> May indicate recent deployments or temporary issues</li>
          <li>Check pod logs: <code>kubectl logs &lt;pod-name&gt; -n &lt;namespace&gt;</code></li>
          <li>Describe pod events: <code>kubectl describe pod &lt;pod-name&gt; -n &lt;namespace&gt;</code></li>
          <li>Review recent cluster changes and deployments</li>
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

  loadInitialSnapshot() {
    try {
      if (fs.existsSync(this.initialSnapshotFile)) {
        const data = fs.readFileSync(this.initialSnapshotFile, 'utf8');
        const snapshot = JSON.parse(data);
        this.initialSnapshot = snapshot;
        this.isInitialized = true;
        return snapshot;
      }
    } catch (error) {
      console.error('Error loading initial snapshot file:', error);
    }
    return null;
  }

  saveInitialSnapshot(snapshot) {
    try {
      fs.writeFileSync(this.initialSnapshotFile, JSON.stringify(snapshot, null, 2));
      console.log('💾 Initial snapshot saved to file');
    } catch (error) {
      console.error('Error saving initial snapshot file:', error);
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

  clearInitialSnapshot() {
    try {
      if (fs.existsSync(this.initialSnapshotFile)) {
        fs.unlinkSync(this.initialSnapshotFile);
      }
      this.initialSnapshot = null;
      this.isInitialized = false;
      console.log('🗑️ Initial snapshot cleared');
      return true;
    } catch (error) {
      console.error('Error clearing initial snapshot:', error);
      return false;
    }
  }

  async retakeSnapshot() {
    try {
      console.log('🔄 Retaking initial snapshot...');
      this.clearInitialSnapshot();
      await this.takeInitialSnapshot();
      return true;
    } catch (error) {
      console.error('Error retaking snapshot:', error);
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
      lastCheck: new Date(),
      hybrid: {
        isInitialized: this.isInitialized,
        hasSnapshot: !!this.initialSnapshot,
        snapshotTimestamp: this.initialSnapshot?.timestamp,
        snapshotHealthyPods: this.initialSnapshot?.healthyPods,
        snapshotTotalPods: this.initialSnapshot?.totalPods
      }
    };
  }

  getInitialSnapshot() {
    return this.initialSnapshot;
  }

  // Manual trigger for testing
  async manualCheck() {
    console.log('🔍 Manual hybrid pod check triggered');
    await this.checkPodChanges();
  }

  // Enhanced testing method
  async sendTestHybridAlert(alertType = 'mixed') {
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
            reason: 'Test recovery - Snapshot detection',
            downTime: new Date(Date.now() - 900000).toISOString(),
            recoveryTime: new Date().toISOString(),
            downDuration: '15m',
            currentStatus: 'Running',
            detectionMethod: 'snapshot',
            wasHealthyAtStartup: true
          },
          {
            key: 'test-namespace/test-pod-2',
            name: 'test-pod-2',
            namespace: 'test-namespace',
            reason: 'Test recovery - Rolling detection',
            downTime: new Date(Date.now() - 300000).toISOString(),
            recoveryTime: new Date().toISOString(),
            downDuration: '5m',
            currentStatus: 'Running',
            detectionMethod: 'rolling',
            wasHealthyAtStartup: false
          }
        ],
        currentDownPods: [],
        allPodsUp: true,
        detectionSummary: {
          snapshotDetections: 0,
          rollingDetections: 0,
          totalRecoveries: 2
        }
      };
    } else {
      // Mixed alert
      testAlertData = {
        newDownPods: [
          {
            key: 'test-namespace/test-pod-down-1',
            name: 'test-pod-down-1',
            namespace: 'test-namespace',
            reason: 'Test alert - Pod disappeared (snapshot detection)',
            lastStatus: 'Running',
            downTime: new Date().toISOString(),
            node: 'test-node-1',
            detectionMethod: 'snapshot',
            wasHealthyAtStartup: true
          },
          {
            key: 'test-namespace/test-pod-down-2',
            name: 'test-pod-down-2',
            namespace: 'test-namespace',
            reason: 'Test alert - Pod unhealthy (rolling detection)',
            lastStatus: 'Running',
            downTime: new Date().toISOString(),
            node: 'test-node-2',
            detectionMethod: 'rolling',
            wasHealthyAtStartup: false
          }
        ],
        recoveredPods: [
          {
            key: 'test-namespace/test-pod-recovered',
            name: 'test-pod-recovered',
            namespace: 'test-namespace',
            reason: 'Test recovery',
            downTime: new Date(Date.now() - 600000).toISOString(),
            recoveryTime: new Date().toISOString(),
            downDuration: '10m',
            currentStatus: 'Running',
            detectionMethod: 'snapshot',
            wasHealthyAtStartup: true
          }
        ],
        currentDownPods: [
          {
            key: 'test-namespace/test-pod-still-down',
            name: 'test-pod-still-down',
            namespace: 'test-namespace',
            reason: 'Test alert - Still down',
            downTime: new Date(Date.now() - 1200000).toISOString(),
            node: 'test-node-3',
            detectionMethod: 'snapshot',
            wasHealthyAtStartup: true
          }
        ],
        allPodsUp: false,
        detectionSummary: {
          snapshotDetections: 1,
          rollingDetections: 1,
          totalRecoveries: 1
        }
      };
    }

    return await this.sendHybridPodStatusAlert(testAlertData, config.emailGroupId);
  }
}

module.exports = new HybridSinglePodMonitoringService();