// backend/services/podLifecycleService.js - FIXED VERSION
// Excludes pods with unready containers from snapshot

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
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Take initial snapshot when server starts - EXCLUDE UNREADY PODS
  async takeInitialSnapshot(pods) {
    console.log('📸 Taking initial pod snapshot...');
    
    // Filter out pods that don't have all containers ready
    const fullyReadyPods = pods.filter(pod => {
      const readyContainers = pod.readyContainers || 0;
      const totalContainers = pod.totalContainers || 1;
      
      // Only include pods where ALL containers are ready (1/1, 2/2, 3/3, etc.)
      const isFullyReady = readyContainers === totalContainers && totalContainers > 0;
      
      if (!isFullyReady) {
        console.log(`⚠️ Excluding pod ${pod.namespace}/${pod.name} from snapshot (${readyContainers}/${totalContainers} ready, status: ${pod.status})`);
      }
      
      return isFullyReady;
    });
    
    console.log(`📊 Snapshot: Including ${fullyReadyPods.length} fully ready pods out of ${pods.length} total`);
    
    const snapshot = {
      timestamp: new Date().toISOString(),
      totalPodsScanned: pods.length,
      fullyReadyPodsIncluded: fullyReadyPods.length,
      excludedUnreadyPods: pods.length - fullyReadyPods.length,
      pods: fullyReadyPods.map(pod => ({
        name: pod.name,
        namespace: pod.namespace,
        status: pod.status,
        ready: pod.ready,
        restarts: pod.restarts || 0,
        node: pod.node,
        readyContainers: pod.readyContainers || 1,
        totalContainers: pod.totalContainers || 1,
        snapshotStatus: 'initial',
        wasFullyReady: true
      }))
    };
    
    // Save snapshot to file
    const fs = require('fs');
    fs.writeFileSync(this.snapshotFile, JSON.stringify(snapshot, null, 2));
    this.initialSnapshot = snapshot;
    this.isInitialized = true;
    
    console.log(`✅ Initial snapshot taken with ${snapshot.pods.length} fully ready pods`);
    console.log(`🚫 Excluded ${snapshot.excludedUnreadyPods} unready pods from monitoring`);
    
    return snapshot;
  }

  // Load the initial snapshot
  loadSnapshot() {
    try {
      if (fs.existsSync(this.snapshotFile)) {
        const data = fs.readFileSync(this.snapshotFile, 'utf8');
        this.initialSnapshot = JSON.parse(data);
        this.isInitialized = true;
        console.log(`📸 Loaded snapshot from ${this.initialSnapshot.timestamp} with ${this.initialSnapshot.pods.length} pods`);
        return this.initialSnapshot;
      }
    } catch (error) {
      console.error('Failed to load snapshot:', error);
    }
    return null;
  }

  // Get comprehensive pod list comparing current state with initial snapshot
  getComprehensivePodList(currentPods = []) {
    if (!this.initialSnapshot) {
      this.loadSnapshot();
      if (!this.initialSnapshot) {
        console.warn('⚠️ No initial snapshot available');
        return currentPods; // Return all current pods if no snapshot
      }
    }

    const result = [];
    const currentPodMap = new Map();
    const processedReplicaSets = new Set();
    
    // Map current pods for quick lookup
    currentPods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      currentPodMap.set(key, pod);
      
      // Track replicaset for this pod
      if (pod.name.includes('-')) {
        const parts = pod.name.split('-');
        if (parts.length >= 2) {
          const replicaSet = parts.slice(0, -1).join('-');
          processedReplicaSets.add(`${pod.namespace}/${replicaSet}`);
        }
      }
    });

    // Check all pods from initial snapshot
    this.initialSnapshot.pods.forEach(snapshotPod => {
      const key = `${snapshotPod.namespace}/${snapshotPod.name}`;
      const currentPod = currentPodMap.get(key);
      
      if (currentPod) {
        // Pod still exists - use current state
        result.push({
          ...currentPod,
          wasInSnapshot: true,
          snapshotStatus: snapshotPod.status,
          wasFullyReadyInSnapshot: true
        });
      } else {
        // Pod was in snapshot but not in current - mark as deleted
        result.push({
          ...snapshotPod,
          isDeleted: true,
          status: 'Deleted',
          wasInSnapshot: true,
          wasFullyReadyInSnapshot: true,
          deletedSinceSnapshot: true
        });
      }
    });

    // Check for new pods not in snapshot
    currentPods.forEach(pod => {
      const key = `${pod.namespace}/${pod.name}`;
      const wasInSnapshot = this.initialSnapshot.pods.some(
        sp => sp.namespace === pod.namespace && sp.name === pod.name
      );
      
      if (!wasInSnapshot) {
        // Check if this pod belongs to a replicaset that was in the snapshot
        let belongsToSnapshotReplicaSet = false;
        
        if (pod.name.includes('-')) {
          const parts = pod.name.split('-');
          if (parts.length >= 2) {
            const replicaSet = parts.slice(0, -1).join('-');
            
            // Check if any pod from this replicaset was in the snapshot
            belongsToSnapshotReplicaSet = this.initialSnapshot.pods.some(sp => {
              if (sp.name.includes('-')) {
                const spParts = sp.name.split('-');
                if (spParts.length >= 2) {
                  const spReplicaSet = spParts.slice(0, -1).join('-');
                  return spReplicaSet === replicaSet && sp.namespace === pod.namespace;
                }
              }
              return false;
            });
          }
        }
        
        // Include the pod if it belongs to a replicaset that was in snapshot
        // OR if it's fully ready (for truly new deployments)
        const readyContainers = pod.readyContainers || 0;
        const totalContainers = pod.totalContainers || 1;
        const isFullyReady = readyContainers === totalContainers;
        
        if (belongsToSnapshotReplicaSet || isFullyReady) {
          result.push({
            ...pod,
            wasInSnapshot: false,
            isNew: true,
            createdAfterSnapshot: true,
            belongsToSnapshotReplicaSet: belongsToSnapshotReplicaSet
          });
        }
      }
    });

    return result;
  }

  // Check if a pod should be included based on readiness
  shouldIncludePod(pod) {
    const readyContainers = pod.readyContainers || 0;
    const totalContainers = pod.totalContainers || 1;
    
    // If pod was in snapshot, always include it (even if now unready or deleted)
    if (pod.wasInSnapshot) {
      return true;
    }
    
    // For new pods, only include if fully ready
    return readyContainers === totalContainers;
  }

  // Get statistics comparing to snapshot
  getSnapshotStatistics(currentPods = []) {
    if (!this.initialSnapshot) {
      return {
        snapshotPods: 0,
        currentPods: currentPods.length,
        deletedPods: 0,
        newPods: 0,
        excludedUnreadyPods: 0
      };
    }

    const comprehensive = this.getComprehensivePodList(currentPods);
    
    // Count unready pods that are being excluded
    const unreadyCurrentPods = currentPods.filter(pod => {
      const readyContainers = pod.readyContainers || 0;
      const totalContainers = pod.totalContainers || 1;
      return readyContainers < totalContainers;
    });
    
    return {
      snapshotTime: this.initialSnapshot.timestamp,
      snapshotPods: this.initialSnapshot.pods.length,
      snapshotExcludedUnready: this.initialSnapshot.excludedUnreadyPods || 0,
      currentPods: comprehensive.filter(p => !p.isDeleted).length,
      deletedPods: comprehensive.filter(p => p.deletedSinceSnapshot).length,
      newPods: comprehensive.filter(p => p.createdAfterSnapshot).length,
      currentUnreadyExcluded: unreadyCurrentPods.length,
      total: comprehensive.length
    };
  }
}

module.exports = new PodLifecycleService();