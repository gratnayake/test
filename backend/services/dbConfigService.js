const fs = require('fs');
const path = require('path');

class DbConfigService {
  constructor() {
    this.configFile = path.join(__dirname, '../data/db-config.json');
    this.ensureDataDirectory();
  }

  ensureDataDirectory() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Created data directory');
    }
  }

  getConfig() {
    try {
      if (!fs.existsSync(this.configFile)) {
        console.log('📄 No database config file found, returning default config');
        return this.getDefaultConfig();
      }

      const data = fs.readFileSync(this.configFile, 'utf8');
      const config = JSON.parse(data);
      
      // Ensure all required fields exist
      const completeConfig = {
        ...this.getDefaultConfig(),
        ...config,
        isConfigured: !!(config.host && config.port && config.serviceName && config.username && config.password)
      };

      console.log('📄 Database config loaded:', {
        isConfigured: completeConfig.isConfigured,
        host: completeConfig.host,
        emailGroupId: completeConfig.emailGroupId || 'none'
      });

      return completeConfig;
    } catch (error) {
      console.error('❌ Error loading database config:', error);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      host: '',
      port: 1521,
      serviceName: '',
      username: '',
      password: '',
      emailGroupId: null, // Add email group support
      isConfigured: false,
      createdAt: null,
      updatedAt: null
    };
  }

  updateConfig(configData) {
    try {
      const currentConfig = this.getConfig();
      
      // Merge new data with existing config
      const updatedConfig = {
        ...currentConfig,
        host: configData.host,
        port: parseInt(configData.port) || 1521,
        serviceName: configData.serviceName,
        username: configData.username,
        password: configData.password,
        emailGroupId: configData.emailGroupId || null, // Save email group ID
        isConfigured: !!(configData.host && configData.port && configData.serviceName && configData.username && configData.password),
        updatedAt: new Date().toISOString()
      };

      // Set createdAt if this is the first time
      if (!currentConfig.createdAt) {
        updatedConfig.createdAt = new Date().toISOString();
      }

      // Save to file
      fs.writeFileSync(this.configFile, JSON.stringify(updatedConfig, null, 2));
      
      console.log('✅ Database config saved successfully:', {
        host: updatedConfig.host,
        port: updatedConfig.port,
        serviceName: updatedConfig.serviceName,
        username: updatedConfig.username,
        emailGroupId: updatedConfig.emailGroupId,
        isConfigured: updatedConfig.isConfigured
      });

      return true;
    } catch (error) {
      console.error('❌ Error saving database config:', error);
      return false;
    }
  }

  // Get public config (without password) for API responses
  getPublicConfig() {
    const config = this.getConfig();
    
    // Return config without sensitive information
    const publicConfig = {
      host: config.host,
      port: config.port,
      serviceName: config.serviceName,
      username: config.username,
      emailGroupId: config.emailGroupId,
      isConfigured: config.isConfigured,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    };

    return publicConfig;
  }

  // Get email group configuration for monitoring
  getEmailGroupForAlerts() {
    const config = this.getConfig();
    return config.emailGroupId || null;
  }

  // Check if email alerts are configured
  isEmailAlertsConfigured() {
    const config = this.getConfig();
    return !!(config.isConfigured && config.emailGroupId);
  }

  // Delete configuration
  deleteConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        fs.unlinkSync(this.configFile);
        console.log('🗑️ Database config deleted');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error deleting database config:', error);
      return false;
    }
  }
}

module.exports = new DbConfigService();