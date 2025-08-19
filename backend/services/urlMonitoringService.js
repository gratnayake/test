const axios = require('axios');
const fs = require('fs');
const path = require('path');
const emailService = require('./emailService');
const logService = require('./logService');

class UrlMonitoringService {
  constructor() {
    this.urlsFile = path.join(__dirname, '../data/monitored-urls.json');
    this.ensureUrlsFile();
    this.monitoringIntervals = new Map();
    this.urlStatuses = new Map();
    this.urlDowntimes = new Map(); // Track downtime events
    this.emailSentStatus = new Map(); // Track if email was sent
  }
    
  ensureUrlsFile() {
    if (!fs.existsSync(this.urlsFile)) {
      const defaultUrls = {
        urls: [
          {
            id: 1,
            name: 'Google',
            url: 'https://www.google.com',
            method: 'GET',
            timeout: 5000,
            interval: 60,
            enabled: true,
            expectedStatus: 200,
            createdAt: new Date().toISOString()
          }
        ],
        lastUpdated: new Date().toISOString()
      };
      this.saveUrls(defaultUrls);
      console.log('🌐 Created default URL monitoring config');
    }
  }

  loadUrls() {
    try {
      const data = fs.readFileSync(this.urlsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading URLs:', error);
      return { urls: [], lastUpdated: new Date().toISOString() };
    }
  }

  saveUrls(urlData) {
    try {
      const dataToSave = {
        ...urlData,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.urlsFile, JSON.stringify(dataToSave, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving URLs:', error);
      return false;
    }
  }

  getAllUrls() {
    const data = this.loadUrls();
    return data.urls || [];
  }

  addUrl(urlData) {
    const data = this.loadUrls();
    const newUrl = {
      id: Date.now(),
      name: urlData.name,
      url: urlData.url,
      method: urlData.method || 'GET',
      timeout: urlData.timeout || 5000,
      interval: urlData.interval || 60,
      enabled: urlData.enabled !== false,
      expectedStatus: urlData.expectedStatus || 200,
      createdAt: new Date().toISOString()
    };

    data.urls = data.urls || [];
    data.urls.push(newUrl);
    
    if (this.saveUrls(data)) {
      // Start monitoring if enabled
      if (newUrl.enabled) {
        this.startMonitoringUrl(newUrl);
      }
      return newUrl;
    }
    return null;
  }

  updateUrl(urlId, urlData) {
    const data = this.loadUrls();
    const urlIndex = data.urls.findIndex(u => u.id === parseInt(urlId));
    
    if (urlIndex === -1) return null;
    
    const updatedUrl = {
      ...data.urls[urlIndex],
      ...urlData,
      updatedAt: new Date().toISOString()
    };
    
    data.urls[urlIndex] = updatedUrl;
    
    if (this.saveUrls(data)) {
      // Restart monitoring with new settings
      this.stopMonitoringUrl(urlId);
      if (updatedUrl.enabled) {
        this.startMonitoringUrl(updatedUrl);
      }
      return updatedUrl;
    }
    return null;
  }

  deleteUrl(urlId) {
    const data = this.loadUrls();
    const urlIndex = data.urls.findIndex(u => u.id === parseInt(urlId));
    
    if (urlIndex === -1) return false;
    
    // Stop monitoring
    this.stopMonitoringUrl(urlId);
    
    data.urls.splice(urlIndex, 1);
    return this.saveUrls(data);
  }

  async checkUrl(urlConfig) {
    const startTime = Date.now();
    
    try {
      const response = await axios({
        method: urlConfig.method || 'GET',
        url: urlConfig.url,
        timeout: urlConfig.timeout || 5000,
        validateStatus: function (status) {
          return true; // Don't throw for any status code
        }
      });
      
      const responseTime = Date.now() - startTime;
      const isUp = response.status === (urlConfig.expectedStatus || 200);
      
      return {
        success: true,
        isUp,
        status: response.status,
        responseTime,
        timestamp: new Date(),
        error: null
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        isUp: false,
        status: null,
        responseTime,
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  startMonitoringUrl(urlConfig) {
    const urlId = urlConfig.id;
    
    // Clear existing interval if any
    this.stopMonitoringUrl(urlId);
    
    console.log(`🌐 Starting monitoring for: ${urlConfig.name}`);
    
    // Perform initial check
    this.performUrlCheck(urlConfig);
    
    // Set up interval
    const intervalMs = (urlConfig.interval || 60) * 1000;
    const interval = setInterval(() => {
      this.performUrlCheck(urlConfig);
    }, intervalMs);
    
    this.monitoringIntervals.set(urlId, interval);
  }

  stopMonitoringUrl(urlId) {
    const interval = this.monitoringIntervals.get(parseInt(urlId));
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(parseInt(urlId));
      console.log(`🛑 Stopped monitoring URL ID: ${urlId}`);
    }
  }

  async performUrlCheck(urlConfig) {
    const result = await this.checkUrl(urlConfig);
    
    // Get previous status
    const previousStatus = this.urlStatuses.get(urlConfig.id);
    const wasUp = previousStatus ? previousStatus.isUp : true;
    
    // Store current status
    const currentStatus = {
      ...result,
      urlId: urlConfig.id,
      urlName: urlConfig.name
    };
    
    this.urlStatuses.set(urlConfig.id, currentStatus);
    
    // Check for status changes and handle alerts
    await this.handleStatusChange(urlConfig, wasUp, result.isUp, result);
    
    // Log result
    console.log(`🌐 ${urlConfig.name}: ${result.isUp ? '✅ UP' : '❌ DOWN'} (${result.responseTime}ms)`);
    
    return result;
  }

  startAllMonitoring() {
    const urls = this.getAllUrls();
    const enabledUrls = urls.filter(url => url.enabled);
    
    console.log(`🚀 Starting monitoring for ${enabledUrls.length} URLs`);
    
    enabledUrls.forEach(url => {
      this.startMonitoringUrl(url);
    });
    
    return enabledUrls.length;
  }

  stopAllMonitoring() {
    console.log('🛑 Stopping all URL monitoring');
    
    this.monitoringIntervals.forEach((interval, urlId) => {
      clearInterval(interval);
    });
    
    this.monitoringIntervals.clear();
  }

  getUrlStatuses() {
    const statuses = Array.from(this.urlStatuses.values());
    return statuses;
  }

  getMonitoringStats() {
    const urls = this.getAllUrls();
    const statuses = this.getUrlStatuses();
    
    return {
      totalUrls: urls.length,
      enabledUrls: urls.filter(u => u.enabled).length,
      monitoringActive: this.monitoringIntervals.size,
      upUrls: statuses.filter(s => s.isUp).length,
      downUrls: statuses.filter(s => !s.isUp).length,
      lastUpdated: new Date()
    };
  }

  async handleStatusChange(urlConfig, wasUp, isUp, result) {
  const urlId = urlConfig.id;
  
  if (wasUp && !isUp) {
    // URL went down
    await this.handleUrlDown(urlConfig, result);
  } else if (!wasUp && isUp) {
    // URL came back up
    await this.handleUrlUp(urlConfig, result);
  }
}

async handleUrlDown(urlConfig, result) {
  const urlId = urlConfig.id;
  console.log(`🚨 URL DOWN: ${urlConfig.name}`);
  
  // Start tracking downtime
  const downtimeId = Date.now();
  this.urlDowntimes.set(urlId, {
    id: downtimeId,
    urlName: urlConfig.name,
    url: urlConfig.url,
    startTime: new Date(),
    error: result.error
  });
  
  // Send email alert (only once)
  if (!this.emailSentStatus.get(urlId)  && urlConfig.emailGroupId) {
    try {
      const emailSent = await this.sendUrlDownAlert(urlConfig, result);
      if (emailSent) {
        this.emailSentStatus.set(urlId, true);
        console.log('📧 URL down alert email sent successfully');
      }
    } catch (emailError) {
      console.error('❌ Error sending URL down alert:', emailError);
    }
  }
  
  // Log downtime event
  logService.logDowntimeStart(`URL_${urlId}`, {
    type: 'URL_DOWN',
    urlName: urlConfig.name,
    url: urlConfig.url,
    error: result.error
  });
}

async handleUrlUp(urlConfig, result) {
  const urlId = urlConfig.id;
  console.log(`✅ URL UP: ${urlConfig.name}`);
  console.log('🔍 DEBUG: handleUrlUp called for URL:', {
    id: urlConfig.id,
    name: urlConfig.name,
    url: urlConfig.url,
    emailGroupId: urlConfig.emailGroupId
  });
  
  // Calculate downtime
  const downtimeInfo = this.urlDowntimes.get(urlId);
  console.log('🔍 DEBUG: Downtime info found:', downtimeInfo ? 'YES' : 'NO');
  
  let downtime = 'Unknown';
  
  if (downtimeInfo) {
    const downtimeMs = new Date() - downtimeInfo.startTime;
    const minutes = Math.floor(downtimeMs / 60000);
    const seconds = Math.floor((downtimeMs % 60000) / 1000);
    downtime = `${minutes}m ${seconds}s`;
    console.log('🔍 DEBUG: Calculated downtime:', downtime);
  }
  
  // Send recovery email - this is where the fix happens
  console.log('📧 DEBUG: About to send URL UP alert...');
  console.log('📧 DEBUG: urlConfig.emailGroupId:', urlConfig.emailGroupId);
  
  try {
    const emailSent = await this.sendUrlUpAlert(urlConfig, downtime);
    console.log('📧 DEBUG: sendUrlUpAlert returned:', emailSent);
    
    if (emailSent) {
      console.log('📧 ✅ URL recovery alert email sent successfully');
    } else {
      console.log('❌ Failed to send URL recovery alert email');
    }
  } catch (emailError) {
    console.error('❌ Error sending URL recovery alert:', emailError);
    console.error('❌ Email error stack:', emailError.stack);
  }
  
  // Clean up tracking
  console.log('🔍 DEBUG: Cleaning up tracking for URL ID:', urlId);
  this.urlDowntimes.delete(urlId);
  this.emailSentStatus.delete(urlId);
  
  // Log recovery event
  const logService = require('./logService');
  logService.logDowntimeEnd(`URL_${urlId}`, {
    type: 'URL_UP',
    urlName: urlConfig.name,
    url: urlConfig.url,
    downtime: downtime
  });
  
  console.log('🔍 DEBUG: handleUrlUp complete');
}

async sendUrlDownAlert(urlConfig, result) {
  try {
    const allEmails = emailService.getAllEnabledEmails();
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === urlConfig.emailGroupId && g.enabled);
    
    
    if (!targetGroup || targetGroup.emails.length === 0) {
       console.log('⚠️ No valid email group configured for URL:', urlConfig.name);
      return false;
    }

    const currentTime = new Date();
    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: `🚨 ALERT: URL is DOWN - ${urlConfig.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🚨 URL DOWN ALERT</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #dc3545;">
            <h2 style="color: #dc3545; margin-top: 0;">URL is Currently DOWN</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 30%;">URL Name:</td>
                <td style="padding: 8px;">${urlConfig.name}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">URL:</td>
                <td style="padding: 8px;"><a href="${urlConfig.url}">${urlConfig.url}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Alert Time:</td>
                <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Alert Group:</td>
                <td style="padding: 8px;">${targetGroup.name}</td>
              </tr>
              ${result.error ? `
              <tr>
                <td style="padding: 8px; font-weight: bold;">Error:</td>
                <td style="padding: 8px; color: #dc3545;">${result.error}</td>
              </tr>
              ` : ''}
            </table>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⚠️ IMMEDIATE ACTION REQUIRED</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li>Check if the website/service is accessible</li>
                <li>Verify network connectivity</li>
                <li>Check server status and logs</li>
                <li>Contact system administrator if needed</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">This alert was sent to: ${targetGroup.name}</p>
            <p style="margin: 5px 0 0 0;">You will receive another email when the URL is back online</p>
          </div>
        </div>      
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Failed to send URL down alert:', error);
    return false;
  }
}

async sendUrlUpAlert(urlConfig, downtime) {
  try {
    console.log('📧 DEBUG: Starting sendUrlUpAlert for:', urlConfig.name);
    console.log('📧 DEBUG: URL config emailGroupId:', urlConfig.emailGroupId);
    
    // Use the SAME logic as sendUrlDownAlert - this was the problem!
    const emailService = require('./emailService');
    const groups = emailService.getEmailGroups();
    console.log('📧 DEBUG: Available email groups:', groups.length);
    
    const targetGroup = groups.find(g => g.id === urlConfig.emailGroupId && g.enabled);
    console.log('📧 DEBUG: Target group found:', targetGroup ? targetGroup.name : 'NONE');
    
    if (!targetGroup || targetGroup.emails.length === 0) {
      console.log('⚠️ No valid email group configured for URL UP alerts:', urlConfig.name);
      console.log('📧 DEBUG: emailGroupId:', urlConfig.emailGroupId);
      console.log('📧 DEBUG: Available groups:', groups.map(g => `${g.id}:${g.name}(${g.enabled})`));
      return false;
    }

    console.log('📧 DEBUG: Sending UP alert to emails:', targetGroup.emails);

    const currentTime = new Date();
    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: `✅ RESOLVED: URL is ONLINE - ${urlConfig.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">✅ URL RECOVERY</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #28a745;">
            <h2 style="color: #28a745; margin-top: 0;">URL Status: ONLINE</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 30%;">URL Name:</td>
                <td style="padding: 8px;">${urlConfig.name}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">URL:</td>
                <td style="padding: 8px;"><a href="${urlConfig.url}">${urlConfig.url}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Status:</td>
                <td style="padding: 8px; color: #28a745;">🟢 ONLINE</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Recovery Time:</td>
                <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Total Downtime:</td>
                <td style="padding: 8px; color: #dc3545; font-weight: bold;">${downtime}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Alert Group:</td>
                <td style="padding: 8px;">${targetGroup.name}</td>
              </tr>
            </table>
            
            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #0c5460;">ℹ️ STATUS UPDATE</h3>
              <ul style="color: #0c5460; margin: 10px 0;">
                <li>URL is now responding correctly</li>
                <li>Service should be functioning normally</li>
                <li>Monitoring will continue automatically</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">This alert was sent to: ${targetGroup.name}</p>
            <p style="margin: 5px 0 0 0;">This is an automated recovery notification from Uptime WatchDog</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log('📧 ✅ URL UP alert email sent successfully to:', targetGroup.emails.join(', '));
    return true;
  } catch (error) {
    console.error('📧 ❌ Failed to send URL up alert:', error);
    console.error('📧 ❌ Error details:', error.stack);
    return false;
  }
}





}

module.exports = new UrlMonitoringService();