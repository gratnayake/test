// Add this new monitoring service to your backend - create backend/services/podMonitoringService.js:

const cron = require('node-cron');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');
const podLifecycleService = require('./podLifecycleService');
const emailService = require('./emailService');

class PodMonitoringService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.checkFrequency = '*/15 * * * * *'; // Check every 15 seconds
    
    console.log('🔍 Pod Monitoring Service initialized');
  }

  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Pod monitoring already running');
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

    console.log('🚀 Starting pod disappearance monitoring (checking every 15 seconds)');
    
    this.checkInterval = cron.schedule(this.checkFrequency, async () => {
      await this.checkForPodChanges();
    }, {
      scheduled: false
    });

    this.checkInterval.start();
    this.isMonitoring = true;

    // Perform initial check after 5 seconds
    setTimeout(() => {
      this.checkForPodChanges();
    }, 5000);

    return true;
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Pod monitoring not running');
      return false;
    }

    console.log('🛑 Stopping pod monitoring');
    
    if (this.checkInterval) {
      this.checkInterval.stop();
      this.checkInterval = null;
    }
    
    this.isMonitoring = false;
    return true;
  }

 async checkForPodChanges() {
  try {
    console.log('🔍 Checking for pod changes...');
    
    // Get current pods from Kubernetes
    let currentPods = [];
    try {
      const allPods = await kubernetesService.getAllPodsWithContainers();
      
      // FILTER OUT completed pods from monitoring
      currentPods = allPods.filter(pod => {
        // Exclude Completed/Succeeded pods
        if (pod.status === 'Completed' || pod.status === 'Succeeded') {
          return false;
        }
        
        // Exclude pods with 0/X ready ratio unless they're actively running/pending
        if (pod.readinessRatio && pod.readinessRatio.startsWith('0/') && 
            pod.status !== 'Running' && pod.status !== 'Pending') {
          return false;
        }
        
        return true;
      });
      
      console.log(`📡 Current active pods: ${currentPods.length} (filtered from ${allPods.length} total)`);
    } catch (k8sError) {
      console.log('⚠️ Could not fetch current pods from K8s:', k8sError.message);
      return;
    }
    
    // Update lifecycle tracking and detect changes
    const changes = await podLifecycleService.updatePodLifecycle(currentPods);
    
    if (changes.length > 0) {
      console.log(`🔄 Pod changes detected: ${changes.length}`);
      
      // Get email configuration
      const kubeConfig = kubernetesConfigService.getConfig();
      
      if (!kubeConfig.emailGroupId) {
        console.log('⚠️ No email group configured - skipping email alerts');
        return;
      }
      
      // Group changes by type for better processing
      const changesByType = {
        deleted: changes.filter(c => c.type === 'deleted'),
        created: changes.filter(c => c.type === 'created'),
        status_change: changes.filter(c => c.type === 'status_change'),
        restart: changes.filter(c => c.type === 'restart'),
        mass_disappearance: changes.filter(c => c.type === 'mass_disappearance'),
        critical_pod_down: changes.filter(c => c.type === 'critical_pod_down'),
        other: changes.filter(c => !['deleted', 'created', 'status_change', 'restart', 'mass_disappearance', 'critical_pod_down'].includes(c.type))
      };
      
      // Log summary of changes
      console.log('📊 Changes summary:', {
        deleted: changesByType.deleted.length,
        created: changesByType.created.length,
        status_change: changesByType.status_change.length,
        restart: changesByType.restart.length,
        mass_disappearance: changesByType.mass_disappearance.length,
        critical_pod_down: changesByType.critical_pod_down.length,
        other: changesByType.other.length
      });
      
      // HANDLE INDIVIDUAL POD DELETIONS/STOPS
      // This is the key fix - process individual pod deletions
      for (const deletion of changesByType.deleted) {
        try {
          // Check if this is a critical pod that needs immediate alert
          const podName = deletion.name || deletion.pod?.name;
          const namespace = deletion.namespace || deletion.pod?.namespace;
          
          // Determine if this pod is critical (you can customize this logic)
          const isCriticalPod = 
            podName.startsWith('ifsapp-') || // IFS app pods
            podName.includes('database') ||   // Database pods
            podName.includes('critical') ||   // Explicitly marked critical
            namespace === 'uattest';          // All uattest namespace pods
          
          if (isCriticalPod) {
            console.log(`🚨 Critical pod deleted: ${namespace}/${podName}`);
            
            // Send individual pod deletion alert
            await this.sendIndividualPodDeletionEmail(deletion, kubeConfig.emailGroupId);
          } else {
            console.log(`ℹ️ Non-critical pod deleted: ${namespace}/${podName}`);
          }
        } catch (error) {
          console.error(`❌ Failed to process deletion alert:`, error);
        }
      }
      
      // HANDLE POD RESTARTS
      for (const restart of changesByType.restart) {
        try {
          const podName = restart.name || restart.pod?.name;
          const namespace = restart.namespace || restart.pod?.namespace;
          const restartIncrease = restart.increase || 1;
          
          // Alert for any pod with significant restarts
          if (restartIncrease >= 1) {
            console.log(`🔄 Pod restart detected: ${namespace}/${podName} (+${restartIncrease})`);
            
            // Send restart alert
            await this.sendPodRestartAlertEmail(restart, kubeConfig.emailGroupId);
          }
        } catch (error) {
          console.error(`❌ Failed to process restart alert:`, error);
        }
      }
      
      // HANDLE STATUS CHANGES (Pod failures, etc.)
      for (const statusChange of changesByType.status_change) {
        try {
          const podName = statusChange.name || statusChange.pod?.name;
          const namespace = statusChange.namespace || statusChange.pod?.namespace;
          
          // Alert for pods that changed to Failed status
          if (statusChange.newStatus === 'Failed' || statusChange.newStatus === 'Error') {
            console.log(`❌ Pod failed: ${namespace}/${podName}`);
            
            await this.sendPodFailureEmail(statusChange, kubeConfig.emailGroupId);
          }
        } catch (error) {
          console.error(`❌ Failed to process status change alert:`, error);
        }
      }
      
      // HANDLE MASS DISAPPEARANCES (your existing code)
      for (const alert of changesByType.mass_disappearance) {
        try {
          await this.sendPodDisappearanceEmail(alert, kubeConfig.emailGroupId);
          console.log(`✅ Mass disappearance email sent for ${alert.namespace} (${alert.podCount} pods)`);
        } catch (emailError) {
          console.error(`❌ Failed to send mass disappearance email:`, emailError.message);
        }
      }
      
      // HANDLE CRITICAL POD DOWN (if detected by updatePodLifecycle)
      for (const critical of changesByType.critical_pod_down) {
        try {
          await this.sendCriticalPodDownEmail(critical, kubeConfig.emailGroupId);
          console.log(`✅ Critical pod down email sent for ${critical.pod?.name}`);
        } catch (emailError) {
          console.error(`❌ Failed to send critical pod email:`, emailError.message);
        }
      }
      
      // Log other changes for debugging
      if (changesByType.other.length > 0) {
        console.log(`📝 Other changes: ${changesByType.other.map(c => c.type).join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Pod monitoring check failed:', error);
  }
}

// Add this new email method for individual pod deletions
async sendIndividualPodDeletionEmail(deletion, emailGroupId) {
  try {
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
    
    if (!targetGroup || targetGroup.emails.length === 0) {
      console.log('⚠️ No valid email group found for pod deletion alert');
      return false;
    }

    const podName = deletion.name || deletion.pod?.name;
    const namespace = deletion.namespace || deletion.pod?.namespace;
    const timestamp = deletion.timestamp || new Date().toISOString();
    const alertTime = new Date(timestamp);
    
    // Extract service name from pod name (e.g., ifsapp-odata from ifsapp-odata-xxx-yyy)
    let serviceName = podName;
    if (podName.includes('-')) {
      const parts = podName.split('-');
      if (parts.length >= 3) {
        serviceName = parts.slice(0, -2).join('-');
      }
    }

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: `⚠️ Pod Stopped: ${serviceName} in ${namespace}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #ff9800; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">⚠️ POD STOPPED/DELETED</h1>
          </div>
          
          <div style="padding: 20px; background-color: #fff3e0; border-left: 5px solid #ff9800;">
            <h2 style="color: #e65100; margin-top: 0;">Individual Pod Alert</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Pod Name:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${podName}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Service:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">${serviceName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Namespace:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${namespace}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Detection Time:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${alertTime.toLocaleString()}</td>
              </tr>
            </table>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">📋 Recommended Actions</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li>Check if this was an intentional restart or scale-down</li>
                <li>Verify deployment status: <code>kubectl get deployment ${serviceName} -n ${namespace}</code></li>
                <li>Check for new pods: <code>kubectl get pods -n ${namespace} | grep ${serviceName}</code></li>
                <li>View events: <code>kubectl get events -n ${namespace} --sort-by='.lastTimestamp'</code></li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">Kubernetes Pod Monitoring System</p>
            <p style="margin: 5px 0 0 0;">Individual Pod Change Detection</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log(`📧 ✅ Individual pod deletion alert sent for ${namespace}/${podName}`);
    return true;
    
  } catch (error) {
    console.error('📧 ❌ Failed to send individual pod deletion email:', error);
    return false;
  }
}

// Add method for pod restart alerts
async sendPodRestartAlertEmail(restart, emailGroupId) {
  try {
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
    
    if (!targetGroup || targetGroup.emails.length === 0) {
      return false;
    }

    const podName = restart.name || restart.pod?.name;
    const namespace = restart.namespace || restart.pod?.namespace;
    const increase = restart.increase || 1;
    const currentRestarts = restart.currentRestarts || 0;
    const timestamp = restart.timestamp || new Date().toISOString();
    const alertTime = new Date(timestamp);

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: `🔄 Pod Restart: ${podName} (+${increase} restart${increase > 1 ? 's' : ''})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #17a2b8; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">🔄 POD RESTART DETECTED</h1>
          </div>
          
          <div style="padding: 20px; background-color: #d1ecf1; border-left: 5px solid #17a2b8;">
            <h2 style="color: #0c5460; margin-top: 0;">Pod Has Restarted</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Pod:</td>
                <td style="padding: 8px;">${podName}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Namespace:</td>
                <td style="padding: 8px;">${namespace}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">New Restarts:</td>
                <td style="padding: 8px; color: #ff6b6b; font-weight: bold;">+${increase}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Total Restarts:</td>
                <td style="padding: 8px;">${currentRestarts}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Time:</td>
                <td style="padding: 8px;">${alertTime.toLocaleString()}</td>
              </tr>
            </table>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⚠️ Investigation Steps</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li>Check pod logs: <code>kubectl logs ${podName} -n ${namespace} --previous</code></li>
                <li>Check current logs: <code>kubectl logs ${podName} -n ${namespace}</code></li>
                <li>Describe pod: <code>kubectl describe pod ${podName} -n ${namespace}</code></li>
                <li>Check for OOMKilled or resource limits</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">Pod Restart Monitoring</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log(`📧 ✅ Pod restart alert sent for ${namespace}/${podName}`);
    return true;
    
  } catch (error) {
    console.error('📧 ❌ Failed to send pod restart email:', error);
    return false;
  }
}

// Add method for pod failure alerts
async sendPodFailureEmail(statusChange, emailGroupId) {
  try {
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
    
    if (!targetGroup || targetGroup.emails.length === 0) {
      return false;
    }

    const podName = statusChange.name || statusChange.pod?.name;
    const namespace = statusChange.namespace || statusChange.pod?.namespace;
    const oldStatus = statusChange.oldStatus || 'Unknown';
    const newStatus = statusChange.newStatus || 'Failed';
    const timestamp = statusChange.timestamp || new Date().toISOString();
    const alertTime = new Date(timestamp);

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: `❌ Pod Failed: ${podName} in ${namespace}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">❌ POD FAILURE</h1>
          </div>
          
          <div style="padding: 20px; background-color: #f8d7da; border-left: 5px solid #dc3545;">
            <h2 style="color: #721c24; margin-top: 0;">Pod Status Changed to Failed</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Pod:</td>
                <td style="padding: 8px;">${podName}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Namespace:</td>
                <td style="padding: 8px;">${namespace}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Previous Status:</td>
                <td style="padding: 8px;">${oldStatus}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Current Status:</td>
                <td style="padding: 8px; color: #dc3545; font-weight: bold;">${newStatus}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Time:</td>
                <td style="padding: 8px;">${alertTime.toLocaleString()}</td>
              </tr>
            </table>
            
            <div style="background-color: #f5c6cb; border: 1px solid #f1b0b7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #721c24;">🚨 Immediate Actions</h3>
              <ul style="color: #721c24; margin: 10px 0;">
                <li>Check pod logs for error details</li>
                <li>Review recent deployments or configuration changes</li>
                <li>Check resource availability and limits</li>
                <li>Consider rolling back if recent deployment</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">Pod Failure Detection System</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log(`📧 ✅ Pod failure alert sent for ${namespace}/${podName}`);
    return true;
    
  } catch (error) {
    console.error('📧 ❌ Failed to send pod failure email:', error);
    return false;
  }
}

  async sendPodDisappearanceEmail(disappearanceAlert, emailGroupId) {
    try {
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        console.log('⚠️ No valid email group found for pod disappearance alert');
        return false;
      }

      const { namespace, podCount, pods, timestamp } = disappearanceAlert;
      const alertTime = new Date(timestamp);

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: `🛑 KUBERNETES ALERT: ${podCount} pods stopped in '${namespace}'`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #ff4d4f; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">🛑 KUBERNETES PODS STOPPED</h1>
            </div>
            
            <div style="padding: 20px; background-color: #fff2f0; border-left: 5px solid #ff4d4f;">
              <h2 style="color: #ff4d4f; margin-top: 0;">Mass Pod Disappearance Detected</h2>
              
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Namespace:</td>
                  <td style="padding: 8px; color: #ff4d4f; font-weight: bold; border-bottom: 1px solid #ddd;">${namespace}</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Pods Stopped:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${podCount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Detection Time:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${alertTime.toLocaleString()}</td>
                </tr>
              </table>
              
              <h3 style="color: #ff4d4f;">Affected Pods:</h3>
              <div style="background-color: #ffffff; border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
                ${pods.slice(0, 10).map(pod => `
                  <div style="padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
                    <strong>${pod.name}</strong> 
                    <span style="color: #666; font-size: 12px;">(Last status: ${pod.status})</span>
                  </div>
                `).join('')}
                ${pods.length > 10 ? `<div style="padding: 4px 0; color: #666; font-style: italic;">... and ${pods.length - 10} more pods</div>` : ''}
              </div>
              
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #856404;">⚠️ RECOMMENDED ACTIONS</h3>
                <ul style="color: #856404; margin: 10px 0;">
                  <li>Check if this was an intentional maintenance operation</li>
                  <li>Verify Kubernetes cluster status and connectivity</li>
                  <li>Review deployment and service configurations</li>
                  <li>Consider restarting services if this was unintentional</li>
                </ul>
              </div>
            </div>
            
            <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
              <p style="margin: 0;">Alert sent to: ${targetGroup.name}</p>
              <p style="margin: 5px 0 0 0;">Automated Pod Monitoring System</p>
            </div>
          </div>
        `
      };

      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 ✅ Pod disappearance alert sent successfully to ${targetGroup.emails.length} recipients`);
      return true;
      
    } catch (error) {
      console.error('📧 ❌ Failed to send pod disappearance email:', error);
      return false;
    }
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      checkFrequency: this.checkFrequency,
      lastCheck: new Date()
    };
  }
}

module.exports = new PodMonitoringService();