// backend/services/autoRecoveryConfigService.js
const fs = require('fs');
const path = require('path');

class AutoRecoveryConfigService {
  constructor() {
    this.configFile = path.join(__dirname, '../data/autoRecoveryConfig.json');
    this.ensureConfigFile();
  }

  ensureConfigFile() {
    const configDir = path.dirname(this.configFile);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (!fs.existsSync(this.configFile)) {
      const defaultConfig = {
        enabled: false,
        maxAttempts: 3,
        stopScriptId: null,
        startScriptId: null,
        useArguments: true, // Whether to pass "stop"/"start" as arguments
        waitAfterStop: 5000, // ms to wait after stop script
        waitAfterRestart: 10000, // ms to wait after database restart
        createdAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.configFile, JSON.stringify(defaultConfig, null, 2));
      console.log('📝 Created default auto-recovery config');
    }
  }

  getConfig() {
    try {
      const data = fs.readFileSync(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error reading auto-recovery config:', error);
      return {
        enabled: false,
        maxAttempts: 3,
        stopScriptId: null,
        startScriptId: null,
        useArguments: true,
        waitAfterStop: 5000,
        waitAfterRestart: 10000
      };
    }
  }

  updateConfig(newConfig) {
    try {
      const currentConfig = this.getConfig();
      const updatedConfig = {
        ...currentConfig,
        ...newConfig,
        updatedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.configFile, JSON.stringify(updatedConfig, null, 2));
      console.log('📝 Auto-recovery config updated');
      return updatedConfig;
    } catch (error) {
      console.error('❌ Error updating auto-recovery config:', error);
      throw error;
    }
  }

  // Get available scripts for selection
  getAvailableScripts() {
    try {
      const scriptService = require('./scriptService');
      return scriptService.getAllScripts();
    } catch (error) {
      console.error('❌ Error getting available scripts:', error);
      return [];
    }
  }
}

module.exports = new AutoRecoveryConfigService();