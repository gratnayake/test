// backend/services/kubernetesMonitoringService.js - COMPLETE ENHANCED VERSION
// Enhanced Workload Monitoring with Comprehensive Status Alerts

const cron = require('node-cron');
const emailService = require('./emailService');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');

class KubernetesMonitoringService {
  constructor() {
    // Replace pod tracking with workload tracking
    this.workloadStatuses = new Map(); // Track workloads instead of individual pods
    this.nodeStatuses = new Map();
    this.emailSentStatus = new Map();
    this.isMonitoring = false;
    this.checkInterval = null;
    this.isInitialized = false;
    this.initializationComplete = false;
    
    
    this.pendingAlerts = {
      failed: [],
      degraded: [],
      recovered: [],
      stopped: [],     // For intentional stops (mtctl)
      started: []      // For intentional starts
    };
    this.alertBatchTimeout = null;
    this.batchDelayMs = 5000; // Wait 30 seconds before sending batch
    this.immediateAlertThreshold = 3;
    this.podRestartTracking = new Map(); // Track individual pod restart counts
    this.restartAlertConfig = {
      enabled: true,
      threshold: 1, // Alert on any restart (set higher to be less noisy)
      cooldownMs: 300000 // 5 minutes - don't alert again for same pod
    };


    // Check every 2 minutes
    this.checkFrequency = '*/2 * * * *';
    
    console.log('☸️ Kubernetes Monitoring Service initialized (Enhanced with Comprehensive Alerts)');
  }

  // Keep existing method signatures for compatibility
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Kubernetes monitoring already running');
      return false;
    }

    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('❌ Cannot start Kubernetes monitoring - not configured');
      return false;
    }

    console.log(`☸️ Starting Kubernetes monitoring with baseline detection...`);
    
    this.checkInterval = cron.schedule(this.checkFrequency, async () => {
      await this.checkPodHealth();
      await this.checkNodeHealth();
    }, {
      scheduled: false
    });

    this.checkInterval.start();
    this.isMonitoring = true;

    // ENHANCED: Perform baseline initialization
    setTimeout(async () => {
      await this.performBaselineInitialization();
    }, 5000);

    return true;
  }

  async performBaselineInitialization() {
    try {
      console.log('🎯 Performing baseline initialization...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        console.log('⚠️ Kubernetes not configured - skipping baseline initialization');
        return;
      }

      // Get initial workload status
      const initialWorkloads = await this.getWorkloadStatus();
      
      console.log(`📊 Baseline: Found ${initialWorkloads.length} workloads`);

      // Store initial state without triggering alerts
      for (const workload of initialWorkloads) {
        const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
        
        this.workloadStatuses.set(workloadKey, {
          ...workload,
          lastSeen: new Date(),
          isBaseline: true  // Mark as baseline data
        });

        // Log baseline status for transparency
        const healthyPods = workload.pods.filter(p => p.ready && p.status === 'Running').length;
        const totalPods = workload.pods.length;
        
        console.log(`📋 Baseline: ${workloadKey} - ${healthyPods}/${totalPods} healthy - Status: ${workload.status}`);
      }

      // Mark initialization as complete after a grace period
      setTimeout(() => {
        this.initializationComplete = true;
        console.log('✅ Baseline initialization complete - monitoring active for changes only');
      }, 60000); // 1 minute grace period

      console.log('🎯 Baseline captured - will monitor for changes after 1 minute grace period');

    } catch (error) {
      console.error('❌ Baseline initialization failed:', error);
      // Continue monitoring anyway
      this.initializationComplete = true;
    }
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Kubernetes monitoring not running');
      return false;
    }

    console.log('🛑 Stopping Kubernetes monitoring');
    
    if (this.checkInterval) {
      this.checkInterval.stop();
      this.checkInterval = null;
    }
    
    // Clear any pending batch alerts
    this.clearPendingAlerts();
    
    this.isMonitoring = false;
    return true;
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      initializationComplete: this.initializationComplete,
      podCount: this.getTotalPodCount(),
      nodeCount: this.nodeStatuses.size,
      workloadCount: this.workloadStatuses.size,
      pendingAlerts: this.getTotalPendingAlerts(),
      lastCheck: new Date(),
      baselineWorkloads: Array.from(this.workloadStatuses.values()).filter(w => w.isBaseline).length,
      restartTracking: {
      enabled: this.restartAlertConfig.enabled,
      threshold: this.restartAlertConfig.threshold,
      cooldownMinutes: this.restartAlertConfig.cooldownMs / 60000,
      trackedPods: this.podRestartTracking.size
    }
    };
  }

  getTotalPodCount() {
    let totalPods = 0;
    for (const [key, workload] of this.workloadStatuses) {
      if (workload.pods) {
        totalPods += workload.pods.length;
      }
    }
    return totalPods;
  }

  resetMonitoringState() {
    console.log('🔄 Resetting Kubernetes monitoring state...');
    
    // Clear all cached workload statuses
    this.workloadStatuses.clear();
    
    // Clear all cached node statuses
    this.nodeStatuses.clear();
    
    // Clear all email sent statuses
    this.emailSentStatus.clear();
    
    // Clear any pending alerts
    this.clearPendingAlerts();
    
    this.podRestartTracking.clear();
    
    console.log('✅ Monitoring state reset complete - fresh start');
  }

  async trackPodRestarts(currentPods, emailGroupId) {
  if (!this.restartAlertConfig.enabled || !emailGroupId) {
    return;
  }

  console.log('🔄 Checking for pod restarts...');

  for (const pod of currentPods) {
    const podKey = `${pod.namespace}/${pod.name}`;
    const currentRestarts = pod.restarts || 0;
    const previousData = this.podRestartTracking.get(podKey);

    if (previousData) {
      const previousRestarts = previousData.restarts;
      
      // Check if restart count increased
      if (currentRestarts > previousRestarts) {
        const restartsIncrease = currentRestarts - previousRestarts;
        
        console.log(`🔄 Pod restarted: ${podKey} (${restartsIncrease} new restarts, ${currentRestarts} total)`);
        
        // Check cooldown period
        const now = new Date();
        const lastAlertTime = previousData.lastAlertTime;
        const timeSinceLastAlert = lastAlertTime ? now.getTime() - lastAlertTime.getTime() : Infinity;
        
        // Send alert if threshold met and cooldown passed
        if (restartsIncrease >= this.restartAlertConfig.threshold && 
            timeSinceLastAlert >= this.restartAlertConfig.cooldownMs) {
          
          console.log(`📧 Sending restart alert for ${podKey}`);
          await this.sendPodRestartEmail(pod, restartsIncrease, emailGroupId);
          
          // Update last alert time
          this.podRestartTracking.set(podKey, {
            restarts: currentRestarts,
            lastSeen: now,
            lastAlertTime: now
          });
        } else {
          // Update restart count but don't alert (cooldown or threshold not met)
          this.podRestartTracking.set(podKey, {
            ...previousData,
            restarts: currentRestarts,
            lastSeen: now
          });
          
          if (timeSinceLastAlert < this.restartAlertConfig.cooldownMs) {
            console.log(`⏰ Restart alert suppressed for ${podKey} (cooldown: ${Math.round((this.restartAlertConfig.cooldownMs - timeSinceLastAlert) / 1000)}s remaining)`);
          }
        }
      } else {
        // No restart, just update last seen
        this.podRestartTracking.set(podKey, {
          ...previousData,
          lastSeen: new Date()
        });
      }
    } else {
      // First time seeing this pod
      this.podRestartTracking.set(podKey, {
        restarts: currentRestarts,
        lastSeen: new Date(),
        lastAlertTime: null
      });
      
      console.log(`👀 First time tracking pod: ${podKey} (${currentRestarts} restarts)`);
    }
  }

  // Cleanup old pod tracking (pods that haven't been seen in 30 minutes)
  this.cleanupOldPodTracking();
}

configureRestartAlerts(enabled = true, threshold = 1, cooldownMinutes = 5) {
  this.restartAlertConfig = {
    enabled: enabled,
    threshold: threshold,
    cooldownMs: cooldownMinutes * 60 * 1000
  };
  
  console.log(`🔧 Restart alert configuration updated:`, this.restartAlertConfig);
}

cleanupOldPodTracking() {
  const now = new Date();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [podKey, data] of this.podRestartTracking) {
    const age = now.getTime() - data.lastSeen.getTime();
    if (age > maxAge) {
      console.log(`🗑️ Cleaning up old pod tracking: ${podKey} (last seen ${Math.round(age / 60000)} minutes ago)`);
      this.podRestartTracking.delete(podKey);
    }
  }
}
async sendPodRestartEmail(pod, restartsIncrease, emailGroupId) {
  try {
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == emailGroupId);
    
    if (!targetGroup || !targetGroup.enabled) {
      console.log('❌ Email group not found or disabled for restart alert');
      return;
    }

    const podKey = `${pod.namespace}/${pod.name}`;
    const totalRestarts = pod.restarts || 0;
    const timestamp = new Date();

    const subject = `🔄 Kubernetes Pod Restart Alert: ${pod.name}`;

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #ff7f00; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🔄 POD RESTART ALERT</h1>
            <p style="margin: 8px 0 0 0; font-size: 16px;">Kubernetes pod has restarted</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px;">
            <h2 style="margin-top: 0; color: #333;">Pod Details</h2>
            
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
              <tbody>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Pod Name:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${pod.name}</td>
                </tr>
                <tr style="background-color: white;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Namespace:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${pod.namespace}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Current Status:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">
                    <span style="background: ${pod.status === 'Running' ? '#28a745' : '#dc3545'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                      ${pod.status}
                    </span>
                  </td>
                </tr>
                <tr style="background-color: white;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">New Restarts:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">
                    <span style="background: #ff7f00; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
                      +${restartsIncrease}
                    </span>
                  </td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Total Restarts:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${totalRestarts}</td>
                </tr>
                <tr style="background-color: white;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Node:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${pod.node || 'Unknown'}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 12px; font-weight: bold;">Ready:</td>
                  <td style="padding: 12px;">
                    <span style="color: ${pod.ready ? '#28a745' : '#dc3545'}; font-weight: bold;">
                      ${pod.ready ? '✅ Yes' : '❌ No'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⚠️ Recommended Actions</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li><strong>Check pod logs:</strong> <code>kubectl logs ${pod.namespace}/${pod.name}</code></li>
                <li><strong>Check pod events:</strong> <code>kubectl describe pod ${pod.name} -n ${pod.namespace}</code></li>
                <li><strong>Monitor pattern:</strong> Multiple restarts may indicate a deeper issue</li>
                <li><strong>Resource limits:</strong> Check if pod is hitting memory/CPU limits</li>
                <li><strong>Health checks:</strong> Verify liveness and readiness probes</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">Restart alert sent to: ${targetGroup.name}</p>
            <p style="margin: 5px 0 0 0;">Generated at: ${timestamp.toLocaleString()}</p>
            <p style="margin: 5px 0 0 0;">Kubernetes Pod Restart Monitoring • Individual Pod Alerts</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log(`📧 ✅ Pod restart alert sent for ${podKey}`);

  } catch (error) {
    console.error(`📧 ❌ Failed to send pod restart alert for ${pod.namespace}/${pod.name}:`, error);
  }
}
  async performBaselineCheck() {
    try {
      console.log('📊 Performing baseline health check (no alerts)...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        console.log('⚠️ Kubernetes not configured - skipping baseline check');
        return;
      }

      // Get current workload status
      const currentWorkloads = await this.getWorkloadStatus();
      
      // Store as baseline without triggering alerts
      for (const workload of currentWorkloads) {
        const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
        
        this.workloadStatuses.set(workloadKey, {
          ...workload,
          lastSeen: new Date(),
          isBaseline: true // Mark as baseline
        });
        
        console.log(`📋 Baseline: ${workloadKey} = ${workload.status} (${workload.readyReplicas}/${workload.desiredReplicas})`);
      }

      console.log(`✅ Baseline established for ${currentWorkloads.length} workloads`);

    } catch (error) {
      console.error('❌ Baseline check failed:', error);
    }
  }


  // Enhanced checkPodHealth - now monitors workloads
async checkPodHealth() {
  try {
    console.log('☸️ Checking Kubernetes workload health...');
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('⚠️ Kubernetes not configured - skipping workload health check');
      return;
    }

    console.log(`📧 Email group configured: ${config.emailGroupId || 'None'}`);

    // Get current pods directly (simpler approach)
    const currentPods = await kubernetesService.getAllPods();
    console.log(`✅ Retrieved ${currentPods.length} pods from cluster`);

    console.log(`🔍 DEBUG: About to call trackPodRestarts with emailGroupId: ${config.emailGroupId}`);
    console.log(`🔍 DEBUG: restartAlertConfig exists:`, !!this.restartAlertConfig);
    console.log(`🔍 DEBUG: podRestartTracking exists:`, !!this.podRestartTracking);

    // Track pod restarts BEFORE workload analysis
    try {
      await this.trackPodRestarts(currentPods, config.emailGroupId);
      console.log(`🔍 DEBUG: trackPodRestarts completed successfully`);
    } catch (error) {
      console.log(`🔍 DEBUG: trackPodRestarts failed:`, error);
    }

    // Group pods by workload for comparison - DECLARE currentWorkloads HERE
    const currentWorkloads = this.groupPodsByWorkload(currentPods);
    console.log(`📊 Grouped into ${currentWorkloads.length} workloads`);

    // NOW you can check for missing workloads - AFTER currentWorkloads is declared
    await this.checkForMissingWorkloadsImmediate(currentWorkloads, config.emailGroupId);

    // Compare with previous state and detect changes
    for (const workload of currentWorkloads) {
      const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
      const previousStatus = this.workloadStatuses.get(workloadKey);
      
      // Store current status
      this.workloadStatuses.set(workloadKey, {
        ...workload,
        lastSeen: new Date()
      });

      // Check for status changes (simplified logic)
      if (previousStatus) {
        await this.checkWorkloadHealth(workload, previousStatus, config.emailGroupId);
      } else {
        console.log(`🆕 New workload detected: ${workloadKey} (${workload.readyReplicas}/${workload.desiredReplicas})`);
      }
    }

    // Clean up old workload statuses
    this.cleanupDeletedWorkloads(currentWorkloads);

    console.log(`✅ Workload health check completed - ${currentWorkloads.length} workloads checked`);

  } catch (error) {
    console.error('❌ Workload health check failed:', error);
  }
}

/*async checkForMissingWorkloadsImmediate(currentWorkloads, emailGroupId) {
  if (!emailGroupId) {
    console.log('⚠️ No email group configured, skipping missing workload check');
    return;
  }

  const currentKeys = new Set(
    currentWorkloads.map(w => `${w.type}/${w.name}/${w.namespace}`)
  );

  console.log(`🔍 Checking for missing workloads. Current: ${currentKeys.size}, Previous: ${this.workloadStatuses.size}`);

  // Check each previously known workload
  for (const [key, previousWorkload] of this.workloadStatuses) {
    if (!currentKeys.has(key) && previousWorkload.lastSeen) {
      // Workload is missing!
      const timeSinceLastSeen = Date.now() - new Date(previousWorkload.lastSeen).getTime();
      
      // Only alert if it was recently seen (within last 5 minutes)
      // This prevents alerts for old cleanup
      if (timeSinceLastSeen < 5 * 60 * 1000) {
        const wasHealthy = previousWorkload.readyReplicas > 0;
        
        if (wasHealthy) {
          console.log(`🛑 WORKLOAD STOPPED/MISSING: ${key} - sending immediate alert!`);
          console.log(`   Was: ${previousWorkload.readyReplicas}/${previousWorkload.desiredReplicas} ready`);
          console.log(`   Last seen: ${timeSinceLastSeen}ms ago`);
          
          // Send immediate alert (like restart alerts do)
          await this.sendWorkloadStoppedAlertImmediate(previousWorkload, emailGroupId);
          
          // Mark as alerted to prevent duplicates
          this.workloadStatuses.set(key, {
            ...previousWorkload,
            alertedAsStopped: true,
            stoppedAt: new Date()
          });
        } else {
          console.log(`📊 Workload ${key} was missing but wasn't healthy before (${previousWorkload.readyReplicas} ready)`);
        }
      } else {
        console.log(`🕐 Old workload ${key} missing for ${timeSinceLastSeen}ms - too old to alert`);
      }
    }
  }
}*/

async checkForMissingWorkloadsImmediate(currentWorkloads, emailGroupId) {
  if (!emailGroupId) {
    console.log('⚠️ No email group configured, skipping missing workload check');
    return;
  }

  const currentKeys = new Set(
    currentWorkloads.map(w => `${w.type}/${w.name}/${w.namespace}`)
  );

  console.log(`🔍 Checking for missing workloads. Current: ${currentKeys.size}, Previous: ${this.workloadStatuses.size}`);

  const now = Date.now();
  const stoppedWorkloads = [];

  // STEP 1: Collect all stopped workloads (don't send alerts yet)
  for (const [key, previousWorkload] of this.workloadStatuses) {
    if (!currentKeys.has(key) && previousWorkload.lastSeen && !previousWorkload.alertedAsStopped) {
      const timeSinceLastSeen = now - new Date(previousWorkload.lastSeen).getTime();
      
      // Only consider if it was recently seen (within last 5 minutes)
      if (timeSinceLastSeen < 5 * 60 * 1000) {
        const wasHealthy = previousWorkload.readyReplicas > 0;
        
        if (wasHealthy) {
          console.log(`🛑 Found stopped workload: ${key}`);
          console.log(`   Was: ${previousWorkload.readyReplicas}/${previousWorkload.desiredReplicas} ready`);
          console.log(`   Last seen: ${timeSinceLastSeen}ms ago`);
          
          stoppedWorkloads.push({
            key: key,
            workload: previousWorkload,
            timeSinceLastSeen: timeSinceLastSeen
          });
        } else {
          console.log(`📊 Workload ${key} was missing but wasn't healthy before (${previousWorkload.readyReplicas} ready)`);
        }
      } else {
        console.log(`🕐 Old workload ${key} missing for ${timeSinceLastSeen}ms - too old to alert`);
      }
    }
  }

  // STEP 2: Decide whether to send batch or individual alerts
  if (stoppedWorkloads.length === 0) {
    console.log('✅ No new stopped workloads detected');
    return;
  }

  console.log(`📊 Total stopped workloads found: ${stoppedWorkloads.length}`);

  // If 3 or more workloads stopped, treat as batch operation
  const BATCH_THRESHOLD = 3;
  
  if (stoppedWorkloads.length >= BATCH_THRESHOLD) {
    console.log(`📦 BATCH STOP detected: ${stoppedWorkloads.length} workloads stopped together`);
    
    // Send ONE batch alert for all stopped workloads
    await this.sendBatchStopAlert(stoppedWorkloads, emailGroupId);
    
    // Mark all as alerted
    for (const stopped of stoppedWorkloads) {
      this.workloadStatuses.set(stopped.key, {
        ...stopped.workload,
        alertedAsStopped: true,
        stoppedAt: new Date()
      });
    }
    
  } else {
    // Less than threshold - send individual alerts
    console.log(`📧 Sending individual alerts for ${stoppedWorkloads.length} stopped workload(s)`);
    
    for (const stopped of stoppedWorkloads) {
      await this.sendWorkloadStoppedAlertImmediate(stopped.workload, emailGroupId);
      
      // Mark as alerted
      this.workloadStatuses.set(stopped.key, {
        ...stopped.workload,
        alertedAsStopped: true,
        stoppedAt: new Date()
      });
    }
  }
}

// Add this new method for batch stop alerts:
async sendBatchStopAlert(stoppedWorkloads, emailGroupId) {
  try {
    console.log(`📧 Preparing batch stop alert for ${stoppedWorkloads.length} workloads`);
    
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == emailGroupId);
    
    if (!targetGroup || !targetGroup.enabled) {
      console.log('❌ Email group not found or disabled');
      return;
    }

    const timestamp = new Date();
    const totalPods = stoppedWorkloads.reduce((sum, sw) => 
      sum + (sw.workload.readyReplicas || 0), 0
    );

    const subject = `🛑 Kubernetes Batch Stop:  (${totalPods} pods) stopped`;

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🛑 BATCH STOP DETECTED</h1>
            <p style="margin: 8px 0 0 0; font-size: 16px;">Multiple pods stopped simultaneously</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px;">
            <!-- Summary Cards -->
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="margin-top: 0; color: #333; border-bottom: 2px solid #dee2e6; padding-bottom: 10px;">📊 Summary</h2>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 15px;">
                <div style="text-align: center; padding: 15px; background: #fff5f5; border: 1px solid #f5c2c7; border-radius: 8px;">
                  <div style="font-size: 32px; font-weight: bold; color: #dc3545;">${stoppedWorkloads.length}</div>
                  <div style="font-size: 12px; color: #842029; margin-top: 5px; font-weight: 600;">WORKLOADS STOPPED</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #fff5f5; border: 1px solid #f5c2c7; border-radius: 8px;">
                  <div style="font-size: 32px; font-weight: bold; color: #dc3545;">${totalPods}</div>
                  <div style="font-size: 12px; color: #842029; margin-top: 5px; font-weight: 600;">TOTAL PODS</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px;">
                  <div style="font-size: 16px; font-weight: bold; color: #495057; margin-top: 8px;">${timestamp.toLocaleTimeString()}</div>
                  <div style="font-size: 12px; color: #6c757d; margin-top: 5px; font-weight: 600;">DETECTION TIME</div>
                </div>
              </div>
            </div>

            <!-- Stopped Workloads Table -->
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin-top: 0; color: #333; border-bottom: 2px solid #dee2e6; padding-bottom: 10px;">
                📋 Affected Workloads
              </h3>
              <table style="width: 100%; border-collapse: separate; border-spacing: 0;">
                <thead>
                  <tr style="background-color: #f8f9fa;">
                    <th style="padding: 12px; text-align: left; color: #495057; font-weight: 600; border-bottom: 2px solid #dee2e6;">Workload Name</th>
                    <th style="padding: 12px; text-align: left; color: #495057; font-weight: 600; border-bottom: 2px solid #dee2e6;">Namespace</th>
                    <th style="padding: 12px; text-align: left; color: #495057; font-weight: 600; border-bottom: 2px solid #dee2e6;">Type</th>
                    <th style="padding: 12px; text-align: center; color: #495057; font-weight: 600; border-bottom: 2px solid #dee2e6;">Pods Lost</th>
                  </tr>
                </thead>
                <tbody>
                  ${stoppedWorkloads.map((sw, index) => `
                    <tr style="${index % 2 === 0 ? 'background-color: #fcfcfc;' : 'background-color: white;'}">
                      <td style="padding: 12px; border-bottom: 1px solid #e9ecef;">
                        <strong style="color: #212529;">${sw.workload.name}</strong>
                      </td>
                      <td style="padding: 12px; color: #495057; border-bottom: 1px solid #e9ecef;">
                        ${sw.workload.namespace}
                      </td>
                      <td style="padding: 12px; color: #6c757d; border-bottom: 1px solid #e9ecef;">
                        <span style="background: #e9ecef; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                          ${sw.workload.type}
                        </span>
                      </td>
                      <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e9ecef;">
                        <span style="background: #dc3545; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                          ${sw.workload.readyReplicas || 0}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Alert Box -->
            <div style="background-color: #fff3cd; border: 2px solid #ffecb5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin-top: 0; color: #664d03; display: flex; align-items: center;">
                ⚠️ Batch Operation Detected
              </h3>
              <p style="color: #664d03; margin: 10px 0; line-height: 1.6;">
                <strong>${stoppedWorkloads.length} workloads</strong> stopped within a short time window, 
                indicating this was likely an <strong>intentional batch operation</strong>.
              </p>
              <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ffecb5;">
                <p style="color: #664d03; margin: 5px 0;"><strong>Possible causes:</strong></p>
                <ul style="color: #664d03; margin: 10px 0 10px 20px;">
                  <li>MTCTL stop script execution</li>
                  <li>kubectl scale deployment to 0 replicas</li>
                  <li>Namespace deletion or cleanup</li>
                  <li>Planned maintenance or shutdown</li>
                </ul>
              </div>
            </div>

            <!-- Recommended Actions -->
            <div style="background-color: #d1ecf1; border: 2px solid #bee5eb; padding: 20px; border-radius: 8px;">
              <h3 style="margin-top: 0; color: #0c5460;">📌 Recommended Actions</h3>
              <ol style="color: #0c5460; margin: 10px 0 10px 20px; line-height: 1.8;">
                <li>Verify if this was an intentional shutdown</li>
                <li>Check with team members about any planned maintenance</li>
                <li>If unintentional, run the startup script to restore services</li>
                <li>Monitor for batch recovery when services are restarted</li>
              </ol>
            </div>
          </div>
          
          <div style="background-color: #343a40; color: #ffffff; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">🔔 Alert sent to: <strong>${targetGroup.name}</strong></p>
            <p style="margin: 5px 0 0 0;">Generated at: ${timestamp.toLocaleString()}</p>
            <p style="margin: 5px 0 0 0; opacity: 0.8;">Kubernetes Monitoring System • Batch Operation Detection Enabled</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log(`📧 ✅ Batch stop alert sent successfully for ${stoppedWorkloads.length} workloads`);

  } catch (error) {
    console.error(`📧 ❌ Failed to send batch stop alert:`, error);
  }
}

async sendWorkloadStoppedAlertImmediate(workload, emailGroupId) {
  try {
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == emailGroupId);
    
    if (!targetGroup || !targetGroup.enabled) {
      console.log('❌ Email group not found or disabled for stop alert');
      return;
    }

    const timestamp = new Date();
    const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;

    const subject = `🛑 Kubernetes Workload Stopped: ${workload.name}`;

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🛑 WORKLOAD STOPPED</h1>
            <p style="margin: 8px 0 0 0; font-size: 16px;">Kubernetes workload has stopped or been removed</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px;">
            <h2 style="margin-top: 0; color: #333;">Workload Details</h2>
            
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
              <tbody>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Workload Name:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${workload.name}</td>
                </tr>
                <tr style="background-color: white;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Type:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${workload.type}</td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Namespace:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">${workload.namespace}</td>
                </tr>
                <tr style="background-color: white;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Previous State:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">
                    ${workload.readyReplicas || 0}/${workload.desiredReplicas || 0} pods were running
                  </td>
                </tr>
                <tr style="background-color: #f8f9fa;">
                  <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Current State:</td>
                  <td style="padding: 12px; border-bottom: 1px solid #dee2e6;">
                    <span style="background: #dc3545; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
                      STOPPED/REMOVED
                    </span>
                  </td>
                </tr>
                <tr style="background-color: white;">
                  <td style="padding: 12px; font-weight: bold;">Detection Time:</td>
                  <td style="padding: 12px;">${timestamp.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>

            <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #721c24;">⚠️ Possible Causes</h3>
              <ul style="color: #721c24; margin: 10px 0;">
                <li><strong>Manual stop:</strong> Workload stopped via kubectl or management script</li>
                <li><strong>Scaling to zero:</strong> Replicas set to 0</li>
                <li><strong>Deletion:</strong> Workload has been deleted from cluster</li>
                <li><strong>Namespace removal:</strong> Entire namespace might be removed</li>
              </ul>
            </div>

            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">📋 Recommended Actions</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li>Check if this was an intentional stop</li>
                <li>Verify with team if maintenance is in progress</li>
                <li>If unintentional, restart the workload immediately</li>
                <li>Check cluster events: <code>kubectl get events -n ${workload.namespace}</code></li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">Stop alert sent to: ${targetGroup.name}</p>
            <p style="margin: 5px 0 0 0;">Generated at: ${timestamp.toLocaleString()}</p>
            <p style="margin: 5px 0 0 0;">Kubernetes Workload Monitoring • Immediate Stop Detection</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log(`📧 ✅ Workload stop alert sent immediately for ${workloadKey}`);

  } catch (error) {
    console.error(`📧 ❌ Failed to send workload stop alert:`, error);
  }
}

async checkWorkloadHealth(current, previous, emailGroupId) {
  const workloadKey = `${current.type}/${current.name}/${current.namespace}`;
  
  console.log(`🔍 Checking ${workloadKey}: ${current.readyReplicas}/${current.desiredReplicas} ready`);

  // Simple failure detection
  const currentReady = current.readyReplicas || 0;
  const currentDesired = current.desiredReplicas || 0;
  const previousReady = previous.readyReplicas || 0;

  // WORKLOAD FAILED: All pods are down when there should be some
  if (currentReady === 0 && currentDesired > 0 && previousReady > 0) {
    console.log(`💥 WORKLOAD FAILED: ${workloadKey}`);
    this.addToBatchAlert('failed', current, emailGroupId);
  }
  
  // WORKLOAD DEGRADED: Some pods are down
  else if (currentReady > 0 && currentReady < currentDesired && currentReady < previousReady) {
    console.log(`🚨 WORKLOAD DEGRADED: ${workloadKey} (${currentReady}/${currentDesired} ready)`);
    this.addToBatchAlert('degraded', current, emailGroupId);
  }
  
  // WORKLOAD RECOVERED: Back to full capacity
  else if (currentReady === currentDesired && currentReady > previousReady && currentDesired > 0) {
    console.log(`✅ WORKLOAD RECOVERED: ${workloadKey}`);
    this.addToBatchAlert('recovered', current, emailGroupId);
  }
}

async getWorkloadStatusWithInitialFilter() {
  try {
    // Get all pods first
    const allPods = await kubernetesService.getAllPods();
    
    // Filter out pods with incomplete READY status if this is initial startup
    const isInitialStartup = this.workloadStatuses.size === 0;
    let filteredPods = allPods;
    
    if (isInitialStartup) {
      console.log(`🔍 Initial startup detected - filtering pods with incomplete READY status`);
      
      const originalCount = allPods.length;
      
      filteredPods = allPods.filter(pod => {
        // ALWAYS exclude deleted pods
        if (pod.isDeleted) {
          console.log(`🗑️ Excluding deleted pod: ${pod.namespace}/${pod.name}`);
          return false;
        }
        
        // EXCLUDE pods where READY column is not complete (like 0/1, 1/2, etc.)
        const isReadyComplete = this.isPodReadyComplete(pod);
        
        if (!isReadyComplete) {
          console.log(`❌ Excluding pod with incomplete READY status: ${pod.namespace}/${pod.name} (Ready: ${this.getPodReadyString(pod)}, Status: ${pod.status})`);
          return false;
        }
        
        // INCLUDE pods with complete READY status (1/1, 2/2, 3/3, etc.)
        console.log(`✅ Including pod with complete READY status: ${pod.namespace}/${pod.name} (Ready: ${this.getPodReadyString(pod)})`);
        return true;
      });
      
      const excludedCount = originalCount - filteredPods.length;
      console.log(`📊 Initial snapshot: ${filteredPods.length} pods with complete READY status included`);
      console.log(`📊 Initial snapshot: ${excludedCount} pods with incomplete READY status excluded`);
      
      // Log excluded pods for clarity
      const excludedPods = allPods.filter(pod => !filteredPods.includes(pod) && !pod.isDeleted);
      if (excludedPods.length > 0) {
        console.log(`🔍 Excluded pods:`);
        excludedPods.forEach(pod => {
          console.log(`   - ${pod.namespace}/${pod.name}: ${this.getPodReadyString(pod)} (${pod.status})`);
        });
      }
      
    } else {
      // After initial startup, monitor all non-deleted pods
      filteredPods = allPods.filter(pod => !pod.isDeleted);
      console.log(`📊 Regular monitoring: tracking ${filteredPods.length} non-deleted pods`);
    }
    
    // Group filtered pods by their owner workload
    const workloads = this.groupPodsByWorkload(filteredPods);
    
    return workloads;
  } catch (error) {
    console.error('Failed to get filtered workload status:', error);
    return [];
  }
}

getPodReadyString(pod) {
  if (pod.readyContainers !== undefined && pod.totalContainers !== undefined) {
    return `${pod.readyContainers}/${pod.totalContainers}`;
  }
  
  if (pod.containerStatuses && Array.isArray(pod.containerStatuses)) {
    const readyContainers = pod.containerStatuses.filter(c => c.ready === true).length;
    const totalContainers = pod.containerStatuses.length;
    return `${readyContainers}/${totalContainers}`;
  }
  
  // Fallback: show ready status and pod status
  return `${pod.ready ? 'Ready' : 'Not Ready'} (${pod.status})`;
}

isPodReadyComplete(pod) {
  // Method 1: Check if pod.ready is true (most reliable)
  if (pod.ready === true) {
    return true;
  }
  
  // Method 2: Parse ready containers vs total containers
  if (pod.readyContainers !== undefined && pod.totalContainers !== undefined) {
    return pod.readyContainers === pod.totalContainers && pod.totalContainers > 0;
  }
  
  // Method 3: Parse from containerStatuses if available
  if (pod.containerStatuses && Array.isArray(pod.containerStatuses)) {
    const readyContainers = pod.containerStatuses.filter(c => c.ready === true).length;
    const totalContainers = pod.containerStatuses.length;
    return readyContainers === totalContainers && totalContainers > 0;
  }
  
  // Method 4: Check status - exclude common incomplete states
  const incompleteStatuses = [
    'Pending', 
    'ContainerCreating', 
    'Init:0/1', 
    'PodInitializing',
    'Completed' // Jobs/Init containers that show as "Completed" with 0/1
  ];
  
  if (incompleteStatuses.includes(pod.status)) {
    return false;
  }
  
  // Method 5: If status is Running, assume it's ready (fallback)
  if (pod.status === 'Running') {
    return true;
  }
  
  // Default: exclude if we can't determine
  return false;
}

logInitialFilteringSummary(allPods, filteredPods) {
  console.log(`\n📋 INITIAL FILTERING SUMMARY:`);
  console.log(`   Total pods found: ${allPods.length}`);
  console.log(`   Pods with complete READY status: ${filteredPods.length}`);
  console.log(`   Pods excluded: ${allPods.length - filteredPods.length}`);
  
  const excludedPods = allPods.filter(pod => !filteredPods.includes(pod) && !pod.isDeleted);
  
  if (excludedPods.length > 0) {
    console.log(`\n❌ EXCLUDED PODS (Incomplete READY):`);
    excludedPods.forEach(pod => {
      console.log(`   ${pod.namespace}/${pod.name}: ${this.getPodReadyString(pod)} ${pod.status}`);
    });
  }
  
  console.log(`\n✅ INCLUDED PODS (Complete READY):`);
  filteredPods.slice(0, 5).forEach(pod => {
    console.log(`   ${pod.namespace}/${pod.name}: ${this.getPodReadyString(pod)} ${pod.status}`);
  });
  
  if (filteredPods.length > 5) {
    console.log(`   ... and ${filteredPods.length - 5} more pods`);
  }
  
  console.log(`\n🎯 Monitoring will only track the ${filteredPods.length} pods with complete READY status\n`);
}

async handleInitialWorkloadDetection(workload, emailGroupId) {
  const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
  
  // Check if workload is healthy (all pods ready)
  const isHealthy = workload.readyReplicas === workload.desiredReplicas && workload.readyReplicas > 0;
  
  console.log(`🆕 Initial workload detection: ${workloadKey}`);
  console.log(`   Status: ${workload.status} (${workload.readyReplicas}/${workload.desiredReplicas})`);
  console.log(`   Is Healthy: ${isHealthy}`);
  
  if (isHealthy) {
    // Workload is healthy - add to monitoring normally
    console.log(`✅ Adding healthy workload to monitoring: ${workloadKey}`);
  } else {
    // Workload is unhealthy - add but mark as "ignored_initial"
    console.log(`⚠️ Ignoring unhealthy workload in initial snapshot: ${workloadKey}`);
    console.log(`   Reason: Only ${workload.readyReplicas}/${workload.desiredReplicas} pods ready`);
    
    // Mark this workload as initially unhealthy so we don't alert on its recovery
    const enhancedWorkload = {
      ...workload,
      lastSeen: new Date(),
      ignoredInitial: true, // Mark as ignored in initial snapshot
      initialState: 'unhealthy',
      initialDetectionTime: new Date()
    };
    
    this.workloadStatuses.set(workloadKey, enhancedWorkload);
    
    // Don't send any alerts for initially unhealthy workloads
    return;
  }
}

   async detectSignificantChangesFromBaseline(current, baseline, emailGroupId) {
    const workloadKey = `${current.type}/${current.name}/${current.namespace}`;

    const currentHealthyPods = current.pods.filter(p => p.ready && p.status === 'Running').length;
    const baselineHealthyPods = baseline.pods ? baseline.pods.filter(p => p.ready && p.status === 'Running').length : 0;

    console.log(`🔍 Baseline check: ${workloadKey} - Baseline: ${baselineHealthyPods} → Current: ${currentHealthyPods}`);

    // Only alert if there's a SIGNIFICANT improvement from a bad baseline state
    // Don't alert for existing problems or minor changes
    
    if (baselineHealthyPods === 0 && currentHealthyPods > 0) {
      console.log(`✅ RECOVERY from baseline: ${workloadKey} (was 0 healthy, now ${currentHealthyPods} healthy)`);
      this.addToBatchAlert('recovered', current, emailGroupId, {
        previousHealthy: baselineHealthyPods,
        currentHealthy: currentHealthyPods,
        reason: 'Workload recovered from baseline failed state'
      });
    } else if (currentHealthyPods > baselineHealthyPods && baselineHealthyPods > 0) {
      console.log(`✅ IMPROVEMENT from baseline: ${workloadKey} (${baselineHealthyPods} → ${currentHealthyPods} healthy)`);
      this.addToBatchAlert('recovered', current, emailGroupId, {
        previousHealthy: baselineHealthyPods,
        currentHealthy: currentHealthyPods,
        reason: 'Workload improved from baseline state'
      });
    } else if (currentHealthyPods < baselineHealthyPods) {
      console.log(`⚠️ DEGRADATION from baseline: ${workloadKey} (${baselineHealthyPods} → ${currentHealthyPods} healthy)`);
      this.addToBatchAlert('degraded', current, emailGroupId, {
        previousHealthy: baselineHealthyPods,
        currentHealthy: currentHealthyPods,
        reason: 'Workload degraded from baseline state'
      });
    } else {
      console.log(`📊 STABLE from baseline: ${workloadKey} (${currentHealthyPods} healthy, no significant change)`);
      // Don't alert for stable states, even if they're in a failed condition
      // This prevents false alarms for workloads that were already broken
    }
  }
  // NEW: Detect missing workloads before cleanup
  async detectMissingWorkloads(currentWorkloads, emailGroupId) {
    const currentKeys = new Set(
      currentWorkloads.map(w => `${w.type}/${w.name}/${w.namespace}`)
    );

    // Check for workloads that existed before but are now missing
    for (const [key, previousWorkload] of this.workloadStatuses) {
      if (!currentKeys.has(key)) {
        // This workload existed before but is now completely gone
        const wasHealthy = previousWorkload.pods && 
                          previousWorkload.pods.filter(p => p.ready && p.status === 'Running').length > 0;
        
        if (wasHealthy) {
          console.log(`🛑 MISSING WORKLOAD detected: ${key} (was healthy, now completely gone - likely MTCTL stop)`);
          
          // Create a synthetic workload object for the alert
          const syntheticWorkload = {
            type: previousWorkload.type,
            name: previousWorkload.name,
            namespace: previousWorkload.namespace,
            pods: [], // No pods now
            readyReplicas: 0,
            desiredReplicas: 0,
            status: 'stopped'
          };
          
          // Add to batch alert with stop reason
          this.addToBatchAlert('stopped', syntheticWorkload, emailGroupId, {
            previousHealthy: previousWorkload.pods ? 
              previousWorkload.pods.filter(p => p.ready && p.status === 'Running').length : 0,
            reason: 'Workload completely removed (likely MTCTL stop or scaling to zero)'
          });
        }
      }
    }
  }

  // ENHANCED: Detection logic to catch MTCTL stops and more
 async detectWorkloadChanges(current, previous, emailGroupId) {
  const workloadKey = `${current.type}/${current.name}/${current.namespace}`;

  // Get current status
  const currentHealthyPods = current.pods.filter(p => p.ready && p.status === 'Running').length;
  const currentDesiredReplicas = current.desiredReplicas || current.pods.length;
  
  // Get previous status
  const previousHealthyPods = previous.pods ? 
    previous.pods.filter(p => p.ready && p.status === 'Running').length : 0;
  const previousDesiredReplicas = previous.desiredReplicas || previous.pods?.length || 0;

  console.log(`🔍 Workload change check: ${workloadKey}`);
  console.log(`   Current: ${currentHealthyPods}/${currentDesiredReplicas} healthy`);
  console.log(`   Previous: ${previousHealthyPods}/${previousDesiredReplicas} healthy`);

  // SCENARIO 1: Workload degraded (was healthy, now has issues)
  if (currentHealthyPods < currentDesiredReplicas && previousHealthyPods >= previousDesiredReplicas) {
    console.log(`⚠️ Workload DEGRADED: ${workloadKey} (${currentHealthyPods}/${currentDesiredReplicas} healthy)`);
    this.addToBatchAlert('degraded', current, emailGroupId);
    return;
  }

  // SCENARIO 2: Workload completely failed (all pods down)
  if (currentHealthyPods === 0 && previousHealthyPods > 0) {
    console.log(`💥 Workload FAILED: ${workloadKey}`);
    this.addToBatchAlert('failed', current, emailGroupId);
    return;
  }

  // SCENARIO 3: Workload recovered (was degraded, now healthy)
  if (currentHealthyPods === currentDesiredReplicas && previousHealthyPods < previousDesiredReplicas) {
    console.log(`✅ Workload RECOVERED: ${workloadKey} (${currentHealthyPods}/${currentDesiredReplicas} healthy)`);
    this.addToBatchAlert('recovered', current, emailGroupId);
    return;
  }

  // SCENARIO 4: New pods added to existing workload (scaling up)
  if (currentDesiredReplicas > previousDesiredReplicas) {
    console.log(`📈 Workload SCALED UP: ${workloadKey} (${previousDesiredReplicas} → ${currentDesiredReplicas} pods)`);
    // Don't alert on scaling up unless there are failures
    if (currentHealthyPods < currentDesiredReplicas) {
      console.log(`⚠️ Scaling up but some pods failed: ${workloadKey}`);
      this.addToBatchAlert('degraded', current, emailGroupId);
    }
    return;
  }

  // Log no significant change
  console.log(`➡️ No significant change for ${workloadKey}`);
}


  // Enhanced method to collect alerts for batching
  addToBatchAlert(alertType, workload, emailGroupId, reason = 'unknown') {
    if (!emailGroupId) {
      console.log('⚠️ No email group configured for workload alerts');
      return;
    }

    // Add to pending alerts with enhanced context
    this.pendingAlerts[alertType].push({
      workload: workload,
      timestamp: new Date(),
      emailGroupId: emailGroupId,
      reason: reason // Add reason for better email context
    });

    console.log(`📝 Added ${alertType} alert for ${workload.name} to batch (reason: ${reason}) - ${this.getTotalPendingAlerts()} total pending`);

    // Schedule batch send (or reset timer if already scheduled)
    this.scheduleBatchAlert(emailGroupId);
  }


  // Get total pending alerts count - ENHANCED
  getTotalPendingAlerts() {
    return this.pendingAlerts.failed.length + 
           this.pendingAlerts.degraded.length + 
           this.pendingAlerts.recovered.length +
           this.pendingAlerts.stopped.length +    // NEW
           this.pendingAlerts.started.length;     // NEW
  }

  // Schedule batch alert sending
  scheduleBatchAlert(emailGroupId) {
    // Clear existing timeout
    if (this.alertBatchTimeout) {
      clearTimeout(this.alertBatchTimeout);
    }

    // Schedule new batch send
    this.alertBatchTimeout = setTimeout(async () => {
      await this.sendBatchAlert(emailGroupId);
    }, this.batchDelayMs);

    console.log(`⏰ Batch alert scheduled to send in ${this.batchDelayMs/1000} seconds`);
  }

  // ENHANCED: Send comprehensive batch alert with full cluster status
  // Enhanced sendBatchAlert method for kubernetesMonitoringService.js
// This version shows both recovered pods AND pods that are still down

async sendBatchAlert(emailGroupId) {
  try {
    const totalAlerts = this.getTotalPendingAlerts();
    
    if (totalAlerts === 0) {
      console.log('📧 No pending alerts to send');
      return;
    }

    console.log(`📧 Preparing batch alert with current cluster status...`);

    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == emailGroupId);
    
    if (!targetGroup || !targetGroup.enabled) {
      console.log('❌ Email group not found or disabled');
      this.clearPendingAlerts();
      return;
    }

    // Get current cluster state
    let currentClusterStatus = null;
    try {
      const allWorkloads = await this.getWorkloadStatus();
      
      // CRITICAL: Filter out workloads that were initially unhealthy
      // These are marked with 'ignoredInitial' or 'isBaseline' flags
      currentClusterStatus = {
        healthy: [],
        degraded: [],
        failed: [],
        total: allWorkloads.length
      };
      
      allWorkloads.forEach(workload => {
        const workloadKey = `${workload.type}/${workload.name}/${workload.namespace}`;
        const previousStatus = this.workloadStatuses.get(workloadKey);
        
        // Skip if this was initially unhealthy (marked during baseline/initial snapshot)
        if (previousStatus && (previousStatus.ignoredInitial || previousStatus.wasInitiallyUnhealthy)) {
          console.log(`⏩ Skipping initially unhealthy workload from alert: ${workloadKey}`);
          return; // Skip this workload
        }
        
        // Only include workloads that became unhealthy AFTER monitoring started
        const readyRatio = workload.readyReplicas || 0;
        const desiredRatio = workload.desiredReplicas || 0;
        
        if (readyRatio === 0 && desiredRatio > 0) {
          // Check if this failure is NEW (not from initial state)
          if (!previousStatus || previousStatus.initialState !== 'failed') {
            currentClusterStatus.failed.push(workload);
          }
        } else if (readyRatio < desiredRatio) {
          // Check if this degradation is NEW
          if (!previousStatus || previousStatus.initialState !== 'degraded') {
            currentClusterStatus.degraded.push(workload);
          }
        } else if (readyRatio === desiredRatio && readyRatio > 0) {
          currentClusterStatus.healthy.push(workload);
        }
      });
      
      console.log(`📊 Filtered Status: ${currentClusterStatus.healthy.length} healthy, ${currentClusterStatus.degraded.length} degraded (new), ${currentClusterStatus.failed.length} failed (new)`);
      
    } catch (error) {
      console.error('Failed to get current cluster status:', error);
    }

    // Filter pending alerts to exclude initially unhealthy workloads
    const filteredFailed = this.pendingAlerts.failed.filter(alert => {
      const workloadKey = `${alert.workload.type}/${alert.workload.name}/${alert.workload.namespace}`;
      const status = this.workloadStatuses.get(workloadKey);
      
      // Exclude if marked as initially unhealthy
      if (status && (status.ignoredInitial || status.wasInitiallyUnhealthy)) {
        console.log(`⏩ Excluding initially failed workload from alert: ${alert.workload.name}`);
        return false;
      }
      return true;
    });

    const filteredDegraded = this.pendingAlerts.degraded.filter(alert => {
      const workloadKey = `${alert.workload.type}/${alert.workload.name}/${alert.workload.namespace}`;
      const status = this.workloadStatuses.get(workloadKey);
      
      // Exclude if marked as initially unhealthy
      if (status && (status.ignoredInitial || status.wasInitiallyUnhealthy)) {
        console.log(`⏩ Excluding initially degraded workload from alert: ${alert.workload.name}`);
        return false;
      }
      return true;
    });

    // Keep all recovered alerts (these are good news)
    const recovered = this.pendingAlerts.recovered;

    // Check if we have any real changes to report
    if (filteredFailed.length === 0 && filteredDegraded.length === 0 && recovered.length === 0) {
      console.log('📧 No actionable changes to report (filtered out initially unhealthy workloads)');
      this.clearPendingAlerts();
      return;
    }

    // Determine overall status for subject line
    const hasNewFailures = filteredFailed.length > 0;
    const hasNewDegradations = filteredDegraded.length > 0;
    const hasRecoveries = recovered.length > 0;
    
    // Generate subject based on actual changes
    let subject = '☸️ Kubernetes Status Update: ';
    const parts = [];
    
    if (hasNewFailures) {
      parts.push(`🔴 ${filteredFailed.length} New Failures`);
    }
    if (hasNewDegradations) {
      parts.push(`🟠 ${filteredDegraded.length} New Degradations`);
    }
    if (hasRecoveries) {
      parts.push(`🟢 ${recovered.length} Recovered`);
    }
    
    subject += parts.join(', ') || 'Status Report';
    
    const now = new Date();

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <div style="background-color: ${hasNewFailures ? '#dc3545' : hasNewDegradations ? '#ff7f00' : '#28a745'}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES STATUS CHANGES</h1>
            <p style="margin: 8px 0 0 0; font-size: 16px;">Showing only NEW issues (excluding pre-existing problems)</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px;">
            
            <!-- Changes Summary -->
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #dee2e6;">
              <h2 style="margin-top: 0; color: #333;">📊 Status Changes Since Monitoring Started</h2>
              <div style="display: flex; justify-content: space-around; margin: 20px 0;">
                <div style="text-align: center; padding: 15px; background: #f8d7da; border-radius: 8px; min-width: 100px;">
                  <div style="font-size: 28px; font-weight: bold; color: #dc3545;">${filteredFailed.length}</div>
                  <div style="font-size: 14px; color: #721c24;">New Failures</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #fff3cd; border-radius: 8px; min-width: 100px;">
                  <div style="font-size: 28px; font-weight: bold; color: #ff7f00;">${filteredDegraded.length}</div>
                  <div style="font-size: 14px; color: #856404;">New Degradations</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #d4edda; border-radius: 8px; min-width: 100px;">
                  <div style="font-size: 28px; font-weight: bold; color: #28a745;">${recovered.length}</div>
                  <div style="font-size: 14px; color: #155724;">Recovered</div>
                </div>
              </div>
              
              <!-- Note about filtering -->
              <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 10px; margin-top: 15px; border-radius: 4px;">
                <p style="margin: 0; color: #0c5460; font-size: 13px;">
                  <strong>ℹ️ Note:</strong> This alert only shows workloads that changed state AFTER monitoring began. 
                  Pre-existing issues (pods that were already down/degraded when monitoring started) are excluded.
                </p>
              </div>
            </div>

            <!-- NEW Failures Section (only if there are new failures) -->
            ${filteredFailed.length > 0 ? `
            <div style="margin: 20px 0;">
              <h3 style="color: #dc3545; margin-bottom: 15px;">🔴 NEW Failed Workloads (Since Monitoring Started)</h3>
              <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #dc3545; color: white;">
                    <th style="padding: 12px; text-align: left;">Workload</th>
                    <th style="padding: 12px; text-align: left;">Namespace</th>
                    <th style="padding: 12px; text-align: left;">Type</th>
                    <th style="padding: 12px; text-align: left;">Ready</th>
                    <th style="padding: 12px; text-align: left;">When</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredFailed.map((alert, index) => `
                    <tr style="background-color: ${index % 2 === 0 ? '#fff5f5' : 'white'};">
                      <td style="padding: 12px; font-weight: bold; color: #dc3545;">${alert.workload.name}</td>
                      <td style="padding: 12px;">${alert.workload.namespace}</td>
                      <td style="padding: 12px;">${alert.workload.type}</td>
                      <td style="padding: 12px;">
                        <span style="color: #dc3545; font-weight: bold;">
                          ${alert.workload.readyReplicas || 0}/${alert.workload.desiredReplicas || 0}
                        </span>
                      </td>
                      <td style="padding: 12px; font-size: 11px;">
                        ${new Date(alert.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- NEW Degradations Section (only if there are new degradations) -->
            ${filteredDegraded.length > 0 ? `
            <div style="margin: 20px 0;">
              <h3 style="color: #ff7f00; margin-bottom: 15px;">🟠 NEW Degraded Workloads (Since Monitoring Started)</h3>
              <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #ff7f00; color: white;">
                    <th style="padding: 12px; text-align: left;">Workload</th>
                    <th style="padding: 12px; text-align: left;">Namespace</th>
                    <th style="padding: 12px; text-align: left;">Type</th>
                    <th style="padding: 12px; text-align: left;">Ready</th>
                    <th style="padding: 12px; text-align: left;">When</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredDegraded.map((alert, index) => `
                    <tr style="background-color: ${index % 2 === 0 ? '#fff8f0' : 'white'};">
                      <td style="padding: 12px; font-weight: bold; color: #ff7f00;">${alert.workload.name}</td>
                      <td style="padding: 12px;">${alert.workload.namespace}</td>
                      <td style="padding: 12px;">${alert.workload.type}</td>
                      <td style="padding: 12px;">
                        <span style="color: #ff7f00; font-weight: bold;">
                          ${alert.workload.readyReplicas || 0}/${alert.workload.desiredReplicas || 0}
                        </span>
                      </td>
                      <td style="padding: 12px; font-size: 11px;">
                        ${new Date(alert.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- Recovered Section (if any) -->
            ${recovered.length > 0 ? `
            <div style="margin: 20px 0;">
              <h3 style="color: #28a745; margin-bottom: 15px;">✅ Recovered Workloads</h3>
              <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #28a745; color: white;">
                    <th style="padding: 12px; text-align: left;">Workload</th>
                    <th style="padding: 12px; text-align: left;">Namespace</th>
                    <th style="padding: 12px; text-align: left;">Type</th>
                    <th style="padding: 12px; text-align: left;">Ready</th>
                    <th style="padding: 12px; text-align: left;">Recovery Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${recovered.map((alert, index) => `
                    <tr style="background-color: ${index % 2 === 0 ? '#f0f9f0' : 'white'};">
                      <td style="padding: 12px; font-weight: bold; color: #28a745;">${alert.workload.name}</td>
                      <td style="padding: 12px;">${alert.workload.namespace}</td>
                      <td style="padding: 12px;">${alert.workload.type}</td>
                      <td style="padding: 12px;">
                        <span style="color: #28a745; font-weight: bold;">
                          ${alert.workload.readyReplicas || 0}/${alert.workload.desiredReplicas || 0}
                        </span>
                      </td>
                      <td style="padding: 12px; font-size: 11px;">
                        ${new Date(alert.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- Action Items -->
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⚠️ Action Required</h3>
              <ul style="color: #856404; margin: 10px 0;">
                ${filteredFailed.length > 0 ? `
                  <li><strong>Critical:</strong> ${filteredFailed.length} workload(s) have failed since monitoring started</li>
                ` : ''}
                ${filteredDegraded.length > 0 ? `
                  <li><strong>Warning:</strong> ${filteredDegraded.length} workload(s) are running with reduced capacity</li>
                ` : ''}
                ${recovered.length > 0 ? `
                  <li><strong>Info:</strong> ${recovered.length} workload(s) have recovered successfully</li>
                ` : ''}
                <li>Review the workloads listed above and take appropriate action</li>
                <li>Check cluster resources and recent deployments for root cause</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #343a40; color: white; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">Kubernetes Monitoring System - Change Detection Report</p>
            <p style="margin: 5px 0 0 0;">Alert sent to: ${targetGroup.name} | ${now.toLocaleString()}</p>
          </div>
        </div>
      `
    };

    try {
      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 ✅ Batch alert sent (${filteredFailed.length} new failures, ${filteredDegraded.length} new degradations, ${recovered.length} recovered)`);
      
      // Clear pending alerts after successful send
      this.clearPendingAlerts();
      
    } catch (error) {
      console.error('📧 ❌ Failed to send batch alert:', error);
    }

  } catch (error) {
    console.error('❌ Batch alert generation failed:', error);
  }
}
generateEnhancedAlertSection(title, alerts, color) {
  if (alerts.length === 0) return '';

  return `
    <div style="margin: 20px 0;">
      <h3 style="color: ${color}; margin-bottom: 15px;">${title}</h3>
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: ${color}; color: white;">
            <th style="padding: 12px; text-align: left;">Pod</th>
            <th style="padding: 12px; text-align: left;">Namespace</th>
            <th style="padding: 12px; text-align: left;">Pods</th>
            <th style="padding: 12px; text-align: left;">Context</th>
            <th style="padding: 12px; text-align: left;">Time</th>
          </tr>
        </thead>
        <tbody>
          ${alerts.map((alert, index) => `
            <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
              <td style="padding: 12px; font-weight: bold;">${alert.workload.name}</td>
              <td style="padding: 12px;">${alert.workload.namespace}</td>
              <td style="padding: 12px;">${alert.workload.readyReplicas}/${alert.workload.desiredReplicas}</td>
              <td style="padding: 12px; font-size: 11px;">
                ${alert.reason === 'initial_recovery' ? '🔄 Initial Recovery' : 
                  alert.reason === 'normal_recovery' ? '✅ Normal Recovery' : 
                  alert.reason === 'normal_degradation' ? '⚠️ Degradation' : 
                  alert.reason === 'normal_failure' ? '💥 Failure' : 
                  alert.reason || 'Unknown'}
              </td>
              <td style="padding: 12px; font-size: 11px; color: #666;">${alert.timestamp.toLocaleTimeString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
  // NEW: Generate comprehensive cluster overview
  generateClusterOverview(currentWorkloads) {
    const overview = {
      total: currentWorkloads.length,
      healthy: 0,
      degraded: 0,
      failed: 0,
      unknown: 0,
      byNamespace: {},
      healthyWorkloads: [],
      degradedWorkloads: [],
      failedWorkloads: [],
      unknownWorkloads: []
    };

    currentWorkloads.forEach(workload => {
      // Count by status
      switch (workload.status) {
        case 'healthy':
          overview.healthy++;
          overview.healthyWorkloads.push(workload);
          break;
        case 'degraded':
        case 'warning':
          overview.degraded++;
          overview.degradedWorkloads.push(workload);
          break;
        case 'critical':
          overview.failed++;
          overview.failedWorkloads.push(workload);
          break;
        default:
          overview.unknown++;
          overview.unknownWorkloads.push(workload);
      }

      // Count by namespace
      if (!overview.byNamespace[workload.namespace]) {
        overview.byNamespace[workload.namespace] = {
          total: 0,
          healthy: 0,
          degraded: 0,
          failed: 0
        };
      }
      overview.byNamespace[workload.namespace].total++;
      if (workload.status === 'healthy') overview.byNamespace[workload.namespace].healthy++;
      else if (workload.status === 'degraded' || workload.status === 'warning') overview.byNamespace[workload.namespace].degraded++;
      else if (workload.status === 'critical') overview.byNamespace[workload.namespace].failed++;
    });

    return overview;
  }

  // ENHANCED: Generate comprehensive alert subject
  getComprehensiveAlertSubject(clusterOverview) {
    const failed = this.pendingAlerts.failed.length;
    const degraded = this.pendingAlerts.degraded.length;
    const recovered = this.pendingAlerts.recovered.length;
    const stopped = this.pendingAlerts.stopped?.length || 0;
    const started = this.pendingAlerts.started?.length || 0;
    
    // Include current cluster status in subject
    const clusterHealth = clusterOverview.failed > 0 ? 'CRITICAL' : 
                        clusterOverview.degraded > 0 ? 'DEGRADED' : 'HEALTHY';
    
    if (failed > 0 || clusterOverview.failed > 0) {
      return `🚨 ${clusterHealth}: ${failed} new failures, ${clusterOverview.failed} total failed, ${clusterOverview.healthy}/${clusterOverview.total} healthy`;
    } else if (stopped > 0) {
      return `🛑 ${clusterHealth}: ${stopped} stopped, ${started} started, ${clusterOverview.healthy}/${clusterOverview.total} healthy`;
    } else if (degraded > 0 || clusterOverview.degraded > 0) {
      return `⚠️ ${clusterHealth}: ${degraded} new degraded, ${clusterOverview.degraded} total degraded, ${clusterOverview.healthy}/${clusterOverview.total} healthy`;
    } else if (recovered > 0 || started > 0) {
      return `✅ ${clusterHealth}: ${recovered + started} recovered/started, ${clusterOverview.healthy}/${clusterOverview.total} healthy`;
    }
    
    return `☸️ ${clusterHealth}: ${clusterOverview.healthy}/${clusterOverview.total} Pods healthy`;
  }

  // ENHANCED: Generate comprehensive alert content with full cluster status
  getComprehensiveAlertContent(groupName, clusterOverview) {
    const now = new Date();
    const failed = this.pendingAlerts.failed;
    const degraded = this.pendingAlerts.degraded;
    const recovered = this.pendingAlerts.recovered;
    const stopped = this.pendingAlerts.stopped || [];
    const started = this.pendingAlerts.started || [];
    
    const totalChanges = failed.length + degraded.length + recovered.length + stopped.length + started.length;
    const overallHealth = clusterOverview.failed > 0 ? 'critical' : 
                         clusterOverview.degraded > 0 ? 'warning' : 'healthy';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto;">
        <!-- Header -->
        <div style="background-color: ${overallHealth === 'critical' ? '#dc3545' : overallHealth === 'warning' ? '#ff7f00' : '#28a745'}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">☸️ KUBERNETES COMPREHENSIVE ALERT</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">${totalChanges} changes detected • Full cluster status included</p>
        </div>
        
        <!-- Cluster Overview Dashboard -->
        <div style="background-color: #f8f9fa; padding: 20px; border-bottom: 3px solid #dee2e6;">
          <h2 style="margin-top: 0; color: #333; text-align: center;">🎯 CURRENT CLUSTER STATUS</h2>
          <div style="display: flex; justify-content: space-around; margin: 20px 0; flex-wrap: wrap;">
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 90px; margin: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 28px; font-weight: bold; color: #28a745;">${clusterOverview.healthy}</div>
              <div style="font-size: 12px; color: #666; font-weight: bold;">HEALTHY</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 90px; margin: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 28px; font-weight: bold; color: #ff7f00;">${clusterOverview.degraded}</div>
              <div style="font-size: 12px; color: #666; font-weight: bold;">DEGRADED</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 90px; margin: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 28px; font-weight: bold; color: #dc3545;">${clusterOverview.failed}</div>
              <div style="font-size: 12px; color: #666; font-weight: bold;">FAILED</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 8px; min-width: 90px; margin: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 28px; font-weight: bold; color: #6c757d;">${clusterOverview.total}</div>
              <div style="font-size: 12px; color: #666; font-weight: bold;">TOTAL</div>
            </div>
          </div>

          <!-- Namespace Breakdown -->
          <div style="margin-top: 20px;">
            <h3 style="color: #333; margin-bottom: 10px;">📂 By Namespace</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
              ${Object.entries(clusterOverview.byNamespace).map(([namespace, stats]) => `
                <div style="background: white; padding: 10px; border-radius: 6px; border-left: 4px solid ${stats.failed > 0 ? '#dc3545' : stats.degraded > 0 ? '#ff7f00' : '#28a745'}; min-width: 140px;">
                  <div style="font-weight: bold; font-size: 14px; color: #333;">${namespace}</div>
                  <div style="font-size: 12px; color: #666;">
                    ✅ ${stats.healthy} • ⚠️ ${stats.degraded} • ❌ ${stats.failed}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        
        <!-- Changes Section -->
        <div style="background-color: #f8f9fa; padding: 20px;">
          <h2 style="margin-top: 0; color: #333;">📊 Recent Changes (${totalChanges} total)</h2>
          <div style="display: flex; justify-content: space-around; margin: 20px 0; flex-wrap: wrap;">
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #dc3545;">${failed.length}</div>
              <div style="font-size: 11px; color: #666;">New Failed</div>
            </div>
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #6f42c1;">${stopped.length}</div>
              <div style="font-size: 11px; color: #666;">Stopped</div>
            </div>
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #ff7f00;">${degraded.length}</div>
              <div style="font-size: 11px; color: #666;">Degraded</div>
            </div>
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #17a2b8;">${started.length}</div>
              <div style="font-size: 11px; color: #666;">Started</div>
            </div>
            <div style="text-align: center; padding: 12px; background: white; border-radius: 8px; min-width: 70px; margin: 4px;">
              <div style="font-size: 20px; font-weight: bold; color: #28a745;">${recovered.length}</div>
              <div style="font-size: 11px; color: #666;">Recovered</div>
            </div>
          </div>

          ${this.generateAlertSection('🚨 New Failures', failed, '#dc3545')}
          ${this.generateAlertSection('🛑 Stopped Pods', stopped, '#6f42c1')}
          ${this.generateAlertSection('⚠️ New Degraded', degraded, '#ff7f00')}
          ${this.generateAlertSection('🚀 Started Pods', started, '#17a2b8')}
          ${this.generateAlertSection('✅ Recovered Pods', recovered, '#28a745')}

          <!-- Current Status Sections -->
          ${this.generateCurrentStatusSection('❌ Currently Failed Pods', clusterOverview.failedWorkloads, '#dc3545')}
          ${this.generateCurrentStatusSection('⚠️ Currently Degraded Pods', clusterOverview.degradedWorkloads, '#ff7f00')}
          ${this.generateCurrentStatusSection('✅ Currently Healthy Pods', clusterOverview.healthyWorkloads, '#28a745')}

          <div style="background-color: ${overallHealth === 'critical' ? '#f8d7da' : overallHealth === 'warning' ? '#fff3cd' : '#d4edda'}; border: 1px solid ${overallHealth === 'critical' ? '#f5c6cb' : overallHealth === 'warning' ? '#ffeaa7' : '#c3e6cb'}; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: ${overallHealth === 'critical' ? '#721c24' : overallHealth === 'warning' ? '#856404' : '#155724'};">📋 Recommended Actions</h3>
            <ul style="color: ${overallHealth === 'critical' ? '#721c24' : overallHealth === 'warning' ? '#856404' : '#155724'}; margin: 10px 0;">
              ${clusterOverview.failed > 0 ? '<li><strong>Critical:</strong> Investigate failed Pods immediately</li>' : ''}
              ${failed.length > 0 ? '<li><strong>New failures:</strong> Check logs and restart if necessary</li>' : ''}
              ${stopped.length > 0 ? '<li><strong>Stopped Pods:</strong> Restart when ready (likely MTCTL stop)</li>' : ''}
              ${clusterOverview.degraded > 0 ? '<li><strong>Degraded Pods:</strong> Monitor for auto-recovery</li>' : ''}
              ${degraded.length > 0 ? '<li><strong>New degraded:</strong> Monitor for auto-recovery or manual intervention</li>' : ''}
              ${started.length > 0 || recovered.length > 0 ? '<li><strong>Started/Recovered:</strong> Verify functionality and monitor stability</li>' : ''}
              <li>Dashboard: Check the pods real time status through the monitoring tool</li>
              <li>Uptime WatchDog by Tsunami Solutions - Enterprise Monitoring Platform</li>
            </ul>
          </div>
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Comprehensive alert sent to: ${groupName}</p>
          <p style="margin: 5px 0 0 0;">Generated at: ${now.toLocaleString()}</p>
          <p style="margin: 5px 0 0 0;">Kubernetes Enhanced Monitoring System • Full Cluster Status Included</p>
        </div>
      </div>
    `;
  }

  // ENHANCED: Generate section for each alert type with metadata
  generateAlertSection(title, alerts, color) {
    if (alerts.length === 0) return '';

    return `
      <div style="margin: 20px 0;">
        <h3 style="color: ${color}; margin-bottom: 15px;">${title}</h3>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: ${color}; color: white;">
              <th style="padding: 12px; text-align: left;">Workload</th>
              <th style="padding: 12px; text-align: left;">Namespace</th>
              <th style="padding: 12px; text-align: left;">Status</th>
              <th style="padding: 12px; text-align: left;">Pods</th>
              <th style="padding: 12px; text-align: left;">Reason</th>
              <th style="padding: 12px; text-align: left;">Time</th>
            </tr>
          </thead>
          <tbody>
            ${alerts.map((alert, index) => `
              <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                <td style="padding: 12px; font-weight: bold;">${alert.workload.name}</td>
                <td style="padding: 12px;">${alert.workload.namespace}</td>
                <td style="padding: 12px;">
                  <span style="background: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px;">
                    ${alert.workload.status ? alert.workload.status.toUpperCase() : 'UNKNOWN'}
                  </span>
                </td>
                <td style="padding: 12px;">${alert.workload.readyReplicas || 0}/${alert.workload.desiredReplicas || 0}</td>
                <td style="padding: 12px; font-size: 11px; color: #666;">${alert.metadata?.reason || 'Status change detected'}</td>
                <td style="padding: 12px; font-size: 11px; color: #666;">${alert.timestamp.toLocaleTimeString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // NEW: Generate current status section for workloads currently in a specific state
  generateCurrentStatusSection(title, workloads, color) {
    if (workloads.length === 0) return '';

    return `
      <div style="margin: 20px 0;">
        <h3 style="color: ${color}; margin-bottom: 15px;">${title} (${workloads.length})</h3>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: ${color}; color: white;">
              <th style="padding: 10px; text-align: left; font-size: 12px;">Workload</th>
              <th style="padding: 10px; text-align: left; font-size: 12px;">Namespace</th>
              <th style="padding: 10px; text-align: left; font-size: 12px;">Pods</th>
              <th style="padding: 10px; text-align: left; font-size: 12px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${workloads.slice(0, 10).map((workload, index) => `
              <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'};">
                <td style="padding: 8px; font-size: 12px; font-weight: bold;">${workload.name}</td>
                <td style="padding: 8px; font-size: 12px;">${workload.namespace}</td>
                <td style="padding: 8px; font-size: 12px;">${workload.readyReplicas || 0}/${workload.desiredReplicas || 0}</td>
                <td style="padding: 8px; font-size: 11px;">
                  <span style="background: ${color}; color: white; padding: 2px 6px; border-radius: 3px;">
                    ${workload.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            `).join('')}
            ${workloads.length > 10 ? `
              <tr style="background-color: #f8f9fa;">
                <td colspan="4" style="padding: 8px; text-align: center; font-style: italic; color: #666; font-size: 12px;">
                  ... and ${workloads.length - 10} more
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  // Clear pending alerts - ENHANCED
  clearPendingAlerts() {
    this.pendingAlerts = {
      failed: [],
      degraded: [],
      recovered: [],
      stopped: [],     // NEW
      started: []      // NEW
    };
    
    if (this.alertBatchTimeout) {
      clearTimeout(this.alertBatchTimeout);
      this.alertBatchTimeout = null;
    }
    
    console.log('🗑️ Cleared all pending alerts (including new stop/start alerts)');
  }

  // Get comprehensive workload status
  async getWorkloadStatus() {
    try {
      // Get all pods first
      const pods = await kubernetesService.getAllPods();
      
      // Group pods by their owner (deployment/statefulset/etc)
      const workloads = this.groupPodsByWorkload(pods);
      
      return workloads;
    } catch (error) {
      console.error('Failed to get workload status:', error);
      return [];
    }
  }

  // Group pods by their controlling workload
  groupPodsByWorkload(pods) {
    const workloadMap = new Map();

    pods.forEach(pod => {
      const workloadInfo = this.extractWorkloadInfo(pod);
      
      if (!workloadMap.has(workloadInfo.key)) {
        workloadMap.set(workloadInfo.key, {
          type: workloadInfo.type,
          name: workloadInfo.name,
          namespace: workloadInfo.namespace,
          pods: [],
          desiredReplicas: 0, // Will be calculated based on actual pods
          readyReplicas: 0,
          status: 'unknown'
        });
      }

      const workload = workloadMap.get(workloadInfo.key);
      workload.pods.push({
        name: pod.name,
        status: pod.status,
        ready: pod.ready,
        restarts: pod.restarts,
        age: pod.age,
        node: pod.node
      });

      // Count ready replicas
      if (pod.ready && pod.status === 'Running') {
        workload.readyReplicas++;
      }
    });

    // Convert map to array and calculate health based on INCLUDED pods only
    return Array.from(workloadMap.values()).map(workload => {
      // For filtered workloads, desired replicas = actual pods we're tracking
      workload.desiredReplicas = workload.pods.length;
      workload.status = this.calculateWorkloadHealth(workload);
      return workload;
    });
  }

  
  // Extract workload information from pod name and labels
  extractWorkloadInfo(pod) {
    // Handle different pod naming patterns
    let workloadName = pod.name;
    let workloadType = 'Pod'; // Default for standalone pods

    // Pattern: deployment-name-replicaset-hash-pod-hash
    if (pod.name.includes('-')) {
      const parts = pod.name.split('-');
      if (parts.length >= 3) {
        // Remove last 2 parts (replicaset hash + pod hash)
        workloadName = parts.slice(0, -2).join('-');
        workloadType = 'Deployment';
      }
    }

    const key = `${workloadType}/${workloadName}/${pod.namespace}`;
    
    return {
      key,
      type: workloadType,
      name: workloadName,
      namespace: pod.namespace
    };
  }

  calculateWorkloadHealth(workload) {
    const totalPods = workload.pods.length;
    const readyPods = workload.readyReplicas;
    const runningPods = workload.pods.filter(p => p.status === 'Running').length;

    if (readyPods === 0 && totalPods > 0) return 'critical';
    if (readyPods < totalPods * 0.5) return 'degraded';
    if (runningPods < totalPods) return 'warning';
    return 'healthy';
  }

  cleanupDeletedWorkloads(currentWorkloads) {
    const currentKeys = new Set(
      currentWorkloads.map(w => `${w.type}/${w.name}/${w.namespace}`)
    );

    for (const [key] of this.workloadStatuses) {
      if (!currentKeys.has(key)) {
        console.log(`🗑️ Cleaning up deleted workload: ${key}`);
        this.workloadStatuses.delete(key);
      }
    }
  }

  // Keep existing checkNodeHealth method
  async checkNodeHealth() {
    try {
      console.log('☸️ Checking Kubernetes node health...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        console.log('⚠️ Kubernetes not configured - skipping node health check');
        return;
      }

      const nodes = await kubernetesService.getNodes();
      
      nodes.forEach(node => {
        const nodeKey = `node/${node.name}`;
        const previousStatus = this.nodeStatuses.get(nodeKey);
        
        if (previousStatus && previousStatus.status !== node.status) {
          console.log(`🖥️ Node status changed: ${node.name} ${previousStatus.status} → ${node.status}`);
          // Could send node alerts here if needed
        }
        
        this.nodeStatuses.set(nodeKey, {
          name: node.name,
          status: node.status,
          lastSeen: new Date()
        });
      });

      console.log(`✅ Node health check completed - ${nodes.length} nodes checked`);

    } catch (error) {
      console.error('❌ Node health check failed:', error);
    }
  }
}

module.exports = new KubernetesMonitoringService();