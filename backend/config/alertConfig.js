const alertConfig = {
  // Alert timing configuration
  timing: {
    immediate: 0,           // Critical alerts (mass pod loss)
    quick: 5000,           // Recovery alerts (5 seconds)
    batched: 30000,        // Individual changes (30 seconds)
    heartbeat: 60000       // System health checks (1 minute)
  },

  // Alert classification rules
  classification: {
    // Mass disappearance threshold
    massDisappearanceThreshold: 3,  // 3+ pods = mass event
    
    // Individual pod alert settings
    singlePodAlerts: {
      enabled: true,                 // Enable single pod alerts
      excludeCompleted: true,        // Ignore completed/succeeded pods
      excludeJobPods: true          // Ignore job pods
    },

    // Recovery detection
    recovery: {
      enabled: true,
      minRecoveryTime: 30000,       // Wait 30s before declaring recovery
      trackDowntime: true           // Track how long pods were down
    },

    // Restart alerts
    restarts: {
      enabled: true,
      threshold: 1,                 // Alert on any restart
      cooldown: 300000             // 5 minute cooldown per pod
    }
  },

  // Email template settings
  templates: {
    useUnifiedDesign: true,         // Use consistent design for all emails
    includeDiagnostics: true,       // Include troubleshooting info
    showClusterOverview: true,      // Show overall cluster health
    maxPodsInEmail: 10             // Limit pod list in emails
  },

  // Advanced features
  features: {
    smartBatching: true,            // Group related alerts intelligently
    contextualAlerts: true,         // Include deployment/namespace context
    escalation: false,              // Future: escalate unack'd alerts
    maintenanceMode: false          // Future: suppress alerts during maintenance
  }
};

module.exports = alertConfig;