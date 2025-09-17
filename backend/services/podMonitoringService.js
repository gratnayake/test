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
      
      // CRITICAL FIX: Update lifecycle tracking and detect changes
      const changes = await podLifecycleService.updatePodLifecycle(currentPods);
      
      if (changes.length > 0) {
        console.log(`🔄 Pod changes detected: ${changes.length}`);
        
        // Get email configuration
        const kubeConfig = kubernetesConfigService.getConfig();
        if (!kubeConfig.emailGroupId) {
          console.log('⚠️ No email group configured - skipping email alerts');
          return;
        }

        // ENHANCED: Handle BOTH mass disappearance AND individual pod deletions
        const disappearanceAlerts = changes.filter(c => c.type === 'mass_disappearance');
        const individualDeletions = changes.filter(c => 
          c.type === 'pod_deleted' || 
          c.type === 'individual_disappearance' ||
          (c.type === 'pod_disappeared' && c.podCount === 1)
        );

        // Process mass disappearance alerts (existing logic)
        if (disappearanceAlerts.length > 0) {
          console.log(`🛑 Processing ${disappearanceAlerts.length} mass disappearance alerts...`);
          
          for (const alert of disappearanceAlerts) {
            try {
              await this.sendPodDisappearanceEmail(alert, kubeConfig.emailGroupId);
              console.log(`✅ Mass disappearance email sent for ${alert.namespace} (${alert.podCount} pods)`);
            } catch (emailError) {
              console.error(`❌ Failed to send mass disappearance email for ${alert.namespace}:`, emailError.message);
            }
          }
        }

        // NEW: Process individual pod deletions
        if (individualDeletions.length > 0) {
          console.log(`🔍 Processing ${individualDeletions.length} individual pod deletion alerts...`);
          
          for (const deletion of individualDeletions) {
            try {
              // Convert individual deletion to disappearance alert format
              const individualAlert = {
                type: 'individual_pod_disappearance',
                namespace: deletion.namespace || 'unknown',
                podCount: 1,
                timestamp: deletion.timestamp || new Date().toISOString(),
                message: `Individual pod deleted: ${deletion.podName || 'unknown'}`,
                pods: deletion.pods || [{ 
                  name: deletion.podName || 'unknown', 
                  namespace: deletion.namespace || 'unknown', 
                  status: deletion.previousStatus || 'Unknown' 
                }],
                severity: 'info'
              };

              await this.sendPodDisappearanceEmail(individualAlert, kubeConfig.emailGroupId);
              console.log(`✅ Individual pod deletion email sent for ${deletion.podName || 'unknown pod'}`);
            } catch (emailError) {
              console.error(`❌ Failed to send individual deletion email:`, emailError.message);
            }
          }
        }
        
        // Log other changes for debugging
        const otherChanges = changes.filter(c => 
          c.type !== 'mass_disappearance' && 
          c.type !== 'pod_deleted' && 
          c.type !== 'individual_disappearance' &&
          c.type !== 'pod_disappeared'
        );
        if (otherChanges.length > 0) {
          console.log(`📝 Other changes: ${otherChanges.map(c => c.type).join(', ')}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Pod monitoring check failed:', error);
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

      const { namespace, podCount, pods, timestamp, type } = disappearanceAlert;
      const alertTime = new Date(timestamp);

      // ENHANCED: Different subject line for single vs mass deletions
      const isIndividualDeletion = podCount === 1 || type === 'individual_pod_disappearance';
      const subject = isIndividualDeletion
        ? `🔍 KUBERNETES ALERT: 1 pod deleted in '${namespace}'`
        : `🛑 KUBERNETES ALERT: ${podCount} pods stopped in '${namespace}'`;

      // ENHANCED: Different header for single vs mass deletions
      const headerTitle = isIndividualDeletion
        ? 'KUBERNETES POD DELETED'
        : 'KUBERNETES PODS STOPPED';

      const headerColor = isIndividualDeletion ? '#ff9800' : '#ff4d4f'; // Orange for individual, Red for mass

      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: ${headerColor}; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">${isIndividualDeletion ? '🔍' : '🛑'} ${headerTitle}</h1>
            </div>
            
            <div style="padding: 20px; background-color: #fff2f0; border-left: 5px solid ${headerColor};">
              <h2 style="color: ${headerColor}; margin-top: 0;">
                ${isIndividualDeletion ? 'Individual Pod Deletion Detected' : 'Mass Pod Disappearance Detected'}
              </h2>
              
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Namespace:</td>
                  <td style="padding: 8px; color: ${headerColor}; font-weight: bold; border-bottom: 1px solid #ddd;">${namespace}</td>
                </tr>
                <tr style="background-color: #ffffff;">
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">${isIndividualDeletion ? 'Pod Deleted:' : 'Pods Stopped:'}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${podCount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Detection Time:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${alertTime.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Alert Severity:</td>
                  <td style="padding: 8px;">${isIndividualDeletion ? '🔍 Individual Deletion (Info)' : '🛑 Mass Deletion (Warning)'}</td>
                </tr>
              </table>
              
              <h3 style="color: ${headerColor};">Affected Pod${podCount === 1 ? '' : 's'}:</h3>
              <div style="background-color: #ffffff; border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
                ${pods.slice(0, 10).map(pod => `
                  <div style="padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
                    <strong>${pod.name}</strong> 
                    <span style="color: #666; font-size: 12px;">(Last status: ${pod.status})</span>
                  </div>
                `).join('')}
                ${pods.length > 10 ? `<div style="padding: 4px 0; color: #666; font-style: italic;">... and ${pods.length - 10} more pods</div>` : ''}
              </div>
              
              <div style="background-color: ${isIndividualDeletion ? '#e3f2fd' : '#fff3cd'}; border: 1px solid ${isIndividualDeletion ? '#bbdefb' : '#ffeaa7'}; padding: 15px; margin: 15px 0; border-radius: 4px;">
                <h3 style="margin-top: 0; color: ${isIndividualDeletion ? '#1976d2' : '#856404'};">
                  ${isIndividualDeletion ? 'ℹ️ RECOMMENDED ACTIONS' : '⚠️ RECOMMENDED ACTIONS'}
                </h3>
                <ul style="color: ${isIndividualDeletion ? '#1976d2' : '#856404'}; margin: 10px 0;">
                  ${isIndividualDeletion ? `
                    <li>Check if this was an intentional pod deletion or restart</li>
                    <li>Verify if the pod is automatically recreating (normal for deployments)</li>
                    <li>Monitor namespace for any follow-up pod creations</li>
                    <li>Check deployment/replicaset status if this affects availability</li>
                  ` : `
                    <li>Check if this was an intentional maintenance operation</li>
                    <li>Verify Kubernetes cluster status and connectivity</li>
                    <li>Review deployment and service configurations</li>
                    <li>Check for resource constraints or node issues</li>
                    <li>Consider restarting services if this was unintentional</li>
                  `}
                </ul>
              </div>
            </div>
            
            <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
              <p style="margin: 0;">Alert sent to: ${targetGroup.name}</p>
              <p style="margin: 5px 0 0 0;">Kubernetes Pod Monitoring System</p>
            </div>
          </div>
        `
      };

      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 ✅ Pod ${isIndividualDeletion ? 'deletion' : 'disappearance'} alert sent successfully to ${targetGroup.emails.length} recipients`);
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