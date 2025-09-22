// backend/services/kubernetesMonitoringService.js - COMPLETE REWRITE
// Simple Snapshot-Based Pod Monitoring with Delta Tracking

const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const emailService = require('./emailService');
const kubernetesService = require('./kubernetesService');
const kubernetesConfigService = require('./kubernetesConfigService');

class KubernetesMonitoringService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.checkFrequency = '*/2 * * * *'; // Every 2 minutes
    
    // File paths - use existing snapshot file from podLifecycleService
    this.snapshotFile = path.join(__dirname, '../data/pod-snapshot.json');
    this.deltaFile = path.join(__dirname, '../data/pod-delta.json');
    
    console.log('☸️ Kubernetes Monitoring Service initialized (Snapshot-based with Delta tracking)');
  }

  // Start monitoring
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Kubernetes monitoring already running');
      return false;
    }

    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('❌ Kubernetes not configured');
      return false;
    }

    console.log('🚀 Starting Kubernetes monitoring...');
    
    // Start the cron job for health checks
    this.checkInterval = cron.schedule(this.checkFrequency, () => {
      this.performHealthCheck().catch(error => {
        console.error('❌ Health check failed:', error);
      });
    }, {
      scheduled: false
    });

    this.checkInterval.start();
    this.isMonitoring = true;
    
    console.log('✅ Kubernetes monitoring started');
    return true;
  }

  // Stop monitoring
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Kubernetes monitoring not running');
      return false;
    }

    if (this.checkInterval) {
      this.checkInterval.destroy();
      this.checkInterval = null;
    }

    this.isMonitoring = false;
    console.log('🛑 Kubernetes monitoring stopped');
    return true;
  }

  // Note: Initial snapshot is taken at server startup by podLifecycleService
  // This service reads from the existing snapshot file created at startup

  // Main health check method
  async performHealthCheck() {
    try {
      console.log('🔍 Performing pod health check...');
      
      const config = kubernetesConfigService.getConfig();
      if (!config.isConfigured) {
        console.log('⚠️ Kubernetes not configured - skipping health check');
        return;
      }

      // Load current snapshot (created at server startup)
      const snapshot = await this.loadSnapshot();
      if (!snapshot) {
        console.log('⚠️ No snapshot found - cannot perform health check');
        console.log('💡 Snapshot should be created automatically at server startup');
        return;
      }

      // Get current pod states
      const currentPods = await kubernetesService.getAllPods();
      
      // Compare and find differences
      const differences = await this.comparePods(snapshot.pods, currentPods);
      
      if (differences.hasChanges) {
        console.log(`🔄 Found ${differences.missing.length} missing/changed pods`);
        
        // Update delta file
        await this.updateDeltaFile(differences.missing);
        
        // Send email alert for missing/changed pods
        if (differences.missing.length > 0) {
          await this.sendDownAlert(differences.missing);
        }
      }

      // Check for recovered pods
      const recoveredPods = await this.checkForRecoveredPods(currentPods);
      
      if (recoveredPods.length > 0) {
        console.log(`✅ Found ${recoveredPods.length} recovered pods`);
        
        // Send recovery email
        await this.sendRecoveryAlert(recoveredPods);
        
        // Update snapshot with recovered pods
        await this.updateSnapshotWithRecoveredPods(recoveredPods, currentPods);
        
        // Remove recovered pods from delta
        await this.removeFromDelta(recoveredPods);
      }

      console.log('✅ Health check completed');
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }

  // Compare snapshot pods with current pods
  async comparePods(snapshotPods, currentPods) {
    const snapshotMap = new Map();
    const currentMap = new Map();
    
    // Create maps for easy comparison
    snapshotPods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      snapshotMap.set(key, pod);
    });
    
    currentPods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      currentMap.set(key, pod);
    });
    
    const missing = [];
    const recovered = [];
    
    // Find missing or changed pods
    for (const [key, snapshotPod] of snapshotMap) {
      const currentPod = currentMap.get(key);
      
      if (!currentPod) {
        // Pod is completely missing
        missing.push({
          ...snapshotPod,
          changeType: 'missing',
          reason: 'Pod not found in cluster'
        });
      } else if (this.isPodChanged(snapshotPod, currentPod)) {
        // Pod exists but has significant changes
        missing.push({
          ...snapshotPod,
          changeType: 'changed',
          reason: this.getChangeReason(snapshotPod, currentPod),
          currentStatus: currentPod.status,
          currentRestartCount: currentPod.restartCount
        });
      }
    }
    
    return {
      hasChanges: missing.length > 0,
      missing,
      recovered
    };
  }

  // Check if a pod has significant changes
  isPodChanged(snapshotPod, currentPod) {
    // Check for status changes (healthy -> unhealthy)
    if (snapshotPod.status === 'Running' && currentPod.status !== 'Running') {
      return true;
    }
    
    // Check for restart count increases
    if ((currentPod.restartCount || 0) > (snapshotPod.restartCount || 0)) {
      return true;
    }
    
    // Check for ready state changes
    if (snapshotPod.ready && !currentPod.ready) {
      return true;
    }
    
    return false;
  }

  // Get human-readable reason for pod change
  getChangeReason(snapshotPod, currentPod) {
    const reasons = [];
    
    if (snapshotPod.status !== currentPod.status) {
      reasons.push(`Status: ${snapshotPod.status} → ${currentPod.status}`);
    }
    
    if ((currentPod.restartCount || 0) > (snapshotPod.restartCount || 0)) {
      reasons.push(`Restarted: ${snapshotPod.restartCount || 0} → ${currentPod.restartCount || 0}`);
    }
    
    if (snapshotPod.ready !== currentPod.ready) {
      reasons.push(`Ready: ${snapshotPod.ready} → ${currentPod.ready}`);
    }
    
    return reasons.join(', ');
  }

  // Check for pods that have recovered (exist in delta but are now healthy)
  async checkForRecoveredPods(currentPods) {
    try {
      const delta = await this.loadDelta();
      if (!delta || !delta.pods || delta.pods.length === 0) {
        return [];
      }
      
      const currentMap = new Map();
      currentPods.forEach(pod => {
        const key = `${pod.namespace}/${pod.name}`;
        currentMap.set(key, pod);
      });
      
      const recovered = [];
      
      for (const deltaPod of delta.pods) {
        const key = `${deltaPod.namespace}/${deltaPod.name}`;
        const currentPod = currentMap.get(key);
        
        if (currentPod && this.isPodHealthy(currentPod)) {
          recovered.push({
            ...deltaPod,
            currentPod: currentPod
          });
        }
      }
      
      return recovered;
      
    } catch (error) {
      console.error('❌ Error checking for recovered pods:', error);
      return [];
    }
  }

  // Check if a pod is considered healthy
  isPodHealthy(pod) {
    return pod.status === 'Running' && pod.ready;
  }

  // Update delta file with missing/changed pods
  async updateDeltaFile(missingPods) {
    try {
      await this.ensureDataDirectory();
      
      const delta = {
        timestamp: new Date().toISOString(),
        totalPods: missingPods.length,
        pods: missingPods
      };
      
      await fs.writeFile(this.deltaFile, JSON.stringify(delta, null, 2));
      console.log(`📄 Delta file updated: ${missingPods.length} pods`);
      
    } catch (error) {
      console.error('❌ Failed to update delta file:', error);
    }
  }

  // Remove recovered pods from delta file
  async removeFromDelta(recoveredPods) {
    try {
      const delta = await this.loadDelta();
      if (!delta || !delta.pods) {
        return;
      }
      
      const recoveredKeys = new Set(
        recoveredPods.map(pod => `${pod.namespace}/${pod.name}`)
      );
      
      const remainingPods = delta.pods.filter(pod => {
        const key = `${pod.namespace}/${pod.name}`;
        return !recoveredKeys.has(key);
      });
      
      const updatedDelta = {
        timestamp: new Date().toISOString(),
        totalPods: remainingPods.length,
        pods: remainingPods
      };
      
      await fs.writeFile(this.deltaFile, JSON.stringify(updatedDelta, null, 2));
      console.log(`📄 Removed ${recoveredPods.length} recovered pods from delta`);
      
    } catch (error) {
      console.error('❌ Failed to remove from delta:', error);
    }
  }

  // Update snapshot with recovered pods
  async updateSnapshotWithRecoveredPods(recoveredPods, currentPods) {
    try {
      const snapshot = await this.loadSnapshot();
      if (!snapshot) {
        return;
      }
      
      const currentMap = new Map();
      currentPods.forEach(pod => {
        const key = `${pod.namespace}/${pod.name}`;
        currentMap.set(key, pod);
      });
      
      // Update snapshot pods with current data for recovered pods
      snapshot.pods = snapshot.pods.map(snapshotPod => {
        const key = `${snapshotPod.namespace}/${snapshotPod.name}`;
        const currentPod = currentMap.get(key);
        
        const isRecovered = recoveredPods.some(recovered => 
          recovered.namespace === snapshotPod.namespace && 
          recovered.name === snapshotPod.name
        );
        
        if (isRecovered && currentPod) {
          // Update with current pod data
          return {
            name: currentPod.name,
            namespace: currentPod.namespace,
            status: currentPod.status,
            restartCount: currentPod.restartCount || 0,
            ready: currentPod.ready,
            age: currentPod.age,
            node: currentPod.node || 'unknown'
          };
        }
        
        return snapshotPod;
      });
      
      snapshot.timestamp = new Date().toISOString();
      
      await fs.writeFile(this.snapshotFile, JSON.stringify(snapshot, null, 2));
      console.log(`📸 Snapshot updated with ${recoveredPods.length} recovered pods`);
      
    } catch (error) {
      console.error('❌ Failed to update snapshot:', error);
    }
  }

  // Send email alert for pods that are down
  async sendDownAlert(missingPods) {
    try {
      const config = kubernetesConfigService.getConfig();

      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == config.emailGroupId);
      
      if (!targetGroup || !targetGroup.enabled) {
        console.log('❌ Email group not found or disabled');
        return;
      }
      
      
      const subject = `🚨 Kubernetes Alert: ${missingPods.length} Pod(s) Down`;
      
      let emailBody = `The following pods have issues:\n\n`;
      
      missingPods.forEach(pod => {
        emailBody += `Pod: ${pod.name}\n`;
        emailBody += `Namespace: ${pod.namespace}\n`;
        emailBody += `Previous Status: ${pod.status}\n`;
        emailBody += `Issue: ${pod.changeType === 'missing' ? 'Pod Missing' : pod.reason}\n`;
        if (pod.currentStatus) {
          emailBody += `Current Status: ${pod.currentStatus}\n`;
        }
        emailBody += `Node: ${pod.node}\n`;
        emailBody += `---\n`;
      });
      
      emailBody += `\nTime: ${new Date().toISOString()}\n`;
      emailBody += `Cluster: ${config.kubeconfigPath}\n`;
      
      // Use the correct email method
      const mailOptions = {
        to: targetGroup.emails,
        subject: subject,
        text: emailBody
      };
      
      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 Down alert sent for ${missingPods.length} pods`);
      
    } catch (error) {
      console.error('❌ Failed to send down alert:', error);
    }
  }

  // Send email alert for recovered pods
  async sendRecoveryAlert(recoveredPods) {
    try {
      const config = kubernetesConfigService.getConfig();
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == config.emailGroupId);
      
      if (!targetGroup || !targetGroup.enabled) {
        console.log('❌ Email group not found or disabled');
        return;
      }
      
      const subject = `✅ Kubernetes Recovery: ${recoveredPods.length} Pod(s) Back Online`;
      
      let emailBody = `The following pods have recovered:\n\n`;
      
      recoveredPods.forEach(pod => {
        emailBody += `Pod: ${pod.name}\n`;
        emailBody += `Namespace: ${pod.namespace}\n`;
        emailBody += `Status: ${pod.currentPod.status}\n`;
        emailBody += `Ready: ${pod.currentPod.ready}\n`;
        emailBody += `Node: ${pod.currentPod.node}\n`;
        emailBody += `---\n`;
      });
      
      emailBody += `\nTime: ${new Date().toISOString()}\n`;
      emailBody += `All pods are now healthy and have been restored to the baseline snapshot.\n`;
      
      const mailOptions = {
        to: targetGroup.emails,
        subject: subject,
        text: emailBody
      };
      
      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 Recovery alert sent for ${recoveredPods.length} pods`);
      
    } catch (error) {
      console.error('❌ Failed to send recovery alert:', error);
    }
  }

  // Load snapshot from file
  async loadSnapshot() {
    try {
      const data = await fs.readFile(this.snapshotFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Failed to load snapshot:', error);
      }
      return null;
    }
  }

  // Load delta from file
  async loadDelta() {
    try {
      const data = await fs.readFile(this.deltaFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Failed to load delta:', error);
      }
      return null;
    }
  }

  // Ensure data directory exists
  async ensureDataDirectory() {
    const dataDir = path.dirname(this.snapshotFile);
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }
  }

  // Get current monitoring status
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      checkFrequency: this.checkFrequency,
      snapshotFile: this.snapshotFile,
      deltaFile: this.deltaFile,
      lastCheck: new Date().toISOString()
    };
  }

  // Manual health check (for API endpoint)
  async manualHealthCheck() {
    console.log('🔍 Manual health check requested');
    await this.performHealthCheck();
  }

  // Reset monitoring state (for debugging)
  resetMonitoringState() {
    console.log('🔄 Resetting monitoring state...');
    // This method can be used to clean up files if needed for debugging
  }

  // Baseline check (alias for manual check)
  async performBaselineCheck() {
    await this.manualHealthCheck();
  }
}

module.exports = new KubernetesMonitoringService();