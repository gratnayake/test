// Fixed emailService.js - Replace your current one with this

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const emailConfigService = require('./emailConfigService');

class EmailService {
  constructor() {
    this.emailListFile = path.join(__dirname, '../data/email-list.json');
    this.ensureEmailListFile();
    this.transporter = null;
    this.isConfigured = false;
    this.setupTransporter();
  }

  setupTransporter() {
    try {
      const emailConfig = emailConfigService.getConfig();
      
      if (emailConfig.isConfigured) {
        this.transporter = nodemailer.createTransport({
          host: emailConfig.host,
          port: parseInt(emailConfig.port) || 587,
          secure: false,
          auth: {
            user: emailConfig.user,
            pass: emailConfig.password
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        this.isConfigured = true;
        console.log('📧 Email service configured from JSON file');
      } else {
        console.log('⚠️ Email service not configured - missing settings in JSON file');
      }
    } catch (error) {
      console.error('❌ Error setting up email service:', error);
      this.isConfigured = false;
    }
  }

  ensureEmailListFile() {
    if (!fs.existsSync(this.emailListFile)) {
      const defaultEmailList = {
        groups: [
          {
            id: 1,
            name: 'Database Administrators',
            description: 'Primary DBA team for critical alerts',
            emails: ['dba@company.com'],
            enabled: true,
            alertTypes: ['down', 'up'],
            createdAt: new Date().toISOString()
          },
          {
            id: 2,
            name: 'Operations Team',
            description: 'Operations team for monitoring',
            emails: ['ops@company.com'],
            enabled: true,
            alertTypes: ['down', 'up'],
            createdAt: new Date().toISOString()
          }
        ],
        lastUpdated: new Date().toISOString()
      };
      this.saveEmailList(defaultEmailList);
      console.log('📧 Created default email groups');
    }
  }

  loadEmailList() {
    try {
      const data = fs.readFileSync(this.emailListFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error loading email list:', error);
      return { 
        groups: [],
        emails: [], // Legacy format support
        lastUpdated: new Date().toISOString() 
      };
    }
  }

  saveEmailList(data) {
    try {
      fs.writeFileSync(this.emailListFile, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Error saving email list:', error);
      return false;
    }
  }

  // Get all emails from enabled groups
  getAllEnabledEmails() {
    const data = this.loadEmailList();
    const allEmails = [];
    
    // Handle both new group format and legacy format
    if (data.groups && data.groups.length > 0) {
      data.groups.forEach(group => {
        if (group.enabled && group.alertTypes.includes('up') && group.alertTypes.includes('down')) {
          allEmails.push(...group.emails);
        }
      });
    } else if (data.emails && data.emails.length > 0) {
      // Fallback to legacy format
      allEmails.push(...data.emails);
    }
    
    return [...new Set(allEmails)]; // Remove duplicates
  }

  // Get email groups
  getEmailGroups() {
    const data = this.loadEmailList();
    return data.groups || [];
  }

  getEmailConfig() {
    const emailConfigService = require('./emailConfigService');
    return emailConfigService.getConfig();
  }

  // FIXED: Send DOWN alert
  async sendDownAlert(error = null) {
    if (!this.isConfigured) {
      console.log('❌ Email service not configured');
      return false;
    }

    const allEmails = this.getAllEnabledEmails(); // ✅ Get enabled emails
    
    if (allEmails.length === 0) {
      console.log('⚠️ No enabled email addresses configured for alerts');
      return false;
    }

    const currentTime = new Date();
    const mailOptions = {
      from: this.getEmailConfig().user, // ✅ Use proper config
      to: allEmails.join(','), // ✅ Fixed: Use allEmails instead of emailList.emails
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
                <td style="padding: 8px; font-weight: bold;">Timestamp:</td>
                <td style="padding: 8px;">${currentTime.toISOString()}</td>
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
            <p style="margin: 0;">This is an automated alert from the Oracle Database Monitoring System</p>
            <p style="margin: 5px 0 0 0;">You will receive another email when the database is back online</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('📧 ✅ DOWN alert email sent successfully to:', allEmails.join(', '));
      return true;
    } catch (error) {
      console.error('📧 ❌ Failed to send DOWN alert email:', error);
      return false;
    }
  }

  // FIXED: Send UP alert
  async sendUpAlert(downtime = 'Unknown') {
    if (!this.isConfigured) {
      console.log('❌ Email service not configured - cannot send up alert');
      return false;
    }

    const allEmails = this.getAllEnabledEmails(); // ✅ Get enabled emails consistently
    
    if (allEmails.length === 0) {
      console.log('⚠️ No enabled email addresses configured for alerts');
      return false;
    }

    const currentTime = new Date();
    const mailOptions = {
      from: this.getEmailConfig().user, // ✅ Use proper config
      to: allEmails.join(','), // ✅ Use allEmails for consistency
      subject: '🟢 RECOVERY: Oracle Database is UP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🟢 DATABASE RECOVERY</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #28a745;">
            <h2 style="color: #28a745; margin-top: 0;">Database Status: UP</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 30%;">Status:</td>
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
            </table>
            
            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #0c5460;">ℹ️ RECOVERY STATUS</h3>
              <ul style="color: #0c5460; margin: 10px 0;">
                <li>Database connection has been restored</li>
                <li>All services should be functioning normally</li>
                <li>Monitor the database for any unusual activity</li>
                <li>Review logs to determine the cause of the outage</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">This is an automated recovery notification from the Oracle Database Monitoring System</p>
            <p style="margin: 5px 0 0 0;">Monitoring will continue automatically</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('📧 ✅ UP alert email sent successfully to:', allEmails.join(', '));
      return true;
    } catch (error) {
      console.error('📧 ❌ Failed to send UP alert email:', error);
      return false;
    }
  }

  // Test email configuration
  async testEmailConfiguration() {
    if (!this.isConfigured) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      await this.transporter.verify();
      return { success: true, message: 'Email configuration is valid' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Send test email
  async sendTestEmail() {
    if (!this.isConfigured) {
      return { success: false, message: 'Email service not configured' };
    }

    const allEmails = this.getAllEnabledEmails();
    
    if (allEmails.length === 0) {
      return { success: false, message: 'No email addresses configured' };
    }

    const mailOptions = {
      from: this.getEmailConfig().user,
      to: allEmails.join(','),
      subject: '🧪 Test Email - Oracle Database Monitoring System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">🧪 Test Email</h1>
          </div>
          <div style="padding: 20px;">
            <p>This is a test email from your Oracle Database Monitoring System.</p>
            <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
            <p>If you received this email, your email configuration is working correctly!</p>
            <p><strong>Recipients:</strong> ${allEmails.length} email(s)</p>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return { success: true, message: 'Test email sent successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ADD these methods to your backend/services/emailService.js file
// Insert them before the "Legacy methods for compatibility" section

  // Email Group Management Methods
  createGroup(groupData) {
    try {
      const data = this.loadEmailList();
      
      // Generate new ID
      const existingIds = data.groups ? data.groups.map(g => g.id) : [];
      const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
      
      const newGroup = {
        id: newId,
        name: groupData.name,
        description: groupData.description || '',
        emails: groupData.emails || [],
        alertTypes: groupData.alertTypes || ['down', 'up'],
        enabled: groupData.enabled !== undefined ? groupData.enabled : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Initialize groups array if it doesn't exist
      if (!data.groups) data.groups = [];
      
      data.groups.push(newGroup);
      data.lastUpdated = new Date().toISOString();
      
      const saved = this.saveEmailList(data);
      if (saved) {
        console.log(`📧 Created email group: ${newGroup.name} (ID: ${newGroup.id})`);
        return newGroup;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error creating email group:', error);
      return null;
    }
  }

  updateGroup(groupId, updateData) {
    try {
      const data = this.loadEmailList();
      
      if (!data.groups) data.groups = [];
      
      const groupIndex = data.groups.findIndex(g => g.id == groupId);
      if (groupIndex === -1) {
        console.log(`⚠️ Group with ID ${groupId} not found`);
        return null;
      }
      
      // Update the group
      const existingGroup = data.groups[groupIndex];
      const updatedGroup = {
        ...existingGroup,
        ...updateData,
        id: existingGroup.id, // Ensure ID doesn't change
        createdAt: existingGroup.createdAt, // Preserve creation date
        updatedAt: new Date().toISOString()
      };
      
      data.groups[groupIndex] = updatedGroup;
      data.lastUpdated = new Date().toISOString();
      
      const saved = this.saveEmailList(data);
      if (saved) {
        console.log(`📧 Updated email group: ${updatedGroup.name} (ID: ${groupId})`);
        return updatedGroup;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error updating email group:', error);
      return null;
    }
  }

  deleteGroup(groupId) {
    try {
      const data = this.loadEmailList();
      
      if (!data.groups) data.groups = [];
      
      const groupIndex = data.groups.findIndex(g => g.id == groupId);
      if (groupIndex === -1) {
        console.log(`⚠️ Group with ID ${groupId} not found`);
        return false;
      }
      
      const deletedGroup = data.groups[groupIndex];
      data.groups.splice(groupIndex, 1);
      data.lastUpdated = new Date().toISOString();
      
      const saved = this.saveEmailList(data);
      if (saved) {
        console.log(`📧 Deleted email group: ${deletedGroup.name} (ID: ${groupId})`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error deleting email group:', error);
      return false;
    }
  }

  // Get a specific email group by ID
  getGroupById(groupId) {
    try {
      const data = this.loadEmailList();
      if (!data.groups) return null;
      
      return data.groups.find(g => g.id == groupId) || null;
    } catch (error) {
      console.error('❌ Error getting email group by ID:', error);
      return null;
    }
  }

  // Get all emails from a specific group
  getEmailsFromGroup(groupId) {
    try {
      const group = this.getGroupById(groupId);
      return group ? group.emails : [];
    } catch (error) {
      console.error('❌ Error getting emails from group:', error);
      return [];
    }
  }

  // Validate email format
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate group data
  validateGroupData(groupData) {
    const errors = [];
    
    if (!groupData.name || groupData.name.trim() === '') {
      errors.push('Group name is required');
    }
    
    if (!groupData.emails || !Array.isArray(groupData.emails) || groupData.emails.length === 0) {
      errors.push('At least one email address is required');
    } else {
      // Validate each email
      groupData.emails.forEach((email, index) => {
        if (!this.validateEmail(email)) {
          errors.push(`Invalid email at position ${index + 1}: ${email}`);
        }
      });
    }
    
    if (!groupData.alertTypes || !Array.isArray(groupData.alertTypes) || groupData.alertTypes.length === 0) {
      errors.push('At least one alert type must be selected');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Legacy methods for compatibility
  getEmailList() {
    const data = this.loadEmailList();
    // Return legacy format for backward compatibility
    return {
      emails: this.getAllEnabledEmails(),
      lastUpdated: data.lastUpdated
    };
  }

  updateEmailList(emails) {
    const data = this.loadEmailList();
    
    // Update legacy format if no groups exist
    if (!data.groups || data.groups.length === 0) {
      const emailData = {
        emails: emails,
        groups: [],
        lastUpdated: new Date().toISOString()
      };
      return this.saveEmailList(emailData);
    }
    
    return false; // Use group management instead
  }

  addEmail(email) {
    const data = this.loadEmailList();
    
    if (!data.emails) data.emails = [];
    if (!data.emails.includes(email)) {
      data.emails.push(email);
      data.lastUpdated = new Date().toISOString();
      return this.saveEmailList(data);
    }
    
    return false;
  }

  removeEmail(email) {
    const data = this.loadEmailList();
    
    if (data.emails) {
      const index = data.emails.indexOf(email);
      if (index > -1) {
        data.emails.splice(index, 1);
        data.lastUpdated = new Date().toISOString();
        return this.saveEmailList(data);
      }
    }
    
    return false;
  }
}

module.exports = new EmailService();