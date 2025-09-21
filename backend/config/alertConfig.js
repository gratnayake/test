const alertConfig = {
  system: {
    migrationMode: 'production',    // Production mode - new system only
    autoStart: true,                // Auto-start new system
    useNewSystemOnly: true,         // Disable old systems
    cleanCutover: true             // Complete replacement
  },

  // Optimized timing for production
  timing: {
    immediate: 0,           // Critical alerts send immediately
    quick: 3000,           // Recovery alerts (3 seconds)
    batched: 15000,        // Individual changes (15 seconds - faster than old)
    heartbeat: 60000       // System health checks
  },

  // Production-ready classification
  classification: {
    massDisappearanceThreshold: 2,  // Lower threshold (2+ pods = mass event)
    
    singlePodAlerts: {
      enabled: true,              // Enable individual pod alerts
      excludeCompleted: true,     // Ignore completed/succeeded pods
      excludeJobPods: true       // Ignore job pods
    },

    recovery: {
      enabled: true,
      minRecoveryTime: 10000,    // 10 seconds before declaring recovery
      trackDowntime: true        // Track downtime duration
    },

    restarts: {
      enabled: true,
      threshold: 1,              // Alert on any restart
      cooldown: 180000          // 3 minute cooldown per pod (reduced)
    }
  },

  // Production email settings
  templates: {
    useUnifiedDesign: true,
    includeDiagnostics: true,
    showClusterOverview: true,
    maxPodsInEmail: 15         // Show more pods in production emails
  },

  features: {
    smartBatching: true,
    contextualAlerts: true,
    escalation: false,         // Can enable later
    maintenanceMode: false     // Can enable for planned maintenance
  }
};

module.exports = alertConfig;