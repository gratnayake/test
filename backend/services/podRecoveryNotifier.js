// backend/services/podRecoveryNotifier.js
// Custom service to send immediate email when pods recover

const fs = require('fs');
const path = require('path');
const emailService = require('./emailService');
const kubernetesConfigService = require('./kubernetesConfigService');

class PodRecoveryNotifier {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.lastKnownPodsFile = path.join(this.dataDir, 'last-known-pods.json');
    this.recoveryStateFile = path.join(this.dataDir, 'recovery-state.json');
    this.isWatching = false;
    this.fileWatcher = null;
    this.debounceTimer = null;
    this.ensureDataDirectory();
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Start watching the last-known-pods.json file
  startWatching() {
    if (this.isWatching) {
      console.log('⚠️ Pod recovery notifier already watching');
      return;
    }

    console.log('👁️ Starting to watch last-known-pods.json for changes...');
    
    // Watch the file for changes
    this.fileWatcher = fs.watch(this.lastKnownPodsFile, (eventType) => {
      if (eventType === 'change') {
        // Debounce to avoid multiple triggers
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          console.log('📄 last-known-pods.json changed, checking pod status...');
          this.checkAndNotifyRecovery();
        }, 2000); // Wait 2 seconds to ensure file write is complete
      }
    });

    this.isWatching = true;
    
    // Do an initial check
    this.checkAndNotifyRecovery();
  }

  // Stop watching
  stopWatching() {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    clearTimeout(this.debounceTimer);
    this.isWatching = false;
    console.log('🛑 Stopped watching last-known-pods.json');
  }

  // Load the last known pods state
  loadLastKnownPods() {
    try {
      if (fs.existsSync(this.lastKnownPodsFile)) {
        const data = fs.readFileSync(this.lastKnownPodsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load last-known-pods:', error);
    }
    return { pods: [], timestamp: null };
  }

  // Load recovery state to track if we've already sent email
  loadRecoveryState() {
    try {
      if (fs.existsSync(this.recoveryStateFile)) {
        const data = fs.readFileSync(this.recoveryStateFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load recovery state:', error);
    }
    return { lastEmailSent: null, lastDownPods: [], lastPodCount: 0 };
  }

  // Save recovery state
  saveRecoveryState(state) {
    try {
      fs.writeFileSync(this.recoveryStateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Failed to save recovery state:', error);
    }
  }

  // Check if pods have recovered and send email
  async checkAndNotifyRecovery() {
    try {
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured || !config.emailGroupId) {
        console.log('⚠️ Kubernetes not configured or no email group set for notifications');
        return;
      }

      // Get current pods from last-known-pods file
      const lastKnownState = this.loadLastKnownPods();
      const recoveryState = this.loadRecoveryState();
      
      if (!lastKnownState.pods || lastKnownState.pods.length === 0) {
        console.log('No pods data in last-known-pods file');
        return;
      }

      // Analyze pod states
      const currentTime = new Date();
      const downPods = [];
      const runningPods = [];
      const allPods = lastKnownState.pods;

      allPods.forEach(pod => {
        if (pod.status === 'Running' && pod.ready) {
          runningPods.push(pod);
        } else {
          downPods.push(pod);
        }
      });

      console.log(`📊 Pod Status: ${runningPods.length}/${allPods.length} running`);

      // Check conditions for sending email
      const hadDownPods = recoveryState.lastDownPods.length > 0;
      const allPodsRunning = downPods.length === 0 && runningPods.length > 0;
      const podCountIncreased = runningPods.length > recoveryState.lastPodCount;
      
      // Calculate time since last email
      const timeSinceLastEmail = recoveryState.lastEmailSent 
        ? (currentTime - new Date(recoveryState.lastEmailSent)) / 1000 / 60 // minutes
        : Infinity;

      // Send email if:
      // 1. We had down pods before OR pod count increased (new pods started)
      // 2. All pods are now running
      // 3. We haven't sent an email in the last 5 minutes (to avoid spam)
      if ((hadDownPods || podCountIncreased) && allPodsRunning && timeSinceLastEmail > 5) {
        console.log('✅ All pods are running! Sending notification email...');
        
        // Calculate recovery details
        const recoveryDetails = this.calculateRecoveryDetails(
          recoveryState.lastDownPods,
          runningPods,
          recoveryState.lastPodCount
        );

        // Send the email
        const emailSent = await this.sendRecoveryEmail(
          config.emailGroupId,
          runningPods,
          recoveryDetails
        );

        if (emailSent) {
          // Update recovery state
          this.saveRecoveryState({
            lastEmailSent: currentTime.toISOString(),
            lastDownPods: [],
            lastPodCount: runningPods.length
          });
          console.log('📧 Recovery email sent successfully!');
        }
      } else if (!allPodsRunning) {
        // Update the list of down pods
        this.saveRecoveryState({
          lastEmailSent: recoveryState.lastEmailSent,
          lastDownPods: downPods.map(p => ({
            name: p.name,
            namespace: p.namespace,
            timestamp: currentTime.toISOString()
          })),
          lastPodCount: runningPods.length
        });
        console.log(`⚠️ ${downPods.length} pods still down, tracking state...`);
      } else if (allPodsRunning && !hadDownPods && !podCountIncreased) {
        // All pods running but no change detected
        console.log('✅ All pods running (no change detected)');
        // Update pod count for future comparison
        if (runningPods.length !== recoveryState.lastPodCount) {
          this.saveRecoveryState({
            ...recoveryState,
            lastPodCount: runningPods.length
          });
        }
      }

    } catch (error) {
      console.error('❌ Error in pod recovery check:', error);
    }
  }

  // Calculate recovery details
  calculateRecoveryDetails(lastDownPods, currentRunningPods, lastPodCount) {
    const recoveredPods = [];
    const newPods = [];
    
    // Check for recovered pods
    lastDownPods.forEach(downPod => {
      const recovered = currentRunningPods.find(p => 
        p.name === downPod.name && p.namespace === downPod.namespace
      );
      if (recovered) {
        const downTime = new Date() - new Date(downPod.timestamp);
        recoveredPods.push({
          ...recovered,
          downtime: this.formatDuration(downTime)
        });
      }
    });

    // Check for new pods (pod count increased)
    if (currentRunningPods.length > lastPodCount) {
      const newPodCount = currentRunningPods.length - lastPodCount;
      newPods.push(...currentRunningPods.slice(-newPodCount));
    }

    return {
      recoveredCount: recoveredPods.length,
      newCount: newPods.length,
      totalRunning: currentRunningPods.length,
      pods: recoveredPods,
      newPods: newPods
    };
  }

  // Format duration in human-readable format
  formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
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

  // Send recovery email
  async sendRecoveryEmail(emailGroupId, runningPods, recoveryDetails) {
    try {
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        console.log('⚠️ No valid email group found for alerts');
        return false;
      }

      const currentTime = new Date();
      const subject = recoveryDetails.newCount > 0
        ? `✅ Kubernetes: ${recoveryDetails.newCount} new pods started - Total ${runningPods.length} running`
        : `✅ Kubernetes: All Pods Recovered - ${runningPods.length} pods running`;

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: subject,
        html: this.generateRecoveryEmailContent(
          targetGroup.name,
          runningPods,
          recoveryDetails,
          currentTime
        )
      };

      await emailService.transporter.sendMail(mailOptions);
      return true;

    } catch (error) {
      console.error('📧 ❌ Failed to send recovery email:', error);
      return false;
    }
  }

  // Generate email content
  generateRecoveryEmailContent(groupName, runningPods, recoveryDetails, timestamp) {
    // Group pods by namespace
    const podsByNamespace = {};
    runningPods.forEach(pod => {
      if (!podsByNamespace[pod.namespace]) {
        podsByNamespace[pod.namespace] = [];
      }
      podsByNamespace[pod.namespace].push(pod);
    });

    const title = recoveryDetails.newCount > 0 
      ? `${recoveryDetails.newCount} NEW PODS STARTED`
      : 'ALL PODS RECOVERED';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">✅ ${title}</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">All Kubernetes pods are now running successfully</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px;">
          <h2 style="margin-top: 0; color: #28a745;">Status Summary</h2>
          
          <div style="background-color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Total Running Pods:</td>
                <td style="padding: 8px; color: #28a745; font-weight: bold; font-size: 18px;">
                  ${runningPods.length}
                </td>
              </tr>
              ${recoveryDetails.recoveredCount > 0 ? `
              <tr>
                <td style="padding: 8px; font-weight: bold;">Recovered Pods:</td>
                <td style="padding: 8px;">${recoveryDetails.recoveredCount}</td>
              </tr>
              ` : ''}
              ${recoveryDetails.newCount > 0 ? `
              <tr>
                <td style="padding: 8px; font-weight: bold;">New Pods Started:</td>
                <td style="padding: 8px; color: #007bff; font-weight: bold;">${recoveryDetails.newCount}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px; font-weight: bold;">Notification Time:</td>
                <td style="padding: 8px;">${timestamp.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Alert Group:</td>
                <td style="padding: 8px;">${groupName}</td>
              </tr>
            </table>
          </div>

          <h3 style="color: #333; margin-top: 20px;">Running Pods by Namespace</h3>
          ${Object.entries(podsByNamespace).map(([namespace, pods]) => `
            <div style="margin-bottom: 15px;">
              <h4 style="color: #666; margin-bottom: 10px;">📁 ${namespace} (${pods.length} pods)</h4>
              <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 4px;">
                <thead>
                  <tr style="background-color: #f8f9fa;">
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Pod Name</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Status</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Node</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Age</th>
                  </tr>
                </thead>
                <tbody>
                  ${pods.map((pod, index) => {
                    const isNew = recoveryDetails.newPods.some(np => 
                      np.name === pod.name && np.namespace === pod.namespace
                    );
                    return `
                    <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
                      <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">
                        ${pod.name}
                        ${isNew ? '<span style="color: #007bff; font-weight: bold;"> (NEW)</span>' : ''}
                      </td>
                      <td style="padding: 8px; border-bottom: 1px solid #dee2e6; color: #28a745;">
                        🟢 Running
                      </td>
                      <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${pod.node || 'N/A'}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${pod.age || 'N/A'}</td>
                    </tr>
                  `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `).join('')}

          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: #155724;">✅ Status Update</h3>
            <ul style="color: #155724; margin: 10px 0;">
              <li>All pods are now running and healthy</li>
              <li>Kubernetes cluster is fully operational</li>
              <li>Monitoring will continue automatically</li>
              <li>You will be notified of any future changes</li>
            </ul>
          </div>
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Alert sent to: ${groupName}</p>
          <p style="margin: 5px 0 0 0;">Pod Recovery Notification System - Triggered by last-known-pods.json update</p>
        </div>
      </div>
    `;
  }
}

module.exports = new PodRecoveryNotifier();