const fs = require('fs');
const path = require('path');

class EmailConfigService {
  constructor() {
    this.configFile = path.join(__dirname, '../data/email-config.json');
    this.ensureConfigFile();
  }

  ensureConfigFile() {
    if (!fs.existsSync(this.configFile)) {
      const defaultConfig = {
        host: '',
        port: 587,
        user: '',
        password: '',
        isConfigured: false,
        lastUpdated: new Date().toISOString()
      };
      this.saveConfig(defaultConfig);
      console.log('📧 Created default email config file');
    }
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading email config:', error);
      return {
        host: '',
        port: 587,
        user: '',
        password: '',
        isConfigured: false
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
      console.log('💾 Email config saved');
      return true;
    } catch (error) {
      console.error('Error saving email config:', error);
      return false;
    }
  }

  updateConfig(newConfig) {
    const currentConfig = this.loadConfig();
    const updatedConfig = {
      ...currentConfig,
      ...newConfig,
      isConfigured: !!(newConfig.host && newConfig.user && newConfig.password)
    };
    
    return this.saveConfig(updatedConfig);
  }

  getConfig() {
    return this.loadConfig();
  }

  getPublicConfig() {
    const config = this.loadConfig();
    return {
      host: config.host,
      port: config.port,
      user: config.user,
      isConfigured: config.isConfigured,
      lastUpdated: config.lastUpdated
    };
  }

  clearConfig() {
    const emptyConfig = {
      host: '',
      port: 587,
      user: '',
      password: '',
      isConfigured: false
    };
    return this.saveConfig(emptyConfig);
  }
}

module.exports = new EmailConfigService();