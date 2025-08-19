const cron = require('node-cron');
const realOracleService = require('./realOracleService');
const emailService = require('./emailService');
const logService = require('./logService');
const dbConfigService = require('./dbConfigService');
const thresholdService = require('./thresholdService');



class MonitoringService {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.lastStatus = null; // 'UP', 'DOWN', or null
    this.currentDowntimeId = null;
    this.downtimeStartTime = null;
    this.emailSent = false; // Prevent duplicate emails
    
    // Monitoring settings
    this.checkFrequency = '*/1 * * * *'; // Every 1 minute
    this.monitoringLog = [];
    
    console.log('🔍 Monitoring Service initialized');
  }

  // Start continuous monitoring
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Monitoring already running');
      return false;
    }

    const config = dbConfigService.getConfig();
    if (!config.isConfigured) {
      console.log('❌ Cannot start monitoring - database not configured');
      return false;
    }

    console.log(`🚀 Starting database monitoring (checking every minute)`);
    
    // Use node-cron for reliable scheduling
    this.checkInterval = cron.schedule(this.checkFrequency, async () => {
      await this.performCheck();
    }, {
      scheduled: false // Don't start automatically
    });

    // Start the cron job
    this.checkInterval.start();
    this.isMonitoring = true;

    // Perform initial check
    this.performCheck();

    return true;
  }

  // Stop monitoring
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('⚠️ Monitoring not running');
      return false;
    }

    console.log('🛑 Stopping database monitoring');
    
    if (this.checkInterval) {
      this.checkInterval.stop();
      this.checkInterval = null;
    }
    
    this.isMonitoring = false;
    return true;
  }

  // Perform a single database check
  async performCheck() {
    try {
      console.log('🔍 Performing database status check...');
      
      const checkStartTime = Date.now();
      const connectionResult = await realOracleService.checkConnection();
      const checkDuration = Date.now() - checkStartTime;
      
      const currentStatus = connectionResult.isConnected ? 'UP' : 'DOWN';
      const timestamp = new Date();
      
      // Log the check result
      const checkResult = {
        timestamp,
        status: currentStatus,
        responseTime: connectionResult.responseTime || `${checkDuration}ms`,
        error: connectionResult.error || null
      };
      
      this.monitoringLog.push(checkResult);
      
      // Keep only last 100 checks in memory
      if (this.monitoringLog.length > 100) {
        this.monitoringLog = this.monitoringLog.slice(-100);
      }

      console.log(`📊 Database Status: ${currentStatus} (${checkResult.responseTime})`);

      // Handle status changes
      await this.handleStatusChange(currentStatus, timestamp, connectionResult.error);
      await this.handleDatabaseSizeCheck();
      return checkResult;
    } catch (error) {
      console.error('❌ Error during database check:', error);
      
      const errorResult = {
        timestamp: new Date(),
        status: 'DOWN',
        responseTime: 'N/A',
        error: error.message
      };
      
      await this.handleStatusChange('DOWN', errorResult.timestamp, error.message);
      return errorResult;
    }
  }

  // Handle database status changes and trigger alerts
  async handleStatusChange(currentStatus, timestamp, error = null) {
    // If this is the first check, just record the status
    if (this.lastStatus === null) {
      this.lastStatus = currentStatus;
      console.log(`🎯 Initial status recorded: ${currentStatus}`);
      return;
    }

    // Check if status changed
    if (this.lastStatus !== currentStatus) {
      console.log(`🔄 Status changed: ${this.lastStatus} → ${currentStatus}`);
      
      if (currentStatus === 'DOWN') {
        // Database went down
        await this.handleDatabaseDown(timestamp, error);
      } else if (currentStatus === 'UP' && this.lastStatus === 'DOWN') {
        // Database came back up
        await this.handleDatabaseUp(timestamp);
      }
      
      this.lastStatus = currentStatus;
    }
  }

  // Handle database going down
  async handleDatabaseDown(timestamp, error) {
  console.log('🚨 DATABASE WENT DOWN!');
  
  // Start tracking downtime
  this.currentDowntimeId = logService.logDowntimeStart();
  this.downtimeStartTime = timestamp;
  this.emailSent = false;
  
  // Get database email group configuration
  const dbConfig = dbConfigService.getConfig();

  // Send email alert (only once)
  try {
    const emailSent = await this.sendDatabaseDownAlert(error, dbConfig.emailGroupId);
    if (emailSent) {
      this.emailSent = true;
      console.log('📧 Database down alert email sent successfully');
    } else {
      console.log('❌ Failed to send database down alert email');
    }
  } catch (emailError) {
    console.error('❌ Error sending database down alert:', emailError);
  }

  // *** ADD THIS NEW CODE FOR AUTO-RECOVERY ***
  // Trigger auto-recovery after a short delay
  setTimeout(async () => {
    try {
      console.log('🔧 Checking if auto-recovery is enabled...');
      const databaseAutoRecoveryService = require('./databaseAutoRecoveryService');
      
      const recoveryStatus = databaseAutoRecoveryService.getAutoRecoveryStatus();
      console.log(`🔧 Auto-recovery enabled: ${recoveryStatus.enabled}`);
      
      if (recoveryStatus.enabled) {
        console.log('🚨 Triggering automatic database recovery...');
        const recoveryResult = await databaseAutoRecoveryService.handleDatabaseDown();
        
        if (recoveryResult) {
          console.log('✅ Auto-recovery completed successfully!');
        } else {
          console.log('❌ Auto-recovery failed or reached max attempts');
        }
      } else {
        console.log('📋 Auto-recovery is disabled, skipping automatic recovery');
      }
    } catch (recoveryError) {
      console.error('❌ Auto-recovery process failed:', recoveryError);
    }
  }, 10000); // Wait 10 seconds before attempting recovery (avoid false alarms)
}

  // Handle database coming back up
  async handleDatabaseUp(timestamp) {
    console.log('✅ DATABASE IS BACK UP!');
    
    let downtime = 'Unknown';
    
    // Calculate downtime if we have the start time
    if (this.downtimeStartTime) {
      const downtimeMs = timestamp - this.downtimeStartTime;
      const minutes = Math.floor(downtimeMs / 60000);
      const seconds = Math.floor((downtimeMs % 60000) / 1000);
      downtime = `${minutes}m ${seconds}s`;
    }
    
    // End downtime logging
    if (this.currentDowntimeId) {
      logService.logDowntimeEnd(this.currentDowntimeId);
    }
    
    // Send recovery email
    try {
      const emailSent = await emailService.sendUpAlert(downtime);
      if (emailSent) {
        console.log('📧 Recovery alert email sent successfully');
      } else {
        console.log('❌ Failed to send recovery alert email');
      }
    } catch (emailError) {
      console.error('❌ Error sending recovery alert:', emailError);
    }
    
    // Reset downtime tracking
    this.currentDowntimeId = null;
    this.downtimeStartTime = null;
    this.emailSent = false;
  }

  async sendDatabaseDownAlert(error, emailGroupId) {
  try {
    const emailService = require('./emailService');
    
    if (!emailGroupId) {
      console.log('⚠️ No email group configured for database alerts');
      return false;
    }
    
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
    
    if (!targetGroup || targetGroup.emails.length === 0) {
      console.log('⚠️ No valid email group found for database alerts');
      return false;
    }

    const currentTime = new Date();
    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: '🚨 CRITICAL ALERT: Oracle Database is DOWN',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🚨 DATABASE ALERT</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #dc3545;">
            <h2 style="color: #dc3545; margin-top: 0;">Database Status: DOWN</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 30%;">Status:</td>
                <td style="padding: 8px; color: #dc3545;">🔴 OFFLINE</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Alert Time:</td>
                <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Alert Group:</td>
                <td style="padding: 8px;">${targetGroup.name}</td>
              </tr>
              ${error ? `
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Error:</td>
                <td style="padding: 8px; color: #dc3545;">${error}</td>
              </tr>
              ` : ''}
            </table>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⚠️ IMMEDIATE ACTION REQUIRED</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li>Check database server status immediately</li>
                <li>Verify network connectivity to database host</li>
                <li>Review database error logs</li>
                <li>Contact system administrator if needed</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">This alert was sent to: ${targetGroup.name}</p>
            <p style="margin: 5px 0 0 0;">You will receive another email when the database is back online</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log('📧 ✅ Database DOWN alert email sent successfully');
    return true;
  } catch (error) {
    console.error('📧 ❌ Failed to send database DOWN alert email:', error);
    return false;
  }
}

  async handleDatabaseSizeCheck() {
  try {
    const threshold = thresholdService.getDbSizeThreshold();
    
    if (!threshold.enabled) return;

    const dashboardData = await realOracleService.getRealtimeDashboardData();
    const currentSizeGB = dashboardData?.size?.totalSizeGB || 0;

    // Check if size dropped below threshold
    if (currentSizeGB < threshold.minSizeGB) {
      const now = new Date();
      const lastAlert = threshold.lastAlertSent ? new Date(threshold.lastAlertSent) : null;
      
      // Only send alert once per day
      if (!lastAlert || (now - lastAlert) > 24 * 60 * 60 * 1000) {
        await this.sendDatabaseSizeAlert(currentSizeGB, threshold.minSizeGB, threshold.emailGroupId);
        
        // Update last alert time
        thresholdService.updateDbSizeThreshold({
          ...threshold,
          lastAlertSent: now.toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Database size check failed:', error);
  }
}

async sendDatabaseSizeAlert(currentSize, thresholdSize, emailGroupId) {
  try {
    const emailService = require('./emailService');
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
    
    if (!targetGroup) {
      console.log('No valid email group found for database size alert');
      return;
    }

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: '⚠️ DATABASE SIZE ALERT - Below Threshold',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #fa8c16; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">⚠️ DATABASE SIZE ALERT</h1>
          </div>
          
          <div style="padding: 20px; background-color: #fff7e6; border-left: 5px solid #fa8c16;">
            <h2 style="color: #fa8c16;">Database Size Below Threshold</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold;">Current Size:</td>
                <td style="padding: 8px; color: #fa8c16; font-weight: bold;">${currentSize} GB</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Threshold:</td>
                <td style="padding: 8px;">${thresholdSize} GB</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Alert Time:</td>
                <td style="padding: 8px;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0;">
              <h3 style="margin-top: 0;">⚠️ ACTION REQUIRED</h3>
              <ul style="margin: 10px 0;">
                <li>Investigate database size reduction</li>
                <li>Check for data purging or compression</li>
                <li>Verify backup and archival processes</li>
                <li>Monitor for potential data loss</li>
              </ul>
            </div>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log('📧 Database size alert sent successfully');
  } catch (error) {
    console.error('Failed to send database size alert:', error);
  }
}

  // Get current monitoring status
  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      lastStatus: this.lastStatus,
      isCurrentlyDown: this.lastStatus === 'DOWN',
      currentDowntimeId: this.currentDowntimeId,
      downtimeStartTime: this.downtimeStartTime,
      checkFrequency: this.checkFrequency,
      totalChecks: this.monitoringLog.length,
      recentChecks: this.monitoringLog.slice(-10) // Last 10 checks
    };
  }

  // Get monitoring history
  getMonitoringHistory() {
    return this.monitoringLog;
  }

  // Update check frequency
  updateCheckFrequency(newFrequency) {
    this.checkFrequency = newFrequency;
    
    if (this.isMonitoring) {
      console.log(`🔄 Updating monitoring frequency to: ${newFrequency}`);
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  // Force a manual check
  async forceCheck() {
    console.log('🔍 Manual database check requested');
    return await this.performCheck();
  }
}

module.exports = new MonitoringService();