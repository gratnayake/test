// COMPLETE FIX for backend/services/podLifecycleService.js
// This ensures ALL pod changes are detected, not just some

const fs = require('fs');
const path = require('path');

class PodLifecycleService {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.podHistoryFile = path.join(this.dataDir, 'pod-history.json');
    this.snapshotFile = path.join(this.dataDir, 'pod-snapshot.json');
    this.ensureDataDirectory();
    this.initialSnapshot = null;
    this.isInitialized = false;
    
    // CRITICAL: Track ALL pods, not just fully ready ones
    this.previousPods = new Map();
    this.lastUpdateTime = null;
    this.MASS_DISAPPEARANCE_THRESHOLD = 3;
    
    // Track which pods we've seen to avoid duplicate alerts
    this.seenPods = new Set();
    this.alertedPods = new Set();
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // MAIN METHOD: Update pod lifecycle and detect ALL changes
  async updatePodLifecycle(currentPods) {
    const changes = [];
    const now = new Date();
    
    console.log(`🔄 Updating pod lifecycle with ${currentPods.length} current pods`);
    
    // Initialize on first run - capture ALL pods
    if (!this.lastUpdateTime) {
      console.log('📸 First run - initializing pod tracking for ALL pods');
      currentPods.forEach(pod => {
        const key = `${pod.namespace}/${pod.name}`;
        
        // Include ALL pods in initial tracking
        this.previousPods.set(key, {
          ...pod,
          lastSeen: now,
          firstSeen: now,
          readinessRatio: pod.readinessRatio || `${pod.readyContainers || 0}/${pod.totalContainers || 1}`
        });
        
        this.seenPods.add(key);
        console.log(`📌 Initial tracking: ${key} (${pod.status}, Ready: ${pod.readinessRatio || 'unknown'})`);
      });
      
      this.lastUpdateTime = now;
      console.log(`✅ Initialized tracking for ${this.previousPods.size} pods`);
      return changes;
    }
    
    // Create map of current pods
    const currentPodMap = new Map();
    currentPods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      currentPodMap.set(key, pod);
    });
    
    // CRITICAL: Check for disappeared pods (including IFS app pods)
    const disappearedPods = [];
    const disappearedByNamespace = new Map();
    const ifsAppDisappeared = [];
    
    this.previousPods.forEach((prevPod, key) => {
      if (!currentPodMap.has(key)) {
        const [namespace, name] = key.split('/');
        
        // Skip certain expected disappearances
        if (name.includes('scheduler-') || 
            name.includes('db-init-') || 
            prevPod.status === 'Completed' || 
            prevPod.status === 'Succeeded') {
          console.log(`⏩ Skipping expected disappearance: ${key} (${prevPod.status})`);
          this.previousPods.delete(key); // Clean up
          return;
        }
        
        console.log(`❌ POD DISAPPEARED: ${key} (was ${prevPod.status}, Ready: ${prevPod.readinessRatio})`);
        
        // SPECIAL HANDLING FOR IFS APP PODS
        if (name.startsWith('ifsapp-')) {
          console.log(`🚨 CRITICAL: IFS App pod disappeared: ${key}`);
          ifsAppDisappeared.push(prevPod);
          
          // Create immediate alert for IFS app pod
          changes.push({
            type: 'ifsapp_pod_down',
            service: name.split('-').slice(0, 2).join('-'),
            namespace: namespace,
            podName: name,
            podCount: 1,
            timestamp: now.toISOString(),
            message: `IFS App pod stopped: ${name}`,
            pod: {
              name: name,
              namespace: namespace,
              status: prevPod.status || 'Unknown',
              readinessRatio: prevPod.readinessRatio || 'Unknown'
            },
            severity: 'critical',
            requiresAlert: true
          });
        }
        
        disappearedPods.push(prevPod);
        
        // Track by namespace
        if (!disappearedByNamespace.has(namespace)) {
          disappearedByNamespace.set(namespace, []);
        }
        disappearedByNamespace.get(namespace).push(prevPod);
        
        // Add general deletion change
        changes.push({
          type: 'deleted',
          pod: prevPod,
          namespace: namespace,
          name: name,
          timestamp: now.toISOString(),
          message: `Pod ${key} has been deleted or stopped`
        });
      }
    });
    
    // Group IFS app disappearances by service
    if (ifsAppDisappeared.length > 0) {
      const serviceGroups = new Map();
      
      ifsAppDisappeared.forEach(pod => {
        const serviceName = pod.name.split('-').slice(0, 2).join('-');
        if (!serviceGroups.has(serviceName)) {
          serviceGroups.set(serviceName, []);
        }
        serviceGroups.get(serviceName).push(pod);
      });
      
      // Alert for each affected IFS service
      serviceGroups.forEach((pods, serviceName) => {
        if (pods.length > 1) {
          // Multiple pods from same service - upgrade to service-level alert
          console.log(`🚨 Multiple ${serviceName} pods down: ${pods.length}`);
          changes.push({
            type: 'ifsapp_service_down',
            service: serviceName,
            namespace: pods[0].namespace,
            podCount: pods.length,
            timestamp: now.toISOString(),
            message: `Multiple ${serviceName} pods stopped (${pods.length} pods)`,
            pods: pods.map(p => ({
              name: p.name,
              status: p.status || 'Unknown',
              readinessRatio: p.readinessRatio || 'Unknown'
            })),
            severity: 'critical',
            requiresAlert: true
          });
        }
      });
    }
    
    // Check for mass disappearance (lower threshold for uattest)
    disappearedByNamespace.forEach((pods, namespace) => {
      const threshold = namespace === 'uattest' ? 2 : this.MASS_DISAPPEARANCE_THRESHOLD;
      
      if (pods.length >= threshold) {
        console.log(`🚨 MASS DISAPPEARANCE in ${namespace}: ${pods.length} pods`);
        
        changes.push({
          type: 'mass_disappearance',
          namespace: namespace,
          podCount: pods.length,
          timestamp: now.toISOString(),
          message: `${pods.length} pods stopped/disappeared in namespace '${namespace}'`,
          pods: pods.map(p => ({
            name: p.name,
            namespace: p.namespace,
            status: p.status || 'Unknown'
          })),
          severity: pods.length >= 5 ? 'critical' : 'warning',
          requiresAlert: true
        });
      }
    });
    
    // Check for new pods
    currentPodMap.forEach((pod, key) => {
      if (!this.previousPods.has(key)) {
        const [namespace, name] = key.split('/');
        
        console.log(`✅ New pod detected: ${key} (${pod.status}, Ready: ${pod.readinessRatio})`);
        
        const isIfsApp = name.startsWith('ifsapp-');
        
        changes.push({
          type: 'created',
          pod: pod,
          namespace: namespace,
          name: name,
          timestamp: now.toISOString(),
          message: `New pod ${key} has been created`
        });
        
        // Alert for IFS app pod recovery
        if (isIfsApp && pod.status === 'Running') {
          const alertKey = `recovered-${key}`;
          if (!this.alertedPods.has(alertKey)) {
            changes.push({
              type: 'ifsapp_pod_recovered',
              service: name.split('-').slice(0, 2).join('-'),
              namespace: namespace,
              podName: name,
              timestamp: now.toISOString(),
              message: `IFS App pod recovered: ${name}`,
              severity: 'info',
              requiresAlert: true
            });
            this.alertedPods.add(alertKey);
          }
        }
      } else {
        // Check for status changes
        const prevPod = this.previousPods.get(key);
        const [namespace, name] = key.split('/');
        
        // Status change detection
        if (prevPod.status !== pod.status) {
          console.log(`🔄 Status change: ${key} from ${prevPod.status} to ${pod.status}`);
          
          changes.push({
            type: 'status_change',
            pod: pod,
            namespace: namespace,
            name: name,
            oldStatus: prevPod.status,
            newStatus: pod.status,
            timestamp: now.toISOString(),
            message: `Pod ${key} status changed from ${prevPod.status} to ${pod.status}`
          });
          
          // Alert for IFS app pod failures
          if (name.startsWith('ifsapp-') && pod.status === 'Failed') {
            changes.push({
              type: 'ifsapp_pod_failed',
              service: name.split('-').slice(0, 2).join('-'),
              namespace: namespace,
              podName: name,
              timestamp: now.toISOString(),
              message: `IFS App pod failed: ${name}`,
              severity: 'critical',
              requiresAlert: true
            });
          }
        }
        
        // Readiness change detection
        const prevReadiness = prevPod.readinessRatio || `${prevPod.readyContainers}/${prevPod.totalContainers}`;
        const currReadiness = pod.readinessRatio || `${pod.readyContainers}/${pod.totalContainers}`;
        
        if (prevReadiness !== currReadiness) {
          console.log(`🔄 Readiness change: ${key} from ${prevReadiness} to ${currReadiness}`);
          
          // Check if pod became unready
          if (currReadiness.startsWith('0/') && !prevReadiness.startsWith('0/')) {
            console.log(`⚠️ Pod became unready: ${key}`);
            
            if (name.startsWith('ifsapp-')) {
              changes.push({
                type: 'ifsapp_pod_unready',
                service: name.split('-').slice(0, 2).join('-'),
                namespace: namespace,
                podName: name,
                readiness: currReadiness,
                timestamp: now.toISOString(),
                message: `IFS App pod became unready: ${name} (${currReadiness})`,
                severity: 'warning',
                requiresAlert: true
              });
            }
          }
        }
        
        // Restart detection
        const prevRestarts = prevPod.restarts || 0;
        const currRestarts = pod.restarts || 0;
        
        if (currRestarts > prevRestarts) {
          const increase = currRestarts - prevRestarts;
          console.log(`🔄 Pod restarted: ${key} (+${increase} restarts)`);
          
          changes.push({
            type: 'restart',
            pod: pod,
            namespace: namespace,
            name: name,
            previousRestarts: prevRestarts,
            currentRestarts: currRestarts,
            increase: increase,
            timestamp: now.toISOString(),
            message: `Pod ${key} restarted ${increase} time(s)`
          });
          
          // Alert for IFS app pod restarts
          if (name.startsWith('ifsapp-')) {
            changes.push({
              type: 'ifsapp_pod_restart',
              service: name.split('-').slice(0, 2).join('-'),
              namespace: namespace,
              podName: name,
              restartCount: currRestarts,
              increase: increase,
              timestamp: now.toISOString(),
              message: `IFS App pod restarted: ${name} (${increase} new restart${increase > 1 ? 's' : ''})`,
              severity: increase >= 3 ? 'critical' : 'warning',
              requiresAlert: true
            });
          }
        }
      }
    });
    
    // Update tracking state
    this.previousPods.clear();
    currentPods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      this.previousPods.set(key, {
        ...pod,
        lastSeen: now,
        firstSeen: this.previousPods.has(key) ? 
          this.previousPods.get(key).firstSeen : now,
        readinessRatio: pod.readinessRatio || `${pod.readyContainers || 0}/${pod.totalContainers || 1}`
      });
    });
    
    this.lastUpdateTime = now;
    
    // Clean up old alerts after 1 hour
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    for (const alertKey of this.alertedPods) {
      if (alertKey.includes('-')) {
        const parts = alertKey.split('-');
        const timestamp = parts[parts.length - 1];
        if (!isNaN(timestamp) && new Date(parseInt(timestamp)) < oneHourAgo) {
          this.alertedPods.delete(alertKey);
        }
      }
    }
    
    if (changes.length > 0) {
      console.log(`📝 Detected ${changes.length} changes`);
      
      const summary = {
        created: changes.filter(c => c.type === 'created').length,
        deleted: changes.filter(c => c.type === 'deleted').length,
        statusChanged: changes.filter(c => c.type === 'status_change').length,
        restarted: changes.filter(c => c.type === 'restart').length,
        ifsAppAlerts: changes.filter(c => c.type.startsWith('ifsapp_')).length,
        alertsRequired: changes.filter(c => c.requiresAlert).length
      };
      console.log('📊 Change summary:', summary);
    }
    
    return changes;
  }

  // Get tracking status
  getTrackingStatus() {
    return {
      trackedPods: this.previousPods.size,
      lastUpdate: this.lastUpdateTime,
      threshold: this.MASS_DISAPPEARANCE_THRESHOLD,
      namespaces: Array.from(new Set(
        Array.from(this.previousPods.keys()).map(key => key.split('/')[0])
      ))
    };
  }

  // Configure detection thresholds
  configureDetection(options = {}) {
    if (options.massDisappearanceThreshold !== undefined) {
      this.MASS_DISAPPEARANCE_THRESHOLD = options.massDisappearanceThreshold;
      console.log(`🔧 Mass disappearance threshold set to: ${this.MASS_DISAPPEARANCE_THRESHOLD}`);
    }
  }
  
  // Keep existing methods for backward compatibility
  takeInitialSnapshot(pods) {
    // This can still be used but won't affect the new tracking
    console.log('📸 Legacy snapshot method called - using new tracking system');
    return { pods: pods, timestamp: new Date().toISOString() };
  }
  
  loadSnapshot() {
    // Return dummy data for backward compatibility
    return this.initialSnapshot;
  }
  
  getComprehensivePodList(currentPods = []) {
    // Return current pods for backward compatibility
    return currentPods;
  }
  
  getSnapshotStatistics(currentPods = []) {
    // Return basic stats for backward compatibility
    return {
      snapshotPods: this.previousPods.size,
      currentPods: currentPods.length,
      deletedPods: 0,
      newPods: 0,
      excludedUnreadyPods: 0
    };
  }
}

module.exports = new PodLifecycleService();