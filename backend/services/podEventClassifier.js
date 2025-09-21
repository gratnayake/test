const alertConfig = require('../config/alertConfig');

class PodEventClassifier {
  constructor() {
    this.config = alertConfig;
    console.log('🧠 Pod Event Classifier initialized');
  }

  /**
   * Classify a set of pod changes into alert categories
   * @param {Array} changes - Raw pod changes from monitoring
   * @returns {Object} Classified events with priorities
   */
  classifyEvents(changes) {
    const classified = {
      critical: [],      // Immediate alerts (mass failures)
      warning: [],       // Individual pod issues
      info: [],          // Recoveries, restarts
      maintenance: []    // Planned changes (future)
    };

    const summary = {
      totalChanges: changes.length,
      massEvents: 0,
      individualEvents: 0,
      recoveryEvents: 0,
      timestamp: new Date()
    };

    // Group changes by type and severity
    changes.forEach(change => {
      const classification = this.classifySingleEvent(change);
      classified[classification.priority].push({
        ...change,
        classification: classification
      });

      // Update summary
      if (classification.category === 'mass_disappearance') {
        summary.massEvents++;
      } else if (classification.category === 'individual_change') {
        summary.individualEvents++;
      } else if (classification.category === 'recovery') {
        summary.recoveryEvents++;
      }
    });

    return {
      events: classified,
      summary: summary,
      recommendedAction: this.getRecommendedAction(classified)
    };
  }

  /**
   * Classify a single pod change event
   */
  classifySingleEvent(change) {
    // Mass disappearance (highest priority)
    if (change.type === 'mass_disappearance' || 
        (change.podCount && change.podCount >= this.config.classification.massDisappearanceThreshold)) {
      return {
        priority: 'critical',
        category: 'mass_disappearance',
        severity: 'high',
        timing: this.config.timing.immediate,
        description: `${change.podCount} pods disappeared in ${change.namespace}`,
        color: '#dc3545',  // Red
        icon: '🚨'
      };
    }

    // Individual pod changes
    if (change.type === 'pod_deleted' || change.type === 'pod_disappeared' || 
        (change.podCount === 1)) {
      // Skip if it's a completed/succeeded pod and we're configured to ignore them
      if (this.config.classification.singlePodAlerts.excludeCompleted && 
          change.pods && change.pods[0] && 
          ['Completed', 'Succeeded'].includes(change.pods[0].status)) {
        return {
          priority: 'info',
          category: 'ignored_completion',
          severity: 'low',
          timing: 0,
          description: 'Completed pod cleanup (ignored)'
        };
      }

      return {
        priority: 'warning',
        category: 'individual_change',
        severity: 'medium',
        timing: this.config.timing.batched,
        description: `Individual pod ${change.podName || 'unknown'} deleted`,
        color: '#ff9800',  // Orange
        icon: '🔍'
      };
    }

    // Recovery events
    if (change.type === 'pod_recovery' || change.type === 'pods_started' ||
        change.type === 'workload_recovered') {
      return {
        priority: 'info',
        category: 'recovery',
        severity: 'low',
        timing: this.config.timing.quick,
        description: `Pod recovery detected`,
        color: '#28a745',  // Green
        icon: '✅'
      };
    }

    // Restart events
    if (change.type === 'pod_restart') {
      return {
        priority: 'info',
        category: 'restart',
        severity: 'medium',
        timing: this.config.timing.batched,
        description: `Pod restart detected`,
        color: '#ffc107',  // Yellow
        icon: '🔄'
      };
    }

    // Default classification
    return {
      priority: 'info',
      category: 'unknown',
      severity: 'low',
      timing: this.config.timing.batched,
      description: 'Unknown pod change',
      color: '#6c757d',  // Gray
      icon: '❓'
    };
  }

  /**
   * Determine what action should be taken based on classified events
   */
  getRecommendedAction(classified) {
    if (classified.critical.length > 0) {
      return {
        action: 'immediate_alert',
        reason: 'Critical pod failures detected',
        timing: this.config.timing.immediate
      };
    }

    if (classified.warning.length > 0) {
      return {
        action: 'batched_alert',
        reason: 'Individual pod changes need attention',
        timing: this.config.timing.batched
      };
    }

    if (classified.info.length > 0) {
      return {
        action: 'info_alert',
        reason: 'Pod recoveries or routine changes',
        timing: this.config.timing.quick
      };
    }

    return {
      action: 'no_alert',
      reason: 'No actionable events detected',
      timing: 0
    };
  }

  /**
   * Smart grouping of events for better email organization
   */
  groupEventsIntelligently(events) {
    const groups = {
      byNamespace: {},
      byWorkload: {},
      byType: {},
      timeline: []
    };

    // Group by namespace
    events.forEach(event => {
      const namespace = event.namespace || 'unknown';
      if (!groups.byNamespace[namespace]) {
        groups.byNamespace[namespace] = [];
      }
      groups.byNamespace[namespace].push(event);
    });

    // Group by workload (deployment, replicaset)
    events.forEach(event => {
      if (event.pods && event.pods.length > 0) {
        event.pods.forEach(pod => {
          const workload = this.extractWorkloadName(pod.name);
          if (!groups.byWorkload[workload]) {
            groups.byWorkload[workload] = [];
          }
          groups.byWorkload[workload].push({...event, pod});
        });
      }
    });

    return groups;
  }

  /**
   * Extract workload name from pod name (e.g., "app-deployment-12345-abcde" -> "app-deployment")
   */
  extractWorkloadName(podName) {
    if (!podName || !podName.includes('-')) {
      return podName || 'unknown';
    }

    const parts = podName.split('-');
    // Remove the last 2 parts (usually random strings for replicaset and pod)
    if (parts.length >= 3) {
      return parts.slice(0, -2).join('-');
    } else if (parts.length === 2) {
      return parts[0];
    }
    return podName;
  }
}

module.exports = PodEventClassifier;
