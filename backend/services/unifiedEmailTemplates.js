class UnifiedEmailTemplates {
  constructor() {
    this.baseStyles = {
      container: 'font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #ffffff;',
      header: 'color: white; padding: 25px; text-align: center;',
      content: 'padding: 20px; background-color: #f8f9fa;',
      footer: 'background-color: #e9ecef; padding: 20px; text-align: center; font-size: 12px; color: #6c757d;'
    };
    console.log('📧 Unified Email Templates initialized');
  }

  /**
   * Generate email for any type of pod alert with consistent styling
   */
  generatePodAlert({
    alertType,           // 'critical', 'warning', 'info'
    title,              // Email title
    subtitle,           // Email subtitle  
    classification,     // Event classification from classifier
    events,             // Array of events
    summary,            // Event summary
    targetGroup,        // Email group
    clusterOverview,    // Optional cluster health overview
    timestamp = new Date()
  }) {

    const theme = this.getThemeForAlertType(alertType);
    
    return `
      <div style="${this.baseStyles.container}">
        
        <!-- Unified Header -->
        ${this.generateHeader(title, subtitle, theme)}
        
        <!-- Alert Summary -->
        ${this.generateAlertSummary(summary, theme)}
        
        <!-- Cluster Overview (if provided) -->
        ${clusterOverview ? this.generateClusterOverview(clusterOverview, theme) : ''}
        
        <!-- Event Details -->
        ${this.generateEventDetails(events, classification, theme)}
        
        <!-- Recommendations -->
        ${this.generateRecommendations(alertType, classification)}
        
        <!-- Standard Footer -->
        ${this.generateFooter(targetGroup, timestamp)}
        
      </div>
    `;
  }

  /**
   * Get consistent theme colors and styling for alert types
   */
  getThemeForAlertType(alertType) {
    const themes = {
      'critical': {
        primary: '#dc3545',
        secondary: '#f8d7da', 
        light: '#fff2f2',
        icon: '🚨',
        name: 'Critical'
      },
      'warning': {
        primary: '#ff9800',
        secondary: '#ffe0b2',
        light: '#fff8f2', 
        icon: '⚠️',
        name: 'Warning'
      },
      'info': {
        primary: '#28a745',
        secondary: '#d4edda',
        light: '#f2fff2',
        icon: '✅', 
        name: 'Information'
      }
    };
    
    return themes[alertType] || themes['info'];
  }

  generateHeader(title, subtitle, theme) {
    return `
      <div style="background-color: ${theme.primary}; ${this.baseStyles.header}">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold;">
          ${theme.icon} ${title}
        </h1>
        ${subtitle ? `<p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.9;">${subtitle}</p>` : ''}
      </div>
    `;
  }

  generateAlertSummary(summary, theme) {
    if (!summary) return '';
    
    return `
      <div style="${this.baseStyles.content}">
        <h2 style="margin-top: 0; color: ${theme.primary}; font-size: 18px;">📊 Alert Summary</h2>
        
        <div style="background-color: white; padding: 20px; border-radius: 8px; border-left: 4px solid ${theme.primary};">
          <div style="display: flex; justify-content: space-around; text-align: center;">
            <div style="flex: 1;">
              <div style="font-size: 24px; font-weight: bold; color: ${theme.primary};">${summary.totalChanges}</div>
              <div style="font-size: 12px; color: #666;">Total Changes</div>
            </div>
            <div style="flex: 1;">
              <div style="font-size: 20px; font-weight: bold; color: #dc3545;">${summary.massEvents}</div>
              <div style="font-size: 12px; color: #666;">Mass Events</div>
            </div>
            <div style="flex: 1;">
              <div style="font-size: 20px; font-weight: bold; color: #ff9800;">${summary.individualEvents}</div>
              <div style="font-size: 12px; color: #666;">Individual</div>
            </div>
            <div style="flex: 1;">
              <div style="font-size: 20px; font-weight: bold; color: #28a745;">${summary.recoveryEvents}</div>
              <div style="font-size: 12px; color: #666;">Recoveries</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  generateFooter(targetGroup, timestamp) {
    return `
      <div style="${this.baseStyles.footer}">
        <p style="margin: 0;">Alert sent to: <strong>${targetGroup ? targetGroup.name : 'Email Group'}</strong></p>
        <p style="margin: 5px 0;">Time: ${timestamp.toLocaleString()}</p>
        <p style="margin: 5px 0 0 0;">🤖 Unified Pod Monitoring System</p>
      </div>
    `;
  }

  // Additional template methods would go here...
  // (generateEventDetails, generateClusterOverview, generateRecommendations, etc.)
}

module.exports = UnifiedEmailTemplates;