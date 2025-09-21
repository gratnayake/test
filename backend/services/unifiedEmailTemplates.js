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

  generateEventDetails(events, classification, theme) {
  if (!events || events.length === 0) return '';
  
  return `
    <div style="padding: 20px; background-color: #f8f9fa;">
      <h3 style="color: ${theme.primary}; margin-bottom: 15px;">📋 Event Details</h3>
      
      ${events.map((event, index) => `
        <div style="background-color: white; border-radius: 8px; margin-bottom: 15px; overflow: hidden; border-left: 4px solid ${theme.primary};">
          <div style="background-color: ${theme.secondary}; padding: 15px;">
            <strong>Event ${index + 1}: ${event.classification?.description || 'Pod Change'}</strong>
          </div>
          <div style="padding: 15px;">
            <div style="margin-bottom: 10px;">
              <strong>Namespace:</strong> ${event.namespace || 'unknown'}<br>
              <strong>Type:</strong> ${event.type || 'unknown'}<br>
              <strong>Time:</strong> ${new Date(event.timestamp).toLocaleString()}
            </div>
            ${this.generatePodList(event.pods, event.namespace, theme)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

generateClusterOverview(clusterOverview, theme) {
  if (!clusterOverview) return '';
  
  return `
    <div style="padding: 20px; background-color: #f8f9fa;">
      <h3 style="color: ${theme.primary}; margin-bottom: 15px;">🌐 Cluster Overview</h3>
      
      <div style="background-color: white; padding: 15px; border-radius: 8px; border-left: 4px solid ${theme.primary};">
        <div style="display: flex; justify-content: space-around; text-align: center; margin-bottom: 15px;">
          <div style="flex: 1;">
            <div style="font-size: 20px; font-weight: bold; color: ${theme.primary};">${clusterOverview.total || 0}</div>
            <div style="font-size: 12px; color: #666;">Total Workloads</div>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 20px; font-weight: bold; color: #28a745;">${clusterOverview.healthy || 0}</div>
            <div style="font-size: 12px; color: #666;">Healthy</div>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 20px; font-weight: bold; color: #ff9800;">${clusterOverview.degraded || 0}</div>
            <div style="font-size: 12px; color: #666;">Degraded</div>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 20px; font-weight: bold; color: #dc3545;">${clusterOverview.failed || 0}</div>
            <div style="font-size: 12px; color: #666;">Failed</div>
          </div>
        </div>
        
        ${Object.keys(clusterOverview.byNamespace || {}).length > 0 ? `
          <div style="margin-top: 15px;">
            <strong>By Namespace:</strong><br>
            ${Object.entries(clusterOverview.byNamespace).map(([ns, stats]) => 
              `<span style="font-size: 12px; margin-right: 15px;">${ns}: ${stats.healthy}/${stats.total} healthy</span>`
            ).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

generateRecommendations(alertType, classification) {
  const isIndividualAlert = classification?.category === 'individual_change';
  const isMassFailure = classification?.category === 'mass_disappearance';
  const isRecovery = classification?.category === 'recovery';
  
  let recommendations = [];
  let bgColor = '#d1ecf1';
  let borderColor = '#bee5eb'; 
  let textColor = '#0c5460';
  let icon = 'ℹ️';
  
  if (isMassFailure) {
    bgColor = '#f8d7da';
    borderColor = '#f5c6cb';
    textColor = '#721c24';
    icon = '🚨';
    recommendations = [
      'This is a CRITICAL event - immediate attention required',
      'Check if this was planned maintenance or an unexpected failure',
      'Verify Kubernetes cluster health and node status',
      'Review resource usage and capacity constraints',
      'Check network connectivity and DNS resolution',
      'Consider escalating to infrastructure team if unplanned'
    ];
  } else if (isIndividualAlert) {
    bgColor = '#fff3cd';
    borderColor = '#ffeaa7';
    textColor = '#856404';
    icon = '⚠️';
    recommendations = [
      'Individual pod deletion detected - monitor for automatic recreation',
      'Check if this was intentional (deployment, scaling, maintenance)',
      'Verify the pod is automatically recreating via deployment/replicaset',
      'Monitor application availability and performance',
      'Review pod logs if recreation fails or takes too long'
    ];
  } else if (isRecovery) {
    bgColor = '#d4edda';
    borderColor = '#c3e6cb'; 
    textColor = '#155724';
    icon = '✅';
    recommendations = [
      'Pod recovery detected - verify services are functioning normally',
      'Monitor stability over the next few minutes',
      'Check application logs for any startup issues',
      'Verify load balancing and traffic distribution',
      'Review what caused the initial failure to prevent recurrence'
    ];
  } else {
    recommendations = [
      'Review the specific changes mentioned above',
      'Verify this was expected behavior',
      'Monitor for any follow-up issues',
      'Check application and service health'
    ];
  }
  
  return `
    <div style="background-color: ${bgColor}; border: 1px solid ${borderColor}; padding: 20px; margin: 20px; border-radius: 8px;">
      <h3 style="margin-top: 0; color: ${textColor};">${icon} RECOMMENDED ACTIONS</h3>
      <ul style="color: ${textColor}; margin: 10px 0; line-height: 1.6;">
        ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
      </ul>
    </div>
  `;
}
}

module.exports = UnifiedEmailTemplates;