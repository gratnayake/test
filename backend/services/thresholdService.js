// backend/services/thresholdService.js - Enhanced with Kubernetes thresholds

const fs = require('fs');
const path = require('path');

class ThresholdService {
  constructor() {
    this.configFile = path.join(__dirname, '../data/threshold-config.json');
    this.ensureConfigFile();
  }

  ensureConfigFile() {
    if (!fs.existsSync(this.configFile)) {
      const defaultConfig = {
        // Database thresholds
        dbSizeThreshold: {
          enabled: false,
          minSizeGB: 10,
          emailGroupId: null,
          lastAlertSent: null
        },
        
        // Database monitoring thresholds
        databaseThresholds: {
          monitoringEnabled: true,
          connectionTimeoutSeconds: 30,
          checkIntervalMinutes: 1,
          alertCooldownMinutes: 15,
          retryAttempts: 3,
          minDatabaseSizeGB: 5,
          maxTablespaceUsagePercent: 90,
          alertOnConnectionLoss: true,
          alertOnSizeThreshold: true,
          alertOnTablespaceUsage: true,
          alertOnSlowQueries: false,
          slowQueryThresholdSeconds: 10,
          emailGroupId: null,
          lastAlertSent: null
        },

        // Kubernetes thresholds
        kubernetesThresholds: {
          monitoringEnabled: true,
          podFailureThreshold: 3,
          nodeDownThreshold: 1,
          namespaceAlertThreshold: 5,
          checkIntervalMinutes: 2,
          alertCooldownMinutes: 30,
          alertOnPodStops: true,
          alertOnPodFailures: true,
          alertOnNodeIssues: true,
          emailGroupId: null,
          lastAlertSent: null
        },

        lastUpdated: new Date().toISOString()
      };
      this.saveConfig(defaultConfig);
    }
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading threshold config:', error);
      return { 
        dbSizeThreshold: { enabled: false },
        databaseThresholds: { monitoringEnabled: true },
        kubernetesThresholds: { monitoringEnabled: true }
      };
    }
  }

  saveConfig(config) {
    try {
      const configToSave = {
        ...config,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.configFile, JSON.stringify(configToSave, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving threshold config:', error);
      return false;
    }
  }

  // Database size threshold methods (existing)
  updateDbSizeThreshold(settings) {
    const config = this.loadConfig();
    config.dbSizeThreshold = {
      ...config.dbSizeThreshold,
      ...settings
    };
    return this.saveConfig(config);
  }

  getDbSizeThreshold() {
    const config = this.loadConfig();
    return config.dbSizeThreshold;
  }

  // NEW: Database monitoring threshold methods
  updateDatabaseThresholds(settings) {
    const config = this.loadConfig();
    config.databaseThresholds = {
      ...config.databaseThresholds,
      ...settings
    };
    return this.saveConfig(config);
  }

  getDatabaseThresholds() {
    const config = this.loadConfig();
    return config.databaseThresholds;
  }

  // NEW: Kubernetes threshold methods
  updateKubernetesThresholds(settings) {
    const config = this.loadConfig();
    config.kubernetesThresholds = {
      ...config.kubernetesThresholds,
      ...settings
    };
    return this.saveConfig(config);
  }

  getKubernetesThresholds() {
    const config = this.loadConfig();
    return config.kubernetesThresholds;
  }

  // Utility methods for checking thresholds
  shouldAlert(alertType, lastAlertTime, cooldownMinutes = 30) {
    if (!lastAlertTime) return true;
    
    const now = new Date();
    const lastAlert = new Date(lastAlertTime);
    const cooldownMs = cooldownMinutes * 60 * 1000;
    
    return (now - lastAlert) > cooldownMs;
  }

  updateLastAlert(thresholdType, alertSubtype = null) {
    const config = this.loadConfig();
    const now = new Date().toISOString();
    
    switch (thresholdType) {
      case 'database':
        config.databaseThresholds.lastAlertSent = now;
        break;
      case 'kubernetes':
        config.kubernetesThresholds.lastAlertSent = now;
        break;
      case 'dbSize':
        config.dbSizeThreshold.lastAlertSent = now;
        break;
    }
    
    this.saveConfig(config);
  }

  // Get all thresholds
  getAllThresholds() {
    const config = this.loadConfig();
    return {
      database: config.databaseThresholds,
      kubernetes: config.kubernetesThresholds,
      dbSize: config.dbSizeThreshold
    };
  }
}

module.exports = new ThresholdService();