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

      // Check for recovered pods and new pods
      const results = await this.checkForRecoveredPods(currentPods);
      
      // Handle recovered pods
      if (results.recovered.length > 0) {
        console.log(`✅ Found ${results.recovered.length} recovered pods`);
        
        // Send recovery email
        await this.sendRecoveryAlert(results.recovered);
        
        // Update snapshot with recovered pods
        await this.updateSnapshotWithRecoveredPods(results.recovered, currentPods);
        
        // Remove recovered pods from delta
        await this.removeFromDelta(results.recovered);
      }
      
      // Handle new pods
      if (results.newPods.length > 0) {
        console.log(`🆕 Found ${results.newPods.length} new pods not in snapshot`);
        
        // For now, just log the new pods - we can implement alerts later
        console.log('New pods detected:', results.newPods.map(p => `${p.namespace}/${p.name}`));
        
        
        await this.sendNewPodsAlert(results.newPods);
        await this.addNewPodsToSnapshot(results.newPods);
      }

      console.log('✅ Health check completed');
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }

  async removeFromSnapshot(podsToRemove) {
    try {
      const snapshot = await this.loadSnapshot();
      if (!snapshot || !snapshot.pods) {
        console.log('⚠️ No snapshot found - cannot remove pods');
        return;
      }
      
      const removeKeys = new Set(
        podsToRemove.map(pod => `${pod.namespace}/${pod.name}`)
      );
      
      const remainingPods = snapshot.pods.filter(pod => {
        const key = `${pod.namespace}/${pod.name}`;
        return !removeKeys.has(key);
      });
      
      // Update snapshot
      snapshot.pods = remainingPods;
      snapshot.timestamp = new Date().toISOString();
      snapshot.totalPods = remainingPods.length;
      snapshot.lastUpdated = new Date().toISOString();
      
      await fs.writeFile(this.snapshotFile, JSON.stringify(snapshot, null, 2));
      console.log(`📸 Removed ${podsToRemove.length} pods from snapshot (remaining: ${remainingPods.length})`);
      
    } catch (error) {
      console.error('❌ Failed to remove from snapshot:', error);
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

  // Check for recovered pods (from delta) AND new pods (not in snapshot)
  async checkForRecoveredPods(currentPods) {
    try {
      const results = {
        recovered: [],
        newPods: []
      };
      
      // Check for recovered pods from delta
      const delta = await this.loadDelta();
      if (delta && delta.pods && delta.pods.length > 0) {
        const currentMap = new Map();
        currentPods.forEach(pod => {
          const key = `${pod.namespace}/${pod.name}`;
          currentMap.set(key, pod);
        });
        
        for (const deltaPod of delta.pods) {
          const key = `${deltaPod.namespace}/${deltaPod.name}`;
          const currentPod = currentMap.get(key);
          
          if (currentPod && this.isPodHealthy(currentPod)) {
            results.recovered.push({
              ...deltaPod,
              currentPod: currentPod
            });
          }
        }
      }
      
      // Check for completely new pods not in original snapshot
      const snapshot = await this.loadSnapshot();
      if (snapshot && snapshot.pods) {
        const snapshotMap = new Map();
        snapshot.pods.forEach(pod => {
          const key = `${pod.namespace}/${pod.name}`;
          snapshotMap.set(key, pod);
        });
        
        for (const currentPod of currentPods) {
          const key = `${currentPod.namespace}/${currentPod.name}`;
          
          // If pod is healthy AND not in snapshot AND not already in delta
          if (!snapshotMap.has(key) && this.isPodHealthy(currentPod)) {
            // Check if it's not already in delta (to avoid duplicates)
            const isInDelta = delta && delta.pods && delta.pods.some(dp => 
              dp.namespace === currentPod.namespace && dp.name === currentPod.name
            );
            
            if (!isInDelta) {
              results.newPods.push({
                name: currentPod.name,
                namespace: currentPod.namespace,
                status: currentPod.status,
                restartCount: currentPod.restartCount || 0,
                ready: currentPod.ready,
                age: currentPod.age,
                node: currentPod.node || 'unknown',
                discoveredAt: new Date().toISOString()
              });
            }
          }
        }
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Error checking for recovered/new pods:', error);
      return { recovered: [], newPods: [] };
    }
  }

  // Check if a pod is considered healthy
  isPodHealthy(pod) {
    return pod.status === 'Running' && pod.ready;
  }


  async sendNewPodsAlert(newPods) {
    try {
      const config = kubernetesConfigService.getConfig();
      if (!config.emailGroupId) {
        console.log('⚠️ No email group configured for alerts');
        return;
      }

      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == config.emailGroupId);
      const clusterHealthStatus = await this.checkClusterHealth();

      const subject = `🆕 Kubernetes Alert: ${newPods.length} Recovered Pod(s) Discovered`;
      
      const htmlBody = this.createNewPodsAlertTemplate(newPods, config, clusterHealthStatus);
      
      
      // Use the correct email method
      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails,
        subject: subject,
        html: htmlBody
      };
      
      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 New pods alert sent for ${newPods.length} pods`);
      
    } catch (error) {
      console.error('❌ Failed to send new pods alert:', error);
    }
  }

  // Add new pods to the snapshot
  async addNewPodsToSnapshot(newPods) {
    try {
      const snapshot = await this.loadSnapshot();
      if (!snapshot) {
        console.log('⚠️ No snapshot found - cannot add new pods');
        return;
      }
      
      // Add new pods to the snapshot
      newPods.forEach(newPod => {
        snapshot.pods.push({
          name: newPod.name,
          namespace: newPod.namespace,
          status: newPod.status,
          restartCount: newPod.restartCount || 0,
          ready: newPod.ready,
          age: newPod.age,
          node: newPod.node || 'unknown',
          addedToSnapshot: newPod.discoveredAt
        });
      });
      
      // Update snapshot metadata
      snapshot.timestamp = new Date().toISOString();
      snapshot.totalPods = snapshot.pods.length;
      snapshot.lastUpdated = new Date().toISOString();
      
      await fs.writeFile(this.snapshotFile, JSON.stringify(snapshot, null, 2));
      console.log(`📸 Added ${newPods.length} new pods to snapshot (total: ${snapshot.pods.length})`);
      
    } catch (error) {
      console.error('❌ Failed to add new pods to snapshot:', error);
    }
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
      if (!config.emailGroupId) {
        console.log('⚠️ No email group configured for alerts');
        return;
      }

      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == config.emailGroupId);
      
      if (!targetGroup || !targetGroup.enabled) {
        console.log('❌ Email group not found or disabled');
        return;
      }

      
      const subject = `🚨 Kubernetes Alert: ${missingPods.length} Pod(s) Down`;

      const htmlBody = this.createDownAlertTemplate(missingPods, config);    
      
      
      // Use the correct email method
      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails,
        subject: subject,
        html: htmlBody
      };
      
      await emailService.transporter.sendMail(mailOptions);
      console.log(`📧 Down alert sent for ${missingPods.length} pods`);

      await this.removeFromDelta(missingPods);
      console.log(`🗑️ Removed ${missingPods.length} alerted pods from delta file`);
      
      await this.removeFromSnapshot(missingPods);
      console.log(`📸 Removed ${missingPods.length} alerted pods from snapshot`);

    } catch (error) {
      console.error('❌ Failed to send down alert:', error);
    }
  }

  // Send email alert for recovered pods
  async sendRecoveryAlert(recoveredPods) {
    try {
      const config = kubernetesConfigService.getConfig();
      if (!config.emailGroupId) {
        console.log('⚠️ No email group configured for alerts');
        return;
      }
      
      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id == config.emailGroupId);
      
      if (!targetGroup || !targetGroup.enabled) {
        console.log('❌ Email group not found or disabled');
        return;
      }
      const subject = `✅ Kubernetes Recovery: ${recoveredPods.length} Pod(s) Back Online`;

      const htmlBody = this.createRecoveryAlertTemplate(recoveredPods, config);
      
      // Use the correct email method
      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails,
        subject: subject,
        html: htmlBody
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


  async checkClusterHealth() {
    try {
      const snapshot = await this.loadSnapshot();
      if (!snapshot || !snapshot.pods) {
        return {
          allPodsHealthy: false,
          totalSnapshotPods: 0,
          healthyPods: 0,
          totalCurrentPods: 0,
          missingPods: [],
          error: 'No snapshot available'
        };
      }

      // Get current pods
      const allCurrentPods = await kubernetesService.getAllPods();
      
      // Filter out pods with unready containers (same logic as snapshot creation)
      const fullyReadyCurrentPods = allCurrentPods.filter(pod => {
        const readyContainers = pod.readyContainers || 0;
        const totalContainers = pod.totalContainers || 1;
        
        // Only include pods where ALL containers are ready (same as snapshot logic)
        const isFullyReady = readyContainers === totalContainers;
        
        if (!isFullyReady) {
          console.log(`🔍 Excluding pod ${pod.namespace}/${pod.name} from health check (${readyContainers}/${totalContainers} ready)`);
        }
        
        return isFullyReady;
      });
      
      // Create map of fully ready current pods for quick lookup
      const currentPodsMap = new Map();
      fullyReadyCurrentPods.forEach(pod => {
        const key = `${pod.namespace}/${pod.name}`;
        currentPodsMap.set(key, pod);
      });

      let healthyPods = 0;
      const missingPods = [];

      // Check each snapshot pod
      snapshot.pods.forEach(snapshotPod => {
        const key = `${snapshotPod.namespace}/${snapshotPod.name}`;
        const currentPod = currentPodsMap.get(key);
        
        if (currentPod && this.isPodHealthy(currentPod)) {
          healthyPods++;
        } else {
          // Check if pod exists but not ready, or completely missing
          const podInAllCurrent = allCurrentPods.find(p => 
            p.namespace === snapshotPod.namespace && p.name === snapshotPod.name
          );
          
          missingPods.push({
            name: snapshotPod.name,
            namespace: snapshotPod.namespace,
            currentStatus: podInAllCurrent ? 
              `${podInAllCurrent.status} (${podInAllCurrent.readyContainers || 0}/${podInAllCurrent.totalContainers || 1})` : 
              'Missing'
          });
        }
      });

      const allPodsHealthy = healthyPods === snapshot.pods.length;

      console.log(`🔍 Health Check: ${healthyPods}/${snapshot.pods.length} snapshot pods healthy, ${fullyReadyCurrentPods.length} total fully-ready current pods`);

      return {
        allPodsHealthy: allPodsHealthy,
        totalSnapshotPods: snapshot.pods.length,
        healthyPods: healthyPods,
        totalCurrentPods: fullyReadyCurrentPods.length, // Only fully ready pods
        totalCurrentPodsIncludingUnready: allCurrentPods.length, // All pods for reference
        excludedUnreadyPods: allCurrentPods.length - fullyReadyCurrentPods.length,
        missingPods: missingPods,
        healthPercentage: Math.round((healthyPods / snapshot.pods.length) * 100)
      };

    } catch (error) {
      console.error('❌ Failed to check cluster health:', error);
      return {
        allPodsHealthy: false,
        totalSnapshotPods: 0,
        healthyPods: 0,
        totalCurrentPods: 0,
        totalCurrentPodsIncludingUnready: 0,
        excludedUnreadyPods: 0,
        missingPods: [],
        error: error.message
      };
    }
  }

createDownAlertTemplate(missingPods, config) {
    const timestamp = new Date().toISOString();
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Kubernetes Pod Alert</title>
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #dc3545, #c82333); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-weight: bold;">🚨 Kubernetes Alert</h1>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">${missingPods.length} Pod(s) Down</p>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 16px;">⚠️ Action Required</h3>
            <p style="color: #856404; margin: 0; line-height: 1.5;">The following pods have issues and require immediate attention:</p>
          </div>

          <!-- Pod Details Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <thead>
              <tr style="background-color: #dc3545; color: white;">
                <th style="padding: 15px; text-align: left; font-weight: bold;">Pod Name</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Namespace</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Issue</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Node</th>
              </tr>
            </thead>
            <tbody>
              ${missingPods.map((pod, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'}; border-bottom: 1px solid #dee2e6;">
                  <td style="padding: 15px; font-weight: bold; color: #333;">${pod.name}</td>
                  <td style="padding: 15px; color: #666;">${pod.namespace}</td>
                  <td style="padding: 15px;">                    
                      ${pod.changeType === 'missing' ? 'Pod Missing' : pod.reason}                    
                    ${pod.currentStatus ? `<br><small style="color: #666;">Current: ${pod.currentStatus}</small>` : ''}
                  </td>
                  <td style="padding: 15px; color: #666;">${pod.node || 'Unknown'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Summary -->
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #495057; margin: 0 0 15px 0; font-size: 16px;">📊 Summary</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #666;">Total Affected Pods:</span>
              <strong style="color: #dc3545;">${missingPods.length}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #666;">Alert Time:</span>
              <strong>${new Date(timestamp).toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Cluster:</span>
              <strong>${config.kubeconfigPath || 'Default'}</strong>
            </div>
          </div>

          <!-- Actions -->
          <div style="background-color: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 8px; padding: 20px;">
            <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 16px;">🔧 Recommended Actions</h3>
            <ul style="color: #0066cc; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Check pod logs for error messages</li>
              <li>Verify node resources and availability</li>
              <li>Check deployment configurations</li>
              <li>Monitor for automatic recovery</li>
              <li>Contact DevOps team if issues persist</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
          <p style="margin: 0; color: #6c757d; font-size: 14px;">
            Kubernetes Monitoring System | Powered by Node.js
          </p>
          <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 12px;">
            This is an automated alert. Please do not reply to this email.
          </p>
        </div>

      </div>
    </body>
    </html>
    `;
  }

  // Create HTML template for recovery alert
  createRecoveryAlertTemplate(recoveredPods, config) {
    const timestamp = new Date().toISOString();
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Kubernetes Recovery Alert</title>
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #28a745, #218838); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-weight: bold;">✅ Kubernetes Recovery</h1>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">${recoveredPods.length} Pod(s) Back Online</p>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="color: #155724; margin: 0 0 10px 0; font-size: 16px;">🎉 Good News!</h3>
            <p style="color: #155724; margin: 0; line-height: 1.5;">The following pods have successfully recovered and are now running normally:</p>
          </div>

          <!-- Pod Details Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <thead>
              <tr style="background-color: #28a745; color: white;">
                <th style="padding: 15px; text-align: left; font-weight: bold;">Pod Name</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Namespace</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Status</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Node</th>
              </tr>
            </thead>
            <tbody>
              ${recoveredPods.map((pod, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'}; border-bottom: 1px solid #dee2e6;">
                  <td style="padding: 15px; font-weight: bold; color: #333;">${pod.name}</td>
                  <td style="padding: 15px; color: #666;">${pod.namespace}</td>
                  <td style="padding: 15px;">                    
                      ${pod.currentPod.status}                    
                    <br><small style="color: #28a745;">Ready: ${pod.currentPod.ready}</small>
                  </td>
                  <td style="padding: 15px; color: #666;">${pod.currentPod.node || 'Unknown'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Summary -->
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #495057; margin: 0 0 15px 0; font-size: 16px;">📊 Recovery Summary</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #666;">Recovered Pods:</span>
              <strong style="color: #28a745;">${recoveredPods.length}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #666;">Recovery Time:</span>
              <strong>${new Date(timestamp).toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Status:</span>
              <strong style="color: #28a745;">All pods restored to snapshot</strong>
            </div>
          </div>

          <!-- Actions -->
          <div style="background-color: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 8px; padding: 20px;">
            <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 16px;">✅ Next Steps</h3>
            <ul style="color: #0066cc; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Pods have been automatically restored to baseline snapshot</li>
              <li>Monitor for continued stability</li>
              <li>Review logs to understand root cause</li>
              <li>Consider implementing preventive measures</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
          <p style="margin: 0; color: #6c757d; font-size: 14px;">
            Kubernetes Monitoring System | Powered by Node.js
          </p>
          <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 12px;">
            This is an automated alert. Please do not reply to this email.
          </p>
        </div>

      </div>
    </body>
    </html>
    `;
  }

  // Create HTML template for new pods alert
  createNewPodsAlertTemplate(newPods, config, clusterHealthStatus) {
    const timestamp = new Date().toISOString();
    const showClusterHealth = clusterHealthStatus.allPodsHealthy && 
                              clusterHealthStatus.totalCurrentPods === clusterHealthStatus.totalSnapshotPods;
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Kubernetes New Pods Alert</title>
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #17a2b8, #138496); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-weight: bold;">🆕 Pods Recovered</h1>
          <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">${newPods.length} Pod(s) Added to Cluster</p>
          <p>allPodsHealthy ${clusterHealthStatus.allPodsHealthy}  totalCurrentPods ${clusterHealthStatus.totalCurrentPods} totalSnapshotPods ${clusterHealthStatus.totalSnapshotPods}
                              
          ${showClusterHealth ? 
            '<p style="margin: 10px 0 0 0; font-size: 16px; background-color: rgba(40, 167, 69, 0.2); padding: 8px 15px; border-radius: 20px; display: inline-block;">🎉 All Original Pods Healthy</p>' :
            ''
          }
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
          <!-- Discovery Alert -->
          <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="color: #0c5460; margin: 0 0 10px 0; font-size: 16px;">🔍 Discovery Alert</h3>
            <p style="color: #0c5460; margin: 0; line-height: 1.5;">Recovered pods have been detected that were not in the original baseline snapshot:</p>
          </div>

          <!-- Pod Details Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <thead>
              <tr style="background-color: #17a2b8; color: white;">
                <th style="padding: 15px; text-align: left; font-weight: bold;">Pod Name</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Namespace</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Status</th>
                <th style="padding: 15px; text-align: left; font-weight: bold;">Age</th>
              </tr>
            </thead>
            <tbody>
              ${newPods.map((pod, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f8f9fa' : 'white'}; border-bottom: 1px solid #dee2e6;">
                  <td style="padding: 15px; font-weight: bold; color: #333;">${pod.name}</td>
                  <td style="padding: 15px; color: #666;">${pod.namespace}</td>
                  <td style="padding: 15px;">
                    <span style="background-color: #17a2b8; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                      ${pod.status}
                    </span>
                    <br><small style="color: #17a2b8;">Ready: ${pod.ready}</small>
                  </td>
                  <td style="padding: 15px; color: #666;">${pod.age || 'Unknown'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Summary -->
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #495057; margin: 0 0 15px 0; font-size: 16px;">📊 Discovery Summary</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #666;">New Pods Found:</span>
              <strong style="color: #17a2b8;">${newPods.length}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #666;">Discovery Time:</span>
              <strong>${new Date(timestamp).toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Action Taken:</span>
              <strong style="color: #17a2b8;">Added to baseline snapshot</strong>
            </div>
          </div>

          <!-- Actions -->
          <div style="background-color: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 8px; padding: 20px;">
            <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 16px;">📋 Automatic Actions Taken</h3>
            <ul style="color: #0066cc; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Recovered pods have been automatically added to baseline snapshot</li>
              <li>Future monitoring will include these pods</li>
              <li>No manual intervention required</li>
              <li>Pods are healthy and running normally</li>
              <li>Snapshot has been updated with current timestamp</li>
              ${clusterHealthStatus.allPodsHealthy ? 
                '<li style="color: #28a745; font-weight: bold;">🎉 Cluster is now fully healthy with all original pods running!</li>' :
                `<li style="color: #dc3545; font-weight: bold;">⚠️ Note: ${clusterHealthStatus.missingPods.length} original pods still need attention</li>`
              }
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
          <p style="margin: 0; color: #6c757d; font-size: 14px;">
            Kubernetes Monitoring System | Powered by Node.js
          </p>
          <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 12px;">
            This is an automated alert. Please do not reply to this email.
          </p>
        </div>

      </div>
    </body>
    </html>
    `;
  
  
  }
}

module.exports = new KubernetesMonitoringService();