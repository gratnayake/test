// backend/services/systemHeartbeatService.js - Updated to remove enabled check

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const emailService = require('./emailService');

class SystemHeartbeatService {
  constructor() {
    this.isRunning = false; // Track if service is actively running
    this.heartbeatInterval = null;
    this.config = {
      // REMOVED: enabled field - now controlled only by start/stop
      intervalMinutes: 60,
      emailGroupId: null,
      includeSystemStats: true,
      includeHealthSummary: true,
      customMessage: '',
      alertThresholds: {
        maxResponseTime: 5000,
        minUptimeMinutes: 5,
        criticalMemoryMB: 1000,
        maxErrorCount: 5
      }
    };
    this.lastHeartbeat = null;
    this.nextHeartbeat = null;
    this.heartbeatCount = 0;
    this.configPath = path.join(__dirname, '../data/system-heartbeat-config.json');
    
    this.loadConfig();
    if (fs.existsSync(this.configPath)) {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      const savedConfig = JSON.parse(configData);
      if (savedConfig.emailGroupId && !this.config.emailGroupId) {
        this.config.emailGroupId = savedConfig.emailGroupId;
        console.log('💓 Set emailGroupId from saved config:', savedConfig.emailGroupId);
      }
    } catch (error) {
      console.error('Failed to ensure emailGroupId:', error);
    }
  }
    console.log('💓 System Heartbeat Service initialized');
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = JSON.parse(configData);
        
        // IMPORTANT: Don't load 'enabled' field - only use isRunning status
        this.config = { 
          ...this.config, 
          ...loadedConfig,
          // Force remove enabled field if it exists in saved config
          enabled: undefined 
        };
        delete this.config.enabled; // Make sure it's completely removed
        
        console.log('💓 System heartbeat config loaded (enabled field ignored)');
      }
    } catch (error) {
      console.error('❌ Failed to load system heartbeat config:', error);
    }
  }

  saveConfig() {
    try {
      const dataDir = path.dirname(this.configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 Created data directory:', dataDir);
      }
      
      // IMPORTANT: Never save 'enabled' field - only save configuration
      const configToSave = { 
        ...this.config,
        lastUpdated: new Date().toISOString()
      };
      delete configToSave.enabled; // Ensure enabled is never saved
      
      console.log('💾 DEBUG - Saving config to file:', this.configPath);
      console.log('💾 DEBUG - Config to save:', JSON.stringify(configToSave, null, 2));
      
      fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
      
      // VERIFY the file was written
      if (fs.existsSync(this.configPath)) {
        const writtenData = fs.readFileSync(this.configPath, 'utf8');
        console.log('✅ Config saved successfully. File contents:', writtenData);
      } else {
        console.error('❌ Config file does not exist after write attempt');
        return false;
      }
      
      console.log('💓 System heartbeat config saved (without enabled field)');
      return true;
    } catch (error) {
      console.error('❌ Failed to save system heartbeat config:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Config path:', this.configPath);
      return false;
    }
  }


  getConfig() {    
    this.loadConfig();
    if (!this.config.emailGroupId && fs.existsSync(this.configPath)) {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      const savedConfig = JSON.parse(configData);
      if (savedConfig.emailGroupId) {
        this.config.emailGroupId = savedConfig.emailGroupId;
        console.log('🔧 FORCED emailGroupId from saved config:', savedConfig.emailGroupId);
      }
    } catch (error) {
      console.error('Failed to force load emailGroupId:', error);
    }
  }
    return {
      ...this.config,
      isRunning: this.isRunning,
      lastHeartbeat: this.lastHeartbeat,
      nextHeartbeat: this.nextHeartbeat,
      heartbeatCount: this.heartbeatCount
    };
  }

  updateConfig(newConfig) {
  console.log('🔄 DEBUG - Updating config with:', JSON.stringify(newConfig, null, 2));
  console.log('🔄 DEBUG - Current config before update:', JSON.stringify(this.config, null, 2));
  
  // IMPORTANT: Filter out 'enabled' field from updates but keep everything else
  const { enabled, ...configWithoutEnabled } = newConfig;
  
  // Make sure we're properly updating the config
  this.config = { 
    ...this.config, 
    ...configWithoutEnabled 
  };
  
  console.log('🔄 DEBUG - Config after merge:', JSON.stringify(this.config, null, 2));
  
  const saved = this.saveConfig();
  console.log('🔄 DEBUG - Save result:', saved);
  
  // Verify the config was actually updated
  console.log('🔄 DEBUG - Final config emailGroupId:', this.config.emailGroupId);
  
  return saved;
}

  // SIMPLIFIED: Start monitoring (no enabled check)
  startMonitoring(configOverride = null) {
    if (this.isRunning) {
      console.log('⚠️ System heartbeat already running');
      return false;
    }

    if (configOverride) {
      this.updateConfig(configOverride);
    }

    if (!this.config.emailGroupId) {
      console.log('❌ Cannot start heartbeat - no email group configured');
      return false;
    }

    console.log(`💓 Starting system heartbeat (every ${this.config.intervalMinutes} minutes)`);
    
    const cronExpression = this.getCronExpression(this.config.intervalMinutes);
    
    this.heartbeatInterval = cron.schedule(cronExpression, async () => {
      // REMOVED: No enabled check - if service is running, send heartbeats
      await this.sendHeartbeat();
    }, {
      scheduled: false
    });

    this.heartbeatInterval.start();
    this.isRunning = true;

    // Send initial heartbeat
    setTimeout(() => {
      this.sendHeartbeat();
    }, 5000);

    return true;
  }

  stopMonitoring() {
    if (!this.isRunning) {
      console.log('⚠️ System heartbeat not running');
      return false;
    }

    console.log('🛑 Stopping system heartbeat');
    
    if (this.heartbeatInterval) {
      this.heartbeatInterval.stop();
      this.heartbeatInterval = null;
    }
    
    this.isRunning = false;
    this.nextHeartbeat = null;
    return true;
  }

  getCronExpression(intervalMinutes) {
    if (intervalMinutes < 60) {
      return `*/${intervalMinutes} * * * *`;
    } else {
      const hours = Math.floor(intervalMinutes / 60);
      return `0 */${hours} * * *`;
    }
  }

  async sendHeartbeat() {
    try {
      console.log('💓 Sending system heartbeat...');

      const groups = emailService.getEmailGroups();
      const targetGroup = groups.find(g => g.id === this.config.emailGroupId && g.enabled);
      
      if (!targetGroup) {
        console.log('❌ No valid email group found for heartbeat');
        return false;
      }

      const systemInfo = this.getSystemInfo();
      
      const mailOptions = {
        from: emailService.getEmailConfig().user,
        to: targetGroup.emails.join(','),
        subject: '💓 System Heartbeat - Uptime WatchDog is Running',
        html: this.generateHeartbeatEmailHTML(systemInfo, targetGroup)
      };

      await emailService.transporter.sendMail(mailOptions);
      
      this.lastHeartbeat = new Date();
      this.nextHeartbeat = new Date(Date.now() + (this.config.intervalMinutes * 60 * 1000));
      this.heartbeatCount++;
      
      console.log(`💓 ✅ System heartbeat sent successfully (${this.heartbeatCount} total)`);
      return true;
    } catch (error) {
      console.error('💓 ❌ Failed to send system heartbeat:', error);
      return false;
    }
  }

  generateHeartbeatEmailHTML(systemInfo, targetGroup) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #52c41a; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">💓 Monitoring Heartbeat</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Uptime WatchDog is Running</p>
        </div>
        
        <div style="padding: 20px; background-color: #f6ffed; border-left: 5px solid #52c41a;">
          <h2 style="color: #52c41a; margin-top: 0;">✅ Monitoring Status: HEALTHY</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr>
              <td style="padding: 8px; font-weight: bold;">Heartbeat Time:</td>
              <td style="padding: 8px;">${new Date().toLocaleString()}</td>
            </tr>
            <tr style="background-color: #ffffff;">
              <td style="padding: 8px; font-weight: bold;">System Uptime:</td>
              <td style="padding: 8px;">${systemInfo.uptime}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Heartbeat Count:</td>
              <td style="padding: 8px;">${this.heartbeatCount}</td>
            </tr>
            <tr style="background-color: #ffffff;">
              <td style="padding: 8px; font-weight: bold;">Next Heartbeat:</td>
              <td style="padding: 8px;">${new Date(Date.now() + (this.config.intervalMinutes * 60 * 1000)).toLocaleString()}</td>
            </tr>
          </table>
          
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 15px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: #155724;">🛡️ IFS System Health Check</h3>
            <p style="color: #155724; margin: 0;">
              ✅ Application is running normally<br/>
              ✅ Email system is operational<br/>
              ✅ Monitoring services are active<br/>
              ✅ All systems are healthy
            </p>
          </div>

          ${this.config.customMessage ? `
          <div style="background-color: #e3f2fd; border: 1px solid #90caf9; padding: 15px; margin: 15px 0; border-radius: 4px;">
            <h4 style="margin-top: 0; color: #0d47a1;">📝 Custom Message</h4>
            <p style="color: #0d47a1; margin: 0;">${this.config.customMessage}</p>
          </div>
          ` : ''}
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">This heartbeat was sent to: ${targetGroup.name}</p>
          <p style="margin: 5px 0 0 0;">Uptime WatchDog by Tsunami Solutions</p>
        </div>
      </div>
    `;
  }

  getSystemInfo() {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    return {
      uptime: `${days}d ${hours}h ${minutes}m`,
      timestamp: new Date(),
      memoryUsage: process.memoryUsage(),
      version: process.version
    };
  }

  async sendTestHeartbeat() {
    if (!this.config.emailGroupId) {
      throw new Error('No email group configured for heartbeat');
    }
    return await this.sendHeartbeat();
  }

  // UPDATED: Status now shows isRunning instead of enabled
  getStatus() {
    return {
      isRunning: this.isRunning, // Instead of checking config.enabled
      config: this.config,
      lastHeartbeat: this.lastHeartbeat,
      nextHeartbeat: this.nextHeartbeat,
      heartbeatCount: this.heartbeatCount,
      systemInfo: this.getSystemInfo()
    };
  }
}

module.exports = new SystemHeartbeatService();

// ===============================================
// Changes needed in server.js routes:
// ===============================================

/* 
In your server.js, update the routes to work with the new approach:

// UPDATED routes - these would replace existing ones
app.post('/api/system/heartbeat/start', (req, res) => {
  try {
    // SIMPLIFIED: No longer check config.enabled, just start the service
    const started = systemHeartbeatService.startMonitoring();
    
    if (started) {
      res.json({ 
        success: true, 
        message: 'System heartbeat started successfully',
        status: systemHeartbeatService.getStatus()
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'Heartbeat is already running or email group not configured'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/system/heartbeat/stop', (req, res) => {
  try {
    const stopped = systemHeartbeatService.stopMonitoring();
    
    if (stopped) {
      res.json({ 
        success: true, 
        message: 'System heartbeat stopped successfully',
        status: systemHeartbeatService.getStatus()
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'System heartbeat was not running' 
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATED: Auto-start logic (in server.js) - remove enabled check
setTimeout(() => {
  const status = systemHeartbeatService.getStatus();
  // REMOVED: No longer check config.enabled, only check if email group is configured
  if (status.config.emailGroupId) {
    console.log('💓 Auto-starting system heartbeat...');
    const started = systemHeartbeatService.startMonitoring();
    if (started) {
      console.log('✅ System heartbeat started automatically');
    }
  } else {
    console.log('⚠️ System heartbeat email group not configured');
  }
}, 6000);

*/