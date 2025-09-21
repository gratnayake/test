const cron = require('node-cron');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');
const podLifecycleService = require('./podLifecycleService');
const emailService = require('./emailService');

// Import our new unified components
const PodEventClassifier = require('./podEventClassifier');
const UnifiedEmailTemplates = require('./unifiedEmailTemplates');
const alertConfig = require('../config/alertConfig');

class MasterPodAlertService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.alertQueue = new Map(); // Smart batching queue
    this.activeTimers = new Map(); // Track pending alerts
    
    // Initialize our unified components
    this.classifier = new PodEventClassifier();
    this.templates = new UnifiedEmailTemplates();
    this.config = alertConfig;
    
    // Monitoring frequency
    this.checkFrequency = '*/15 * * * * *'; // Every 15 seconds
    
    console.log('🎯 Master Pod Alert Service initialized');
    console.log(`📊 Config loaded: ${Object.keys(this.config).join(', ')}`);
  }

  /**
   * Start the unified monitoring system
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Master pod monitoring already running');
      return false;
    }

    const kubeConfig = kubernetesConfigService.getConfig();
    if (!kubeConfig.isConfigured) {
      console.log('❌ Cannot start - Kubernetes not configured');
      return false;
    }

    if (!kubeConfig.emailGroupId) {
      console.log('⚠️ Master monitoring started without email alerts - no email group configured');
    }

    console.log('🚀 Starting Master Pod Alert Service...');
    console.log(`📅 Check frequency: ${this.checkFrequency}`);
    console.log(`📧 Email group: ${kubeConfig.emailGroupId || 'None'}`);
    
    // Start the monitoring cron job
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

    console.log('✅ Master Pod Alert Service started successfully');
    return true;
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Master pod monitoring not running');
      return false;
    }

    console.log('🛑 Stopping Master Pod Alert Service...');
    
    if (this.checkInterval) {
      this.checkInterval.stop();
      this.checkInterval = null;
    }

    // Clear any pending alert timers
    this.activeTimers.forEach((timer, key) => {
      clearTimeout(timer);
      console.log(`⏰ Cleared pending alert timer: ${key}`);
    });
    this.activeTimers.clear();
    this.alertQueue.clear();
    
    this.isMonitoring = false;
    console.log('✅ Master Pod Alert Service stopped');
    return true;
  }

  /**
   * Main monitoring loop - checks for pod changes and processes alerts
   */
  async checkForPodChanges() {
    try {
      console.log('🔍 [Master] Checking for pod changes...');
      
      // Get current pods from Kubernetes
      let currentPods = [];
      try {
        const allPods = await kubernetesService.getAllPodsWithContainers();
        
        // Apply filtering (same logic as old system)
        currentPods = allPods.filter(pod => {
          // Exclude Completed/Succeeded pods from monitoring
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
        
        console.log(`📡 [Master] Current active pods: ${currentPods.length} (filtered from ${allPods.length} total)`);
      } catch (k8sError) {
        console.log('⚠️ [Master] Could not fetch current pods from K8s:', k8sError.message);
        return;
      }
      
      // Update lifecycle tracking and get changes (reuse existing logic)
      const changes = await podLifecycleService.updatePodLifecycle(currentPods);
      
      if (changes.length > 0) {
        console.log(`🔄 [Master] Pod changes detected: ${changes.length}`);
        await this.processChanges(changes);
      } else {
        console.log(`✅ [Master] No pod changes detected`);
      }
      
    } catch (error) {
      console.error('❌ [Master] Pod monitoring check failed:', error);
    }
  }

  /**
   * Process detected changes through the unified alert system
   */
  async processChanges(changes) {
    try {
      // Get Kubernetes configuration
      const kubeConfig = kubernetesConfigService.getConfig();
      if (!kubeConfig.emailGroupId) {
        console.log('⚠️ [Master] No email group configured - logging changes only');
        console.log('📝 [Master] Changes detected:', changes.map(c => `${c.type}: ${c.message || c.namespace}`));
        return;
      }

      // STEP 1: Classify all events using our smart classifier
      console.log('🧠 [Master] Classifying events...');
      const classified = this.classifier.classifyEvents(changes);
      
      console.log(`📊 [Master] Classification result:`);
      console.log(`   Critical: ${classified.events.critical.length}`);
      console.log(`   Warning: ${classified.events.warning.length}`);  
      console.log(`   Info: ${classified.events.info.length}`);
      console.log(`   Action: ${classified.recommendedAction.action}`);

      // STEP 2: Process each priority level with appropriate timing
      await this.processClassifiedEvents(classified, kubeConfig.emailGroupId);

    } catch (error) {
      console.error('❌ [Master] Failed to process changes:', error);
    }
  }

  /**
   * Process classified events with smart timing and batching
   */
  async processClassifiedEvents(classified, emailGroupId) {
    const { events, recommendedAction } = classified;

    // CRITICAL EVENTS: Send immediately (no batching)
    if (events.critical.length > 0) {
      console.log('🚨 [Master] Processing CRITICAL events immediately...');
      await this.sendImmediateAlert(events.critical, 'critical', emailGroupId);
    }

    // WARNING EVENTS: Use smart batching
    if (events.warning.length > 0) {
      console.log('⚠️ [Master] Batching WARNING events...');
      this.addToBatch(events.warning, 'warning', emailGroupId);
    }

    // INFO EVENTS: Quick processing (short batch)
    if (events.info.length > 0) {
      console.log('ℹ️ [Master] Quick-batching INFO events...');
      this.addToBatch(events.info, 'info', emailGroupId);
    }
  }

  /**
   * Send immediate alert for critical events (no batching)
   */
  async sendImmediateAlert(events, alertType, emailGroupId) {
    try {
      console.log(`🚨 [Master] Sending immediate ${alertType} alert for ${events.length} events`);
      
      // Get email group
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
      
      if (!targetGroup || targetGroup.emails.length === 0) {
        console.log('⚠️ [Master] No valid email group found for immediate alert');
        return false;
      }

      // Determine alert details based on events
      const firstEvent = events[0];
      const title = this.generateAlertTitle(events, alertType);
      const subtitle = this.generateAlertSubtitle(events, alertType);
      
      // Generate unified email using our new template system
      const emailHTML = this.templates.generatePodAlert({
        alertType: alertType,
        title: title,
        subtitle: subtitle,
        classification: firstEvent.classification,
        events: events,
        summary: {
          totalChanges: events.length,
          massEvents: events.filter(e => e.classification?.category === 'mass_disappearance').length,
          individualEvents: events.filter(e => e.classification?.category === 'individual_change').length,
          recoveryEvents: events.filter(e => e.classification?.category === 'recovery').length
        },
        targetGroup: targetGroup,
        timestamp: new Date()
      });

      // Send the email
      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: `🚨 ${title}`,
        html: emailHTML
      };

      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 ✅ [Master] Immediate ${alertType} alert sent successfully to ${targetGroup.emails.length} recipients`);
      return true;

    } catch (error) {
      console.error(`❌ [Master] Failed to send immediate ${alertType} alert:`, error);
      return false;
    }
  }

  /**
   * Add events to smart batching queue
   */
  addToBatch(events, alertType, emailGroupId) {
    const queueKey = `${alertType}_${emailGroupId}`;
    
    // Add events to queue
    if (!this.alertQueue.has(queueKey)) {
      this.alertQueue.set(queueKey, {
        events: [],
        alertType: alertType,
        emailGroupId: emailGroupId,
        firstEventTime: new Date()
      });
    }
    
    const batch = this.alertQueue.get(queueKey);
    batch.events.push(...events);
    
    console.log(`📝 [Master] Added ${events.length} events to ${alertType} batch (${batch.events.length} total)`);

    // Determine timing based on alert type and config
    const timing = this.getBatchTiming(alertType, batch.events);
    
    // Clear existing timer for this batch
    if (this.activeTimers.has(queueKey)) {
      clearTimeout(this.activeTimers.get(queueKey));
    }
    
    // Set new timer
    const timer = setTimeout(async () => {
      await this.sendBatchAlert(queueKey);
    }, timing);
    
    this.activeTimers.set(queueKey, timer);
    console.log(`⏰ [Master] ${alertType} batch scheduled to send in ${timing/1000} seconds`);
  }

  /**
   * Get appropriate timing for batched alerts
   */
  getBatchTiming(alertType, events) {
    // Use config-based timing
    switch (alertType) {
      case 'critical':
        return this.config.timing.immediate;
      case 'warning':
        return this.config.timing.batched;
      case 'info':
        return this.config.timing.quick;
      default:
        return this.config.timing.batched;
    }
  }

  /**
   * Send batched alert
   */
  async sendBatchAlert(queueKey) {
    try {
      const batch = this.alertQueue.get(queueKey);
      if (!batch || batch.events.length === 0) {
        console.log(`⚠️ [Master] No events in batch ${queueKey} to send`);
        return;
      }

      console.log(`📧 [Master] Sending batch alert for ${queueKey} with ${batch.events.length} events`);

      // Remove from queue and timers
      this.alertQueue.delete(queueKey);
      this.activeTimers.delete(queueKey);

      // Send the batched alert (reuse immediate alert logic)
      await this.sendImmediateAlert(batch.events, batch.alertType, batch.emailGroupId);

    } catch (error) {
      console.error(`❌ [Master] Failed to send batch alert ${queueKey}:`, error);
    }
  }

  /**
   * Generate appropriate alert title based on events
   */
  generateAlertTitle(events, alertType) {
    if (events.length === 1) {
      const event = events[0];
      if (event.classification?.category === 'mass_disappearance') {
        return `KUBERNETES MASS POD FAILURE`;
      } else if (event.classification?.category === 'individual_change') {
        return `KUBERNETES POD DELETED`;
      } else if (event.classification?.category === 'recovery') {
        return `KUBERNETES POD RECOVERY`;
      }
    }
    
    // Multiple events
    return `KUBERNETES ALERT: ${events.length} CHANGES`;
  }

  /**
   * Generate appropriate alert subtitle
   */
  generateAlertSubtitle(events, alertType) {
    if (events.length === 1) {
      const event = events[0];
      return event.classification?.description || `Pod change in ${event.namespace || 'unknown namespace'}`;
    }
    
    // Multiple events - summarize
    const namespaces = [...new Set(events.map(e => e.namespace).filter(Boolean))];
    return `Multiple pod changes across ${namespaces.length} namespace${namespaces.length === 1 ? '' : 's'}`;
  }

  /**
   * Get service status for monitoring
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      checkFrequency: this.checkFrequency,
      queuedAlerts: this.alertQueue.size,
      activeTimers: this.activeTimers.size,
      config: {
        unifiedDesign: this.config.templates.useUnifiedDesign,
        singlePodAlerts: this.config.classification.singlePodAlerts.enabled,
        massThreshold: this.config.classification.massDisappearanceThreshold
      },
      lastCheck: new Date()
    };
  }


  async sendTestAlert(emailGroupId, alertType = 'warning') {
    console.log(`🧪 [Master] Sending test ${alertType} alert...`);
    
    // Create fake test events
    const testEvents = [{
      type: 'test_pod_change',
      namespace: 'uattest',
      podCount: alertType === 'critical' ? 5 : 1,
      pods: [
        { name: 'test-pod-12345-abcde', namespace: 'uattest', status: 'Running' }
      ],
      classification: {
        priority: alertType,
        category: alertType === 'critical' ? 'mass_disappearance' : 'individual_change',
        description: `Test ${alertType} alert`,
        color: alertType === 'critical' ? '#dc3545' : '#ff9800',
        icon: alertType === 'critical' ? '🚨' : '🔍'
      },
      timestamp: new Date().toISOString(),
      message: `TEST: ${alertType} alert from Master Pod Alert Service`
    }];

    return await this.sendImmediateAlert(testEvents, alertType, emailGroupId);
  }
}

module.exports = new MasterPodAlertService();

