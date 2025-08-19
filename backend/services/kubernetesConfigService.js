// Replace your backend/services/kubernetesConfigService.js with this enhanced version:

const fs = require('fs');
const path = require('path');

class KubernetesConfigService {
  constructor() {
    this.configFile = path.join(__dirname, '../data/kubernetes-config.json');
    this.ensureConfigFile();
  }

  ensureConfigFile() {
    if (!fs.existsSync(this.configFile)) {
      const defaultConfig = {
        kubeconfigPath: '',
        emailGroupId: null,
        thresholds: null, // Add thresholds support
        isConfigured: false,
        lastUpdated: new Date().toISOString()
      };
      this.saveConfig(defaultConfig);
      console.log('☸️ Created default Kubernetes config file');
    }
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configFile, 'utf8');
      const config = JSON.parse(data);
      
      // Ensure all required fields exist
      const completeConfig = {
        kubeconfigPath: config.kubeconfigPath || '',
        emailGroupId: config.emailGroupId || null,
        thresholds: config.thresholds || null, // Include thresholds
        isConfigured: !!(config.kubeconfigPath && config.kubeconfigPath.trim()),
        lastUpdated: config.lastUpdated || new Date().toISOString()
      };

      return completeConfig;
    } catch (error) {
      console.error('Error loading Kubernetes config:', error);
      return {
        kubeconfigPath: '',
        emailGroupId: null,
        thresholds: null,
        isConfigured: false,
        lastUpdated: new Date().toISOString()
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
      console.log('💾 Kubernetes config saved:', {
        kubeconfigPath: configToSave.kubeconfigPath || 'empty',
        emailGroupId: configToSave.emailGroupId || 'none',
        hasThresholds: !!configToSave.thresholds,
        isConfigured: configToSave.isConfigured
      });
      return true;
    } catch (error) {
      console.error('Error saving Kubernetes config:', error);
      return false;
    }
  }

  updateConfig(newConfig) {
    const currentConfig = this.loadConfig();
    const updatedConfig = {
      ...currentConfig,
      ...newConfig,
      isConfigured: !!(newConfig.kubeconfigPath && newConfig.kubeconfigPath.trim())      
    };
    
    console.log('🔄 Updating Kubernetes config:', {
      old: currentConfig,
      new: newConfig,
      merged: updatedConfig
    });
    
    return this.saveConfig(updatedConfig);
  }

  getConfig() {
    return this.loadConfig();
  }

  getPublicConfig() {
    const config = this.loadConfig();
    return {
      kubeconfigPath: config.kubeconfigPath,
      emailGroupId: config.emailGroupId,
      thresholds: config.thresholds, // Include thresholds in public config
      isConfigured: config.isConfigured,
      lastUpdated: config.lastUpdated
    };
  }

  // Email group support methods
  getEmailGroupForAlerts() {
    const config = this.getConfig();
    return config.emailGroupId || null;
  }

  isEmailAlertsConfigured() {
    const config = this.getConfig();
    return !!(config.isConfigured && config.emailGroupId);
  }

  clearConfig() {
    const emptyConfig = {
      kubeconfigPath: '',
      emailGroupId: null,
      thresholds: null,
      isConfigured: false
    };
    return this.saveConfig(emptyConfig);
  }

  validateConfigPath(configPath) {
    try {
      if (!configPath || !configPath.trim()) {
        return { valid: false, error: 'Config path cannot be empty' };
      }

      if (!fs.existsSync(configPath)) {
        return { valid: false, error: 'Config file does not exist at specified path' };
      }

      // Try to read the file to see if it's accessible
      const content = fs.readFileSync(configPath, 'utf8');
      
      // Basic validation - check if it looks like a kubeconfig
      if (!content.includes('apiVersion') && !content.includes('clusters')) {
        return { valid: false, error: 'File does not appear to be a valid kubeconfig' };
      }

      return { valid: true, message: 'Config file is valid and accessible' };
    } catch (error) {
      return { valid: false, error: `Error validating config: ${error.message}` };
    }
  }
}

module.exports = new KubernetesConfigService();