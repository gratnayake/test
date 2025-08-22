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
        
        // Include ALL pods for monitoring (don't filter out unready ones)
        currentPods = allPods.filter(pod => {
          // Only exclude truly completed/succeeded pods
          if (pod.status === 'Completed' || pod.status === 'Succeeded') {
            return false;
          }
          return true;
        });
        
        console.log(`📡 Monitoring ${currentPods.length} active pods (from ${allPods.length} total)`);
        
        // Log IFS app pods specifically
        const ifsAppPods = currentPods.filter(p => p.name.startsWith('ifsapp-'));
        console.log(`🎯 Tracking ${ifsAppPods.length} IFS app pods in namespace uattest`);
        
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
        
        // Process alerts that require email notification
        const alertsToSend = changes.filter(c => c.requiresAlert);
        
        if (alertsToSend.length > 0) {
          console.log(`📧 Processing ${alertsToSend.length} alerts requiring email`);
          
          for (const alert of alertsToSend) {
            try {
              let emailSent = false;
              
              switch (alert.type) {
                case 'mass_disappearance':
                  console.log(`🛑 Mass disappearance: ${alert.namespace} (${alert.podCount} pods)`);
                  emailSent = await this.sendPodDisappearanceEmail(alert, kubeConfig.emailGroupId);
                  break;
                  
                case 'ifsapp_pod_down':
                  console.log(`🚨 IFS App pod down: ${alert.podName}`);
                  emailSent = await this.sendIfsAppPodDownEmail(alert, kubeConfig.emailGroupId);
                  break;
                  
                case 'ifsapp_service_down':
                  console.log(`🚨 IFS App service down: ${alert.service} (${alert.podCount} pods)`);
                  emailSent = await this.sendIfsAppServiceDownEmail(alert, kubeConfig.emailGroupId);
                  break;
                  
                case 'ifsapp_pod_failed':
                  console.log(`❌ IFS App pod failed: ${alert.podName}`);
                  emailSent = await this.sendIfsAppPodFailedEmail(alert, kubeConfig.emailGroupId);
                  break;
                  
                case 'ifsapp_pod_unready':
                  console.log(`⚠️ IFS App pod unready: ${alert.podName}`);
                  emailSent = await this.sendIfsAppPodUnreadyEmail(alert, kubeConfig.emailGroupId);
                  break;
                  
                case 'ifsapp_pod_restart':
                  console.log(`🔄 IFS App pod restart: ${alert.podName} (+${alert.increase})`);
                  emailSent = await this.sendIfsAppPodRestartEmail(alert, kubeConfig.emailGroupId);
                  break;
                  
                case 'ifsapp_pod_recovered':
                  console.log(`✅ IFS App pod recovered: ${alert.podName}`);
                  emailSent = await this.sendIfsAppPodRecoveredEmail(alert, kubeConfig.emailGroupId);
                  break;
                  
                default:
                  console.log(`ℹ️ Alert type ${alert.type} - no email handler`);
              }
              
              if (emailSent) {
                console.log(`✅ Email sent for ${alert.type}`);
              } else if (alert.requiresAlert) {
                console.log(`⚠️ Failed to send email for ${alert.type}`);
              }
              
            } catch (emailError) {
              console.error(`❌ Email error for ${alert.type}:`, emailError.message);
            }
          }
        }
        
        // Log non-alert changes
        const nonAlertChanges = changes.filter(c => !c.requiresAlert);
        if (nonAlertChanges.length > 0) {
          const types = [...new Set(nonAlertChanges.map(c => c.type))];
          console.log(`📝 Other changes (no alert): ${types.join(', ')}`);
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