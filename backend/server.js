require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const monitoringService = require('./services/monitoringService');
const emailService = require('./services/emailService');
const logService = require('./services/logService');
const systemMonitoringService = require('./services/systemMonitoringService');
const emailConfigService = require('./services/emailConfigService');
const kubernetesService = require('./services/kubernetesService');
const urlMonitoringService = require('./services/urlMonitoringService');
const kubernetesConfigService = require('./services/kubernetesConfigService');
const thresholdService = require('./services/thresholdService');
const databaseOperationsService = require('./services/databaseOperationsService');
const podActionsService = require('./services/podActionsService');
const kubernetesMonitoringService = require('./services/kubernetesMonitoringService');
const podLifecycleService = require('./services/podLifecycleService');
const scriptService = require('./services/scriptService');
const systemHeartbeatService = require('./services/systemHeartbeatService');
const podMonitoringService = require('./services/podMonitoringService');
const podRecoveryNotifier = require('./services/podRecoveryNotifier');
const autoRecoveryRoutes = require('./routes/autoRecovery');


const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');


const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api/auto-recovery', autoRecoveryRoutes);

// Import services
const userService = require('./services/userService');
const dbConfigService = require('./services/dbConfigService');
const realOracleService = require('./services/realOracleService');
const execAsync = util.promisify(exec);


// Function to load Kubernetes config
const loadKubernetesConfig = () => {
  try {
    const configPath = path.join(__dirname, 'data', 'kubernetes-config.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      return config;
    }
    return null;
  } catch (error) {
    console.error('Failed to load Kubernetes config:', error);
    return null;
  }
};


// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Oracle Monitor API with Real Database Connection!',
    timestamp: new Date(),
    status: 'OK',
    userCount: userService.getUserCount(),
    dbConfigured: dbConfigService.getConfig().isConfigured
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    userCount: userService.getUserCount(),
    dbConfigured: dbConfigService.getConfig().isConfigured
  });
});

// AUTH ROUTES
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Login attempt: ${username}`);
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = userService.authenticateUser(username, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// USER ROUTES (keeping existing user management)
app.get('/api/users', (req, res) => {
  try {
    const users = userService.getAllUsers();
    console.log(`📋 Fetched ${users.length} users`);
    res.json({ success: true, users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const { username, password, firstName, lastName, email, role, status } = req.body;

    console.log('📝 Creating user:', { username, firstName, lastName, email, role, status });

    if (!username || !password || !firstName || !lastName || !email) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Username, password, first name, last name, and email are required' 
      });
    }

    const userData = {
      username, password, firstName, lastName, email,
      role: role || 'user',
      status: status || 'active'
    };

    const newUser = userService.createUser(userData);
    console.log('✅ User created successfully:', newUser.username);
    
    res.status(201).json({ 
      success: true, 
      user: newUser,
      message: 'User created successfully' 
    });
  } catch (error) {
    console.error('❌ Create user error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstName, lastName, email, role, status } = req.body;

    console.log('🔄 Updating user:', id, { username, firstName, lastName, email, role, status });

    const userData = { username, firstName, lastName, email, role, status };

    if (password && password.trim() !== '') {
      userData.password = password;
    }

    Object.keys(userData).forEach(key => 
      userData[key] === undefined && delete userData[key]
    );

    const updatedUser = userService.updateUser(id, userData);
    console.log('✅ User updated successfully:', updatedUser.username);
    
    res.json({ 
      success: true, 
      user: updatedUser,
      message: 'User updated successfully' 
    });
  } catch (error) {
    console.error('❌ Update user error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🗑️ Deleting user:', id);
    
    userService.deleteUser(id);
    console.log('✅ User deleted successfully');
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Delete user error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// DATABASE CONFIGURATION ROUTES
app.get('/api/database/config', (req, res) => {
  try {
    const config = dbConfigService.getPublicConfig();
    
    // Also get thresholds from threshold service
    let thresholds = null;
    try {
      thresholds = thresholdService.getDatabaseThresholds();
    } catch (error) {
      console.log('⚠️ Could not load database thresholds:', error.message);
    }
    
    // Merge config with thresholds
    const enrichedConfig = {
      ...config,
      thresholds: thresholds // Add thresholds to config
    };
    
    console.log('📖 Returning database config:', {
      hasHost: !!enrichedConfig.host,
      hasEmailGroup: !!enrichedConfig.emailGroupId,
      hasThresholds: !!enrichedConfig.thresholds,
      isConfigured: enrichedConfig.isConfigured
    });
    
    res.json({ success: true, config: enrichedConfig });
  } catch (error) {
    console.error('❌ Get database config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/database/email-config', (req, res) => {
  try {
    const emailGroupId = dbConfigService.getEmailGroupForAlerts();
    const isConfigured = dbConfigService.isEmailAlertsConfigured();
    
    res.json({
      success: true,
      emailGroupId: emailGroupId,
      isConfigured: isConfigured
    });
  } catch (error) {
    console.error('❌ Get database email config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/database/config', (req, res) => {
  try {
    const { host, port, serviceName, username, password, emailGroupId, thresholds } = req.body;

    console.log('💾 Saving database config with thresholds:', {
      host: host || 'empty',
      emailGroupId: emailGroupId || 'none',
      hasThresholds: !!thresholds
    });

    // Log thresholds for debugging
    if (thresholds) {
      console.log('🎯 Database threshold settings received:', thresholds);
    }

    // Prepare config data
    const configData = { 
      host: host || '',
      port: port || 1521,
      serviceName: serviceName || '',
      username: username || '',
      password: password || '',
      emailGroupId: emailGroupId || null
    };
    
    // Save database config using the correct service
    const saved = dbConfigService.updateConfig(configData);
    
    // ALSO save thresholds to threshold service if provided
    if (thresholds && saved) {
      console.log('🎯 Saving database thresholds to threshold service...');
      const thresholdSaved = thresholdService.updateDatabaseThresholds({
        ...thresholds,
        emailGroupId: emailGroupId || null
      });
      
      if (thresholdSaved) {
        console.log('✅ Database thresholds saved to threshold service');
      } else {
        console.log('❌ Failed to save thresholds to threshold service');
      }
    }
    
    if (saved) {
      console.log('✅ Database config saved successfully');
      
      // Get the updated config
      const updatedConfig = dbConfigService.getPublicConfig();
      
      res.json({ 
        success: true, 
        message: 'Database configuration and thresholds saved successfully',
        config: updatedConfig
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to save database configuration'
      });
    }
  } catch (error) {
    console.error('❌ Save database config error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});


app.post('/api/database/test-connection', async (req, res) => {
  try {
    const { host, port, serviceName, username, password } = req.body;

    console.log('🧪 Testing database connection:', { host, port, serviceName, username });

    if (!host || !port || !serviceName || !username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'All connection fields are required for testing' 
      });
    }

    const connectionDetails = { host, port, serviceName, username, password };
    const testResult = await realOracleService.testConnection(connectionDetails);
    
    if (testResult.success) {
      console.log('✅ Database connection test successful');
      res.json({ 
        success: true, 
        message: 'Connection test successful!',
        details: testResult
      });
    } else {
      console.log('❌ Database connection test failed:', testResult.message);
      res.status(400).json({ 
        success: false,
        error: testResult.message,
        details: testResult
      });
    }
  } catch (error) {
    console.error('❌ Test connection error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// DATABASE MONITORING ROUTES - REAL-TIME
app.get('/api/database/status', async (req, res) => {
  try {
    const status = realOracleService.getConnectionStatus();
    
    if (status.isConfigured) {
      const connectionCheck = await realOracleService.checkConnection();
      
      res.json({
        success: true,
        status: connectionCheck.isConnected ? 'UP' : 'DOWN',
        timestamp: new Date(),
        isDown: !connectionCheck.isConnected,
        responseTime: connectionCheck.responseTime || 'N/A',
        connectionStatus: status,
        configured: true,
        error: connectionCheck.error || null
      });
    } else {
      res.json({
        success: true,
        status: 'NOT_CONFIGURED',
        timestamp: new Date(),
        isDown: true,
        configured: false,
        message: 'Database connection not configured'
      });
    }
  } catch (error) {
    console.error('❌ Database status error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/database/dashboard', async (req, res) => {
  try {
    const config = dbConfigService.getConfig();
    
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Database not configured'
      });
    }

    console.log('📊 Fetching real-time dashboard data...');
    const dashboardData = await realOracleService.getRealtimeDashboardData();
    
    res.json({ 
      success: true, 
      data: dashboardData,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Dashboard data error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/database/tablespace', async (req, res) => {
  try {
    console.log('🔍 Tablespace API called');
    const config = dbConfigService.getConfig();
    
    if (!config.isConfigured) {
      console.log('❌ Database not configured');
      return res.status(400).json({
        success: false,
        error: 'Database not configured'
      });
    }

    console.log('📊 Fetching tablespace data...');
    const tablespaceData = await realOracleService.getTablespaceInfo();
    console.log(`✅ Retrieved tablespace data for ${tablespaceData.length} tablespaces:`, tablespaceData);
    
    res.json({ success: true, data: tablespaceData });
  } catch (error) {
    console.error('❌ Tablespace data error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/database/info', async (req, res) => {
  try {
    const config = dbConfigService.getConfig();
    
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const [versionInfo, instanceInfo, sessionInfo] = await Promise.allSettled([
      realOracleService.getDatabaseVersion(),
      realOracleService.getInstanceInfo(),
      realOracleService.getSessionInfo()
    ]);

    const dbInfo = {
      version: versionInfo.status === 'fulfilled' ? versionInfo.value : { version: 'Unknown' },
      instance: instanceInfo.status === 'fulfilled' ? instanceInfo.value : null,
      sessions: sessionInfo.status === 'fulfilled' ? sessionInfo.value : null
    };
    
    console.log('📊 Retrieved database info');
    res.json({ success: true, data: dbInfo });
  } catch (error) {
    console.error('❌ Database info error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// MONITORING ROUTES
app.get('/api/monitoring/status', (req, res) => {
  try {
    const status = monitoringService.getMonitoringStatus();
    console.log('📊 Monitoring status requested');
    res.json({ success: true, status });
  } catch (error) {
    console.error('❌ Get monitoring status error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/monitoring/start', (req, res) => {
  try {
    const started = monitoringService.startMonitoring();
    
    if (started) {
      console.log('🚀 Monitoring started via API');
      res.json({ 
        success: true, 
        message: 'Database monitoring started successfully',
        status: monitoringService.getMonitoringStatus()
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'Failed to start monitoring (already running or database not configured)' 
      });
    }
  } catch (error) {
    console.error('❌ Start monitoring error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/monitoring/stop', (req, res) => {
  try {
    const stopped = monitoringService.stopMonitoring();
    
    if (stopped) {
      console.log('🛑 Monitoring stopped via API');
      res.json({ 
        success: true, 
        message: 'Database monitoring stopped successfully',
        status: monitoringService.getMonitoringStatus()
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'Monitoring was not running' 
      });
    }
  } catch (error) {
    console.error('❌ Stop monitoring error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/monitoring/force-check', async (req, res) => {
  try {
    console.log('🔍 Manual check requested');
    const result = await monitoringService.forceCheck();
    
    res.json({ 
      success: true, 
      message: 'Manual check completed',
      result: result,
      status: monitoringService.getMonitoringStatus()
    });
  } catch (error) {
    console.error('❌ Force check error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/monitoring/history', (req, res) => {
  try {
    const history = monitoringService.getMonitoringHistory();
    console.log(`📊 Retrieved ${history.length} monitoring checks`);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('❌ Get monitoring history error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// DOWNTIME LOGS ROUTES
app.get('/api/logs/downtime', async (req, res) => {
  try {
    const logs = await logService.getDowntimeLogs();
    console.log(`📝 Retrieved ${logs.length} downtime log entries`);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('❌ Get downtime logs error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// EMAIL MANAGEMENT ROUTES
app.get('/api/email/list', (req, res) => {
  try {
    const emailList = emailService.getEmailList();
    console.log('📧 Email list requested');
    res.json({ success: true, data: emailList });
  } catch (error) {
    console.error('❌ Get email list error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/email/list', (req, res) => {
  try {
    const { emails } = req.body;
    
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid email array is required' 
      });
    }
    
    const updated = emailService.updateEmailList(emails);
    
    if (updated) {
      console.log('📧 Email list updated');
      res.json({ 
        success: true, 
        message: 'Email list updated successfully',
        data: emailService.getEmailList()
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to update email list' 
      });
    }
  } catch (error) {
    console.error('❌ Update email list error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.post('/api/email/test', async (req, res) => {
  try {
    console.log('📧 Test email requested');
    const result = await emailService.sendTestEmail();
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Test email sent successfully!'
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: result.message 
      });
    }
  } catch (error) {
    console.error('❌ Send test email error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/email/config/test', async (req, res) => {
  try {
    const result = await emailService.testEmailConfiguration();
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Email configuration is valid'
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: result.message 
      });
    }
  } catch (error) {
    console.error('❌ Test email config error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});


// SYSTEM MONITORING ROUTES
app.get('/api/system/metrics', async (req, res) => {
  try {
    const metrics = await systemMonitoringService.getSystemMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('❌ System metrics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// EMAIL CONFIG ROUTES
app.get('/api/email/config', (req, res) => {
  try {
    const config = emailConfigService.getPublicConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/email/config', (req, res) => {
  try {
    const { host, port, user, password } = req.body;
    
    if (!host || !user || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Host, user, and password are required' 
      });
    }

    const configData = { host, port, user, password };
    const saved = emailConfigService.updateConfig(configData);
    
    if (saved) {
      // Reinitialize email service with new config
      emailService.setupTransporter();
      res.json({ 
        success: true, 
        message: 'Email configuration saved successfully',
        config: emailConfigService.getPublicConfig()
      });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save email configuration' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// EMAIL GROUP ROUTES
app.get('/api/email/groups', (req, res) => {
  try {
    const groups = emailService.getEmailGroups();
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/email/groups', (req, res) => {
  try {
    const group = emailService.createGroup(req.body);
    if (group) {
      res.json({ success: true, data: group });
    } else {
      res.status(500).json({ success: false, error: 'Failed to create group' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/email/groups/:id', (req, res) => {
  try {
    const group = emailService.updateGroup(req.params.id, req.body);
    if (group) {
      res.json({ success: true, data: group });
    } else {
      res.status(404).json({ success: false, error: 'Group not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/email/groups/:id', (req, res) => {
  try {
    const deleted = emailService.deleteGroup(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Group deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Group not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// KUBERNETES ROUTES
app.get('/api/kubernetes/pods', async (req, res) => {
  try {
    let namespace = req.query.namespace || 'default';
    
    // Validate namespace parameter
    if (!namespace || namespace === 'null' || namespace === 'undefined') {
      namespace = 'default';
    }

    console.log(`🔍 Getting pods for namespace: ${namespace}`);
    
    const pods = await kubernetesService.getPods(namespace);
    res.json({ 
      success: true, 
      data: pods,
      namespace: namespace,
      count: pods.length
    });
  } catch (error) {
    console.error('❌ Get pods error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      namespace: req.query.namespace || 'default'
    });
  }
});

app.get('/api/kubernetes/pods/all', async (req, res) => {
  try {
    console.log('🔍 Getting all pods from all namespaces...');
    const pods = await kubernetesService.getAllPods();
    res.json({ 
      success: true, 
      data: pods,
      count: pods.length
    });
  } catch (error) {
    console.error('❌ Get all pods error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/kubernetes/namespaces', async (req, res) => {
  try {
    const namespaces = await kubernetesService.getNamespaces();
    res.json({ success: true, data: namespaces });
  } catch (error) {
    console.error('❌ Get namespaces error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kubernetes/nodes', async (req, res) => {
  try {
    const nodes = await kubernetesService.getNodes();
    res.json({ success: true, data: nodes });
  } catch (error) {
    console.error('❌ Get nodes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kubernetes/cluster-info', async (req, res) => {
  try {
    const clusterInfo = await kubernetesService.getClusterInfo();
    res.json({ success: true, data: clusterInfo });
  } catch (error) {
    console.error('❌ Get cluster info error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Kubernetes monitoring endpoints
app.get('/api/kubernetes/monitoring/status', (req, res) => {
  try {
    // Since we haven't implemented the enhanced monitoring service yet,
    // return a basic status
    const config = kubernetesConfigService.getConfig();
    const monitoringStatus = kubernetesMonitoringService.getStatus();
    const status = {
      isMonitoring: monitoringStatus.isMonitoring,
      isConfigured: config.isConfigured,
      emailGroupId: config.emailGroupId,
      podCount: monitoringStatus.podCount,
      nodeCount: monitoringStatus.nodeCount,
      lastCheck: monitoringStatus.lastCheck
    };

    res.json({
      success: true,
      status: status,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Kubernetes monitoring status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/monitoring/start', (req, res) => {
  try {
    const config = kubernetesConfigService.getConfig();
    
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured. Please configure kubeconfig path first.'
      });
    }

    // TODO: Implement kubernetesMonitoringService.startMonitoring() later
    const started = kubernetesMonitoringService.startMonitoring();

    if (started) {
      res.json({
        success: true,
        message: 'Kubernetes monitoring started successfully',
        status: kubernetesMonitoringService.getStatus()
      });
    } else {
      res.json({
        success: false,
        message: 'Monitoring is already running or failed to start',
        status: kubernetesMonitoringService.getStatus()
      });
    }
  } catch (error) {
    console.error('❌ Start Kubernetes monitoring error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/monitoring/stop', (req, res) => {
  try {
    const stopped = kubernetesMonitoringService.stopMonitoring();
    res.json({
      success: true,
      message: stopped ? 'Kubernetes monitoring stopped' : 'Monitoring was not running',
      status: kubernetesMonitoringService.getStatus()
    });
  } catch (error) {
    console.error('❌ Stop Kubernetes monitoring error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/monitoring/force-check', async (req, res) => {
  try {
    console.log('🔍 Manual Kubernetes health check requested');
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    await kubernetesMonitoringService.checkPodHealth();
    await kubernetesMonitoringService.checkNodeHealth();

    res.json({
      success: true,
      message: 'Manual health check completed',
      timestamp: new Date(),
      status: kubernetesMonitoringService.getStatus()
    });
  } catch (error) {
    console.error('❌ Manual Kubernetes check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// URL MONITORING ROUTES
app.get('/api/urls', (req, res) => {
  try {
    const urls = urlMonitoringService.getAllUrls();
    res.json({ success: true, data: urls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/urls', (req, res) => {
  try {
    const newUrl = urlMonitoringService.addUrl(req.body);
    if (newUrl) {
      res.json({ success: true, data: newUrl });
    } else {
      res.status(500).json({ success: false, error: 'Failed to add URL' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/urls/:id', (req, res) => {
  try {
    const updatedUrl = urlMonitoringService.updateUrl(req.params.id, req.body);
    if (updatedUrl) {
      res.json({ success: true, data: updatedUrl });
    } else {
      res.status(404).json({ success: false, error: 'URL not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/urls/:id', (req, res) => {
  try {
    const deleted = urlMonitoringService.deleteUrl(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'URL deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'URL not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/urls/statuses', (req, res) => {
  try {
    const statuses = urlMonitoringService.getUrlStatuses();
    res.json({ success: true, data: statuses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/urls/stats', (req, res) => {
  try {
    const stats = urlMonitoringService.getMonitoringStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/urls/check/:id', async (req, res) => {
  try {
    const urls = urlMonitoringService.getAllUrls();
    const url = urls.find(u => u.id === parseInt(req.params.id));
    
    if (!url) {
      return res.status(404).json({ success: false, error: 'URL not found' });
    }
    
    const result = await urlMonitoringService.checkUrl(url);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.get('/api/kubernetes/config', (req, res) => {
  try {
    const config = kubernetesConfigService.getPublicConfig();
    
    // Also get thresholds from threshold service
    let thresholds = null;
    try {
      thresholds = thresholdService.getKubernetesThresholds();
    } catch (error) {
      console.log('⚠️ Could not load Kubernetes thresholds:', error.message);
    }
    
    // Merge config with thresholds
    const enrichedConfig = {
      ...config,
      thresholds: config.thresholds || thresholds // Use config thresholds or fallback to threshold service
    };
    
    console.log('📖 Returning Kubernetes config:', {
      hasKubeconfigPath: !!enrichedConfig.kubeconfigPath,
      hasEmailGroup: !!enrichedConfig.emailGroupId,
      hasThresholds: !!enrichedConfig.thresholds,
      isConfigured: enrichedConfig.isConfigured
    });
    
    res.json({ success: true, config: enrichedConfig });
  } catch (error) {
    console.error('❌ Get Kubernetes config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post('/api/kubernetes/config', (req, res) => {
  try {
    const { kubeconfigPath, emailGroupId, thresholds } = req.body;

    console.log('💾 Saving Kubernetes config with data:', {
      kubeconfigPath: kubeconfigPath || 'empty',
      emailGroupId: emailGroupId || 'none',
      hasThresholds: !!thresholds
    });

    // Log thresholds for debugging
    if (thresholds) {
      console.log('🎯 Threshold settings received:', thresholds);
    }

    // Validate kubeconfig path if provided and not empty
    if (kubeconfigPath && kubeconfigPath.trim() !== '') {
      console.log('🔍 Validating kubeconfig path...');
      const validation = kubernetesConfigService.validateConfigPath(kubeconfigPath);
      if (!validation.valid) {
        console.log('❌ Validation failed:', validation.error);
        return res.status(400).json({ 
          success: false,
          error: validation.error 
        });
      }
    } else {
      console.log('✅ Empty path - clearing configuration');
    }

    // Prepare config data including thresholds
    const configData = { 
      kubeconfigPath: kubeconfigPath || '',
      emailGroupId: emailGroupId || null,
      thresholds: thresholds || null  // Add thresholds to config data
    };
    
    const saved = kubernetesConfigService.updateConfig(configData);
    
    // ALSO save thresholds to threshold service if provided
    if (thresholds && saved) {
      console.log('🎯 Saving thresholds to threshold service...');
      const thresholdSaved = thresholdService.updateKubernetesThresholds({
        ...thresholds,
        emailGroupId: emailGroupId || null
      });
      
      if (thresholdSaved) {
        console.log('✅ Kubernetes thresholds saved to threshold service');
      } else {
        console.log('❌ Failed to save thresholds to threshold service');
      }
    }
    
    if (saved) {
      console.log('✅ Kubernetes config saved successfully');
      
      // Reinitialize Kubernetes service with new config
      kubernetesService.refreshConfiguration();
      
      // Get the updated config (including thresholds)
      const updatedConfig = kubernetesConfigService.getPublicConfig();
      
      res.json({ 
        success: true, 
        message: 'Kubernetes configuration and thresholds saved successfully',
        config: updatedConfig
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to save Kubernetes configuration'
      });
    }
  } catch (error) {
    console.error('❌ Save Kubernetes config error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

app.get('/api/kubernetes/email-config', (req, res) => {
  try {
    const emailGroupId = kubernetesConfigService.getEmailGroupForAlerts();
    const isConfigured = kubernetesConfigService.isEmailAlertsConfigured();
    
    res.json({
      success: true,
      emailGroupId: emailGroupId,
      isConfigured: isConfigured
    });
  } catch (error) {
    console.error('❌ Get Kubernetes email config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/config/test', async (req, res) => {
  try {
    const { kubeconfigPath } = req.body;
    
    if (!kubeconfigPath) {
      return res.status(400).json({ 
        success: false,
        error: 'Kubeconfig path is required for testing' 
      });
    }

    // Create a temporary config to test without saving
    const tempConfig = { kubeconfigPath, isConfigured: true };
    kubernetesConfigService.saveConfig(tempConfig);
    
    // Reload and test
    kubernetesService.refreshConfiguration();
    const testResult = await kubernetesService.testConnection();
    
    res.json({ 
      success: testResult.success, 
      message: testResult.message || testResult.error,
      details: testResult
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kubernetes/env-status', async (req, res) => {
  try {
    const config = kubernetesConfigService.getConfig();
    const envStatus = {
      kubeconfigPath: config.kubeconfigPath,
      kubeconfigExists: config.kubeconfigPath ? require('fs').existsSync(config.kubeconfigPath) : false,
      kubeconfigEnvSet: !!process.env.KUBECONFIG,
      kubeconfigEnvValue: process.env.KUBECONFIG,
      isConfigured: config.isConfigured,
      serviceConfigured: kubernetesService.isConfigured,
      lastError: kubernetesService.lastError
    };

    console.log('📊 Kubernetes environment status:', envStatus);
    
    res.json({
      success: true,
      envStatus: envStatus
    });
  } catch (error) {
    console.error('❌ Kubernetes env status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/refresh-config', async (req, res) => {
  try {
    console.log('🔄 Refreshing Kubernetes configuration...');
    
    // Refresh the Kubernetes service configuration
    kubernetesService.refreshConfiguration();
    
    // Test the new configuration
    const testResult = await kubernetesService.testConnection();
    
    if (testResult.success) {
      console.log('✅ Kubernetes configuration refreshed successfully');
      res.json({
        success: true,
        message: 'Kubernetes configuration refreshed successfully',
        testResult: testResult
      });
    } else {
      console.log('❌ Kubernetes configuration refresh failed');
      res.status(400).json({
        success: false,
        error: 'Configuration refresh failed: ' + testResult.error,
        testResult: testResult
      });
    }
  } catch (error) {
    console.error('❌ Kubernetes refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// THRESHOLD ROUTES
app.get('/api/thresholds/db-size', (req, res) => {
  try {
    const threshold = thresholdService.getDbSizeThreshold();
    res.json({ success: true, data: threshold });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/thresholds/db-size', (req, res) => {
  try {
    const saved = thresholdService.updateDbSizeThreshold(req.body);
    if (saved) {
      res.json({ success: true, message: 'Database size threshold settings saved' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.get('/api/thresholds/database', (req, res) => {
  try {
    const thresholds = thresholdService.getDatabaseThresholds();
    res.json({ success: true, data: thresholds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/thresholds/all', (req, res) => {
  try {
    const allThresholds = thresholdService.getAllThresholds();
    res.json({ success: true, data: allThresholds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/thresholds/database', (req, res) => {
  try {
    const saved = thresholdService.updateDatabaseThresholds(req.body);
    if (saved) {
      res.json({ success: true, message: 'Database monitoring thresholds saved' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// NEW: Kubernetes thresholds
app.get('/api/thresholds/kubernetes', (req, res) => {
  try {
    const thresholds = thresholdService.getKubernetesThresholds();
    res.json({ success: true, data: thresholds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/thresholds/kubernetes', (req, res) => {
  try {
    const saved = thresholdService.updateKubernetesThresholds(req.body);
    if (saved) {
      res.json({ success: true, message: 'Kubernetes monitoring thresholds saved' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/execute-script', async (req, res) => {
  try {
    const { scriptPath, arguments: args, name } = req.body;
    
    console.log('🏃 Script execution request:', { name, scriptPath, args });
    
    // Basic validation
    if (!scriptPath) {
      return res.status(400).json({
        success: false,
        error: 'Script path is required'
      });
    }

    // Check if file exists
    if (!fs.existsSync(scriptPath)) {
      return res.status(400).json({
        success: false,
        error: `Script file not found: ${scriptPath}`
      });
    }

    // Load Kubernetes configuration
    const kubeConfig = loadKubernetesConfig();
    
    // Prepare environment variables
    const env = { ...process.env }; // Start with system environment
    
    // Add KUBECONFIG if configured and file exists
    if (kubeConfig && kubeConfig.kubeconfigPath && kubeConfig.isConfigured) {
      if (fs.existsSync(kubeConfig.kubeconfigPath)) {
        env.KUBECONFIG = kubeConfig.kubeconfigPath;
        console.log(`🔧 Using KUBECONFIG: ${kubeConfig.kubeconfigPath}`);
      } else {
        console.warn(`⚠️ KUBECONFIG file not found: ${kubeConfig.kubeconfigPath}`);
      }
    }

    // Build command
    let command = `"${scriptPath}"`;
    if (args && args.trim()) {
      command += ` ${args.trim()}`;
    }

    console.log('🖥️ Executing command:', command);
    console.log('🌍 Environment variables:', Object.keys(env).filter(key => key.includes('KUBE')));
    
    const startTime = Date.now();
    
    try {
      // Execute the script with enhanced environment
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000, // 5 minutes
        maxBuffer: 1024 * 1024 * 10, // 10MB
        windowsHide: true,
        shell: true,
        cwd: path.dirname(scriptPath), // Run from script's directory
        env: env // Use enhanced environment with KUBECONFIG
      });

      const executionTime = Date.now() - startTime;
      
      // Build output with environment info
      let output = `Script: ${scriptPath}\n`;
      output += `Arguments: ${args || 'None'}\n`;
      output += `Execution time: ${executionTime}ms\n`;
      output += `Started: ${new Date(startTime).toLocaleString()}\n`;
      
      // Show environment info
      if (env.KUBECONFIG) {
        output += `KUBECONFIG: ${env.KUBECONFIG}\n`;
      }
      output += `\n`;
      
      if (stdout && stdout.trim()) {
        output += `STDOUT:\n${stdout.trim()}\n\n`;
      }
      
      if (stderr && stderr.trim()) {
        output += `STDERR:\n${stderr.trim()}\n\n`;
      }
      
      if (!stdout && !stderr) {
        output += 'Script completed successfully (no output)\n';
      }
      
      output += `--- Execution completed with exit code 0 ---`;

      console.log('✅ Script executed successfully');
      
      res.json({
        success: true,
        output: output,
        executionTime: executionTime,
        executedAt: new Date().toISOString(),
        kubeconfigUsed: !!env.KUBECONFIG
      });

    } catch (execError) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Script execution failed:', execError);

      // Build error output with environment info
      let errorOutput = `Script: ${scriptPath}\n`;
      errorOutput += `Arguments: ${args || 'None'}\n`;
      errorOutput += `Execution time: ${executionTime}ms\n`;
      errorOutput += `Started: ${new Date(startTime).toLocaleString()}\n`;
      
      if (env.KUBECONFIG) {
        errorOutput += `KUBECONFIG: ${env.KUBECONFIG}\n`;
      }
      errorOutput += `\nERROR: ${execError.message}\n`;
      
      if (execError.code) {
        errorOutput += `Exit code: ${execError.code}\n`;
      }
      
      if (execError.stdout && execError.stdout.trim()) {
        errorOutput += `\nSTDOUT:\n${execError.stdout.trim()}\n`;
      }
      
      if (execError.stderr && execError.stderr.trim()) {
        errorOutput += `\nSTDERR:\n${execError.stderr.trim()}\n`;
      }

      // Handle specific errors with suggestions
      if (execError.code === 'ENOENT') {
        errorOutput += `\n💡 File not found. Check if the path is correct.`;
      } else if (execError.code === 'EACCES') {
        errorOutput += `\n💡 Permission denied. Check file permissions.`;
      } else if (execError.signal === 'SIGTERM') {
        errorOutput += `\n💡 Script was terminated (timeout).`;
      } else if (execError.stderr && execError.stderr.includes('certificate')) {
        errorOutput += `\n💡 Certificate error detected.`;
        if (!env.KUBECONFIG) {
          errorOutput += `\n💡 Try configuring KUBECONFIG in Kubernetes settings.`;
        }
      } else if (execError.stderr && execError.stderr.includes('Unable to connect')) {
        errorOutput += `\n💡 Connection error detected.`;
        errorOutput += `\n💡 Check if your Kubernetes cluster is accessible.`;
      }

      errorOutput += `\n--- Execution failed ---`;

      res.status(400).json({
        success: false,
        error: execError.message,
        output: errorOutput,
        executionTime: executionTime,
        executedAt: new Date().toISOString(),
        kubeconfigUsed: !!env.KUBECONFIG
      });
    }

  } catch (error) {
    console.error('💥 Script execution route error:', error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

// Optional: Add route to check current Kubernetes config
app.get('/api/kubernetes-script-config', (req, res) => {
  try {
    const kubeConfig = loadKubernetesConfig();
    
    if (!kubeConfig) {
      return res.json({
        configured: false,
        message: 'No Kubernetes configuration found'
      });
    }

    const kubeconfigExists = kubeConfig.kubeconfigPath ? 
      fs.existsSync(kubeConfig.kubeconfigPath) : false;

    res.json({
      configured: kubeConfig.isConfigured,
      kubeconfigPath: kubeConfig.kubeconfigPath,
      kubeconfigExists: kubeconfigExists,
      message: kubeconfigExists ? 
        'KUBECONFIG will be automatically used for scripts' : 
        'KUBECONFIG file not found - scripts may fail'
    });

  } catch (error) {
    res.status(500).json({
      error: `Failed to check Kubernetes config: ${error.message}`
    });
  }
});

// SCRIPT PATH VALIDATION ROUTE
app.post('/api/validate-script-path', (req, res) => {
  try {
    const { scriptPath } = req.body;
    
    if (!scriptPath) {
      return res.json({
        valid: false,
        error: 'Script path is required'
      });
    }

    // Check if file exists
    if (!fs.existsSync(scriptPath)) {
      return res.json({
        valid: false,
        error: `File not found: ${scriptPath}`
      });
    }

    // Check if it's a file
    const stats = fs.statSync(scriptPath);
    if (!stats.isFile()) {
      return res.json({
        valid: false,
        error: 'Path must point to a file'
      });
    }

    // Check file extension
    const ext = path.extname(scriptPath).toLowerCase();
    if (!['.bat', '.cmd', '.exe', '.ps1'].includes(ext)) {
      return res.json({
        valid: true,
        warning: `Unusual file extension: ${ext}. Make sure this is executable.`
      });
    }

    res.json({
      valid: true,
      message: 'Script path is valid'
    });

  } catch (error) {
    res.json({
      valid: false,
      error: `Error validating path: ${error.message}`
    });
  }
});

// Get database operations status
app.get('/api/database/operations/status', (req, res) => {
  try {
    console.log('📊 Getting database operations status...');
    
    // Check if environment variables are set
    const hasUsername = !!process.env.DB_RESTART_USERNAME;
    const hasPassword = !!process.env.DB_RESTART_PASSWORD;
    
    console.log('  - DB_RESTART_USERNAME:', hasUsername ? 'SET' : 'NOT SET');
    console.log('  - DB_RESTART_PASSWORD:', hasPassword ? 'SET' : 'NOT SET');
    
    if (!hasUsername || !hasPassword) {
      // Return error but with a config object structure
      return res.json({
        success: false,
        error: 'SYS credentials not configured in environment variables',
        config: {
          isConfigured: false,
          host: 'Not available',
          port: 'Not available',
          serviceName: 'Not available',
          sysUsername: hasUsername ? process.env.DB_RESTART_USERNAME : 'NOT SET',
          sysPasswordConfigured: hasPassword,
          errorMessage: 'Missing DB_RESTART_USERNAME or DB_RESTART_PASSWORD in .env file'
        }
      });
    }
    
    // Get the configuration info from the service
    const configInfo = databaseOperationsService.getConfigInfo();
    
    console.log('📊 Config info:', configInfo);
    
    res.json({
      success: true,
      config: configInfo
    });
  } catch (error) {
    console.error('❌ Error getting database operations status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      config: {
        isConfigured: false,
        errorMessage: error.message
      }
    });
  }
});

// SHUTDOWN IMMEDIATE operation
app.post('/api/database/operations/shutdown', async (req, res) => {
  try {
    console.log('🛑 Database SHUTDOWN IMMEDIATE requested...');
    
    const result = await databaseOperationsService.shutdownImmediate();
    
    // ALWAYS return 200 status, let frontend handle success/failure
    console.log('📤 Shutdown result:', { success: result.success, message: result.message });
    res.json({ 
      success: result.success, 
      message: result.message,
      output: result.output,
      timestamp: result.timestamp,
      error: result.error || null
    });
    
  } catch (error) {
    console.error('❌ Database shutdown error:', error);
    // Even for exceptions, return 200 with error info
    res.json({ 
      success: false,
      error: error.message,
      message: `Shutdown failed: ${error.message}`,
      output: `Error: ${error.message}`,
      timestamp: new Date()
    });
  }
});

// STARTUP operation
app.post('/api/database/operations/startup', async (req, res) => {
  try {
    console.log('🚀 Database STARTUP requested...');
    
    const result = await databaseOperationsService.startup();
    
    // ALWAYS return 200 status, let frontend handle success/failure
    console.log('📤 Startup result:', { success: result.success, message: result.message });
    res.json({ 
      success: result.success, 
      message: result.message,
      output: result.output,
      timestamp: result.timestamp,
      error: result.error || null
    });
    
  } catch (error) {
    console.error('❌ Database startup error:', error);
    // Even for exceptions, return 200 with error info
    res.json({ 
      success: false,
      error: error.message,
      message: `Startup failed: ${error.message}`,
      output: `Error: ${error.message}`,
      timestamp: new Date()
    });
  }
});

app.post('/api/database/operations/restart', async (req, res) => {
  try {
    console.log('🔄 Database restart requested via API');
    const result = await databaseOperationsService.restart(); // ✅ Correct method name
    res.json(result);
  } catch (error) {
    console.error('❌ Database restart error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/database/operations/validate', (req, res) => {
  try {
    console.log('🔍 Validating database operations configuration...');
    
    const validation = databaseOperationsService.validateConfig();
    
    res.json({
      success: validation.isValid,
      isValid: validation.isValid,
      missingItems: validation.missingItems,
      configInfo: validation.configInfo
    });
  } catch (error) {
    console.error('❌ Validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/database/operations/check-status', async (req, res) => {
  try {
    console.log('🔍 Checking database status...');
    
    const statusResult = await databaseOperationsService.checkDatabaseStatusLocal();
    
    res.json({
      success: true,
      ...statusResult
    });
  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/database/operations/test-connection', async (req, res) => {
  try {
    console.log('🧪 Database SYS connection test requested');
    const result = await databaseOperationsService.testConnection(); // ✅ Correct method name
    res.json(result);
  } catch (error) {
    console.error('❌ Database connection test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/database/operations/config', (req, res) => {
  try {
    const validation = databaseOperationsService.validateConfig(); // ✅ Correct method name
    res.json({
      success: true,
      ...validation
    });
  } catch (error) {
    console.error('❌ Database operations config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add this route to your backend/server.js file
// Place it after your existing database operations routes

// Database privilege checker route
app.get('/api/database/check-privileges', async (req, res) => {
  try {
    console.log('🔍 Checking database privileges for current user...');
    
    const config = dbConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const connection = realOracleService.connection;
    if (!connection) {
      return res.status(400).json({
        success: false,
        error: 'No active database connection'
      });
    }

    let privilegeInfo = {
      user: config.username,
      timestamp: new Date().toISOString(),
      environment: {},
      privileges: {},
      recommendations: []
    };

    // Check environment (PDB vs CDB)
    try {
      const envQuery = `
        SELECT 
          SYS_CONTEXT('USERENV', 'CON_NAME') as container_name,
          SYS_CONTEXT('USERENV', 'CON_ID') as container_id,
          (SELECT CDB FROM v$database) as is_cdb
        FROM dual
      `;
      
      const envResult = await connection.execute(envQuery);
      if (envResult.rows.length > 0) {
        const [containerName, containerId, isCdb] = envResult.rows[0];
        privilegeInfo.environment = {
          container_name: containerName,
          container_id: containerId,
          is_cdb: isCdb === 'YES',
          is_pdb: containerId > 1
        };
      }
    } catch (envError) {
      privilegeInfo.environment.error = envError.message;
    }

    // Check system privileges
    try {
      const sysPrivQuery = `
        SELECT privilege FROM user_sys_privs 
        WHERE privilege IN (
          'SYSDBA', 'SYSOPER', 'ALTER SYSTEM', 'ALTER DATABASE',
          'CREATE SESSION', 'ALTER PLUGGABLE DATABASE'
        )
        ORDER BY privilege
      `;
      
      const sysPrivResult = await connection.execute(sysPrivQuery);
      privilegeInfo.privileges.system = sysPrivResult.rows.map(row => row[0]);
    } catch (privError) {
      privilegeInfo.privileges.system_error = privError.message;
    }

    // Check role privileges
    try {
      const roleQuery = `
        SELECT granted_role FROM user_role_privs 
        WHERE granted_role IN ('DBA', 'RESOURCE', 'CONNECT')
        ORDER BY granted_role
      `;
      
      const roleResult = await connection.execute(roleQuery);
      privilegeInfo.privileges.roles = roleResult.rows.map(row => row[0]);
    } catch (roleError) {
      privilegeInfo.privileges.role_error = roleError.message;
    }

    // Check for SYSDBA in password file
    try {
      const sysdbaQuery = `
        SELECT username FROM v$pwfile_users 
        WHERE username = '${config.username.toUpperCase()}'
      `;
      
      const sysdbaResult = await connection.execute(sysdbaQuery);
      privilegeInfo.privileges.sysdba_in_pwfile = sysdbaResult.rows.length > 0;
    } catch (sysdbaError) {
      privilegeInfo.privileges.sysdba_check_error = sysdbaError.message;
    }

    // Generate recommendations
    const hasSystemPrivs = privilegeInfo.privileges.system || [];
    const hasRoles = privilegeInfo.privileges.roles || [];
    
    if (!privilegeInfo.privileges.sysdba_in_pwfile && !hasSystemPrivs.includes('SYSDBA') && !hasSystemPrivs.includes('SYSOPER')) {
      privilegeInfo.recommendations.push({
        type: 'CRITICAL',
        message: `User '${config.username}' needs SYSDBA or SYSOPER privileges for database shutdown`,
        command: `GRANT SYSDBA TO ${config.username};`,
        explanation: 'Required for SHUTDOWN IMMEDIATE and STARTUP operations'
      });
    }

    if (privilegeInfo.environment.is_pdb && !hasSystemPrivs.includes('ALTER PLUGGABLE DATABASE')) {
      privilegeInfo.recommendations.push({
        type: 'INFO',
        message: 'For PDB-specific operations, consider granting ALTER PLUGGABLE DATABASE',
        command: `GRANT ALTER PLUGGABLE DATABASE TO ${config.username};`,
        explanation: 'Allows opening/closing pluggable databases'
      });
    }

    if (hasSystemPrivs.length === 0 && hasRoles.length === 0) {
      privilegeInfo.recommendations.push({
        type: 'WARNING',
        message: 'User has minimal privileges - consider granting RESOURCE role for basic operations',
        command: `GRANT RESOURCE TO ${config.username};`,
        explanation: 'Provides basic database object creation privileges'
      });
    }

    if (privilegeInfo.privileges.sysdba_in_pwfile) {
      privilegeInfo.recommendations.push({
        type: 'SUCCESS',
        message: `User '${config.username}' has SYSDBA privileges in password file`,
        explanation: 'Should be able to perform shutdown/startup operations'
      });
    }

    console.log('✅ Privilege check completed');
    res.json({ 
      success: true, 
      data: privilegeInfo
    });

  } catch (error) {
    console.error('❌ Privilege check error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Restart a pod
app.post('/api/kubernetes/pods/:namespace/:podName/restart', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    console.log(`🔄 Restart pod requested: ${namespace}/${podName}`);
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    // Delete the pod (it will be recreated by deployment)
    const result = await podActionsService.deletePod(namespace, podName, false);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Pod ${podName} restart initiated`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to restart pod'
      });
    }
  } catch (error) {
    console.error('❌ Restart pod error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete a pod
app.delete('/api/kubernetes/pods/:namespace/:podName', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    const { force } = req.query;
    
    // Validate parameters
    if (!namespace || !podName) {
      return res.status(400).json({
        success: false,
        error: 'Namespace and pod name are required'
      });
    }

    console.log(`🗑️ Pod deletion requested: ${namespace}/${podName}, force: ${force}`);
    
    const result = await podActionsService.deletePod(namespace, podName, force === 'true');
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        output: result.output,
        method: result.method,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Pod deletion error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get pod logs
app.get('/api/kubernetes/pods/:namespace/:podName/logs', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    const { container, lines = 100 } = req.query;
    
    // Validate parameters
    if (!namespace || !podName) {
      return res.status(400).json({
        success: false,
        error: 'Namespace and pod name are required'
      });
    }

    console.log(`📝 Pod logs requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.getPodLogs(
      namespace, 
      podName, 
      container, 
      parseInt(lines) || 100
    );
    
    if (result.success) {
      res.json({
        success: true,
        logs: result.logs,
        method: result.method,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        logs: result.logs,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Pod logs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add health check route
app.get('/api/kubernetes/health', async (req, res) => {
  try {
    const availability = await podActionsService.checkKubernetesAvailability();
    res.json({
      success: true,
      kubernetes: availability
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute command in pod
app.post('/api/kubernetes/pods/:namespace/:podName/exec', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    const { container, command = '/bin/bash' } = req.body;
    console.log(`⚡ Pod exec requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.execInPod(namespace, podName, container, command);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        execCommand: result.execCommand,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Pod exec error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Scale deployment
app.post('/api/kubernetes/deployments/:namespace/:deploymentName/scale', async (req, res) => {
  try {
    const { namespace, deploymentName } = req.params;
    const { replicas } = req.body;
    
    console.log(`📊 Scale deployment requested: ${namespace}/${deploymentName} to ${replicas} replicas`);
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }

    const result = await podActionsService.scaleDeployment(namespace, deploymentName, replicas);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Deployment ${deploymentName} scaled to ${replicas} replicas`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || 'Failed to scale deployment'
      });
    }
  } catch (error) {
    console.error('❌ Scale deployment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Describe pod
app.get('/api/kubernetes/pods/:namespace/:podName/describe', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    console.log(`📋 Pod describe requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.describePod(namespace, podName);
    
    if (result.success) {
      res.json({
        success: true,
        description: result.description,
        timestamp: result.timestamp
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        description: result.description,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('❌ Pod describe error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get pod containers
app.get('/api/kubernetes/pods/:namespace/:podName/containers', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    console.log(`📦 Pod containers requested: ${namespace}/${podName}`);
    
    const result = await podActionsService.getPodContainers(namespace, podName);
    
    if (result.success) {
      res.json({
        success: true,
        containers: result.containers
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error('❌ Pod containers error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get deployment info for pod
  app.get('/api/kubernetes/pods/:namespace/:podName/deployment', async (req, res) => {
    try {
      const { namespace, podName } = req.params;
      
      const deploymentInfo = await podActionsService.getDeploymentInfo(namespace, podName);
      
      if (deploymentInfo.success) {
        res.json({
          success: true,
          data: deploymentInfo.deployment
        });
      } else {
        res.status(404).json({
          success: false,
          error: deploymentInfo.message || 'Deployment info not found'
        });
      }
    } catch (error) {
      console.error('❌ Get deployment info error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

// Add this endpoint to backend/server.js for manual snapshot refresh

app.post('/api/kubernetes/snapshot/refresh', async (req, res) => {
  try {
    console.log('🔄 Refreshing pod snapshot...');
    
    const kubeConfig = kubernetesConfigService.getConfig();
    
    if (!kubeConfig.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }
    
    // Get all current pods
    const pods = await kubernetesService.getAllPods();
    
    // Take new snapshot
    const snapshot = await podLifecycleService.takeInitialSnapshot(pods);
    
    res.json({
      success: true,
      message: 'Pod snapshot refreshed successfully',
      snapshot: {
        timestamp: snapshot.timestamp,
        podCount: snapshot.pods.length
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to refresh snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current snapshot info
app.get('/api/kubernetes/snapshot/info', (req, res) => {
  try {
    const snapshot = podLifecycleService.loadSnapshot();
    
    if (!snapshot) {
      return res.json({
        success: false,
        message: 'No snapshot available'
      });
    }
    
    const currentPods = [];
    const stats = podLifecycleService.getSnapshotStatistics(currentPods);
    
    res.json({
      success: true,
      snapshot: {
        timestamp: snapshot.timestamp,
        podCount: snapshot.pods.length,
        age: calculateAge(snapshot.timestamp),
        statistics: stats
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


function calculateAge(timestamp) {
  const now = new Date();
  const created = new Date(timestamp);
  const diffMs = now - created;
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

app.get('/api/kubernetes/pods/enhanced', async (req, res) => {
  try {
    const { 
      namespace = 'default', 
      includeDeleted = 'true',
      maxAge,
      sortBy = 'lastSeen'
    } = req.query;
    
    console.log(`🔍 Enhanced pods request: namespace=${namespace}, includeDeleted=${includeDeleted}`);
    
    // Get current pods from Kubernetes
    let currentPods = [];
    try {
      if (namespace === 'all') {
        currentPods = await kubernetesService.getAllPodsWithContainers();
      } else {
        currentPods = await kubernetesService.getPods(namespace);
      }
    } catch (k8sError) {
      console.log('⚠️ Could not fetch current pods from K8s:', k8sError.message);
    }
    
    // Get comprehensive pod list comparing with initial snapshot
    const comprehensivePods = podLifecycleService.getComprehensivePodList(currentPods);
    
    // Filter by namespace if needed
    let filteredPods = comprehensivePods;
    if (namespace !== 'all') {
      filteredPods = comprehensivePods.filter(pod => pod.namespace === namespace);
    }
    
    // Filter deleted pods if requested
    if (includeDeleted === 'false') {
      filteredPods = filteredPods.filter(pod => !pod.isDeleted);
    }
    
    // Add calculated fields
    filteredPods = filteredPods.map(pod => ({
      ...pod,
      age: pod.age || calculateAge(pod.snapshotTime || new Date()),
      lifecycleStage: pod.isDeleted ? 'deleted' : 
                     pod.isNew ? 'new' :
                     pod.status === 'Running' ? 'stable' : 
                     pod.status === 'Pending' ? 'starting' : 
                     pod.status === 'Failed' ? 'failed' : 'unknown'
    }));
    
    // Get statistics
    const stats = podLifecycleService.getSnapshotStatistics(currentPods);
    
    console.log(`✅ Enhanced pods response: ${filteredPods.length} pods (${stats.deletedPods} deleted since snapshot)`);
    
    res.json({
      success: true,
      data: {
        pods: filteredPods,
        statistics: {
          total: filteredPods.length,
          running: filteredPods.filter(p => !p.isDeleted && p.status === 'Running').length,
          pending: filteredPods.filter(p => !p.isDeleted && p.status === 'Pending').length,
          failed: filteredPods.filter(p => !p.isDeleted && p.status === 'Failed').length,
          deleted: filteredPods.filter(p => p.isDeleted).length,
          newSinceSnapshot: filteredPods.filter(p => p.createdAfterSnapshot).length,
          deletedSinceSnapshot: filteredPods.filter(p => p.deletedSinceSnapshot).length,
          snapshotTime: stats.snapshotTime
        },
        changes: [],
        timestamp: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ Enhanced pods error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

async function sendPodDisappearanceEmail(disappearanceAlert, emailGroupId) {
  try {
    const emailService = require('./services/emailService');
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === emailGroupId && g.enabled);
    
    if (!targetGroup || targetGroup.emails.length === 0) {
      console.log('⚠️ No valid email group found for pod disappearance alert');
      return false;
    }

    const { namespace, podCount, pods, timestamp } = disappearanceAlert;
    const alertTime = new Date(timestamp);

    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: `🛑 KUBERNETES ALERT: ${podCount} pods stopped in '${namespace}'`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #ff4d4f; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">🛑 KUBERNETES PODS STOPPED</h1>
          </div>
          
          <div style="padding: 20px; background-color: #fff2f0; border-left: 5px solid #ff4d4f;">
            <h2 style="color: #ff4d4f; margin-top: 0;">Mass Pod Disappearance Detected</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Namespace:</td>
                <td style="padding: 8px; color: #ff4d4f; font-weight: bold; border-bottom: 1px solid #ddd;">${namespace}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Pods Stopped:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${podCount}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Detection Time:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${alertTime.toLocaleString()}</td>
              </tr>
            </table>
            
            <h3 style="color: #ff4d4f;">Affected Pods:</h3>
            <div style="background-color: #ffffff; border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
              ${pods.slice(0, 10).map(pod => `
                <div style="padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
                  <strong>${pod.name}</strong> 
                  <span style="color: #666; font-size: 12px;">(Last status: ${pod.status})</span>
                </div>
              `).join('')}
              ${pods.length > 10 ? `<div style="padding: 4px 0; color: #666; font-style: italic;">... and ${pods.length - 10} more pods</div>` : ''}
            </div>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⚠️ RECOMMENDED ACTIONS</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li>Check if this was an intentional maintenance operation</li>
                <li>Verify Kubernetes cluster status and connectivity</li>
                <li>Review deployment and service configurations</li>
                <li>Check for resource constraints or node issues</li>
                <li>Consider restarting services if this was unintentional</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">Alert sent to: ${targetGroup.name}</p>
            <p style="margin: 5px 0 0 0;">Kubernetes Pod Monitoring System</p>
          </div>
        </div>
      `
    };

    await emailService.transporter.sendMail(mailOptions);
    console.log(`📧 ✅ Pod disappearance alert sent successfully to ${targetGroup.emails.length} recipients`);
    return true;
    
  } catch (error) {
    console.error('📧 ❌ Failed to send pod disappearance email:', error);
    return false;
  }
}


function isPodReadyComplete(pod) {
  // Method 1: Check if pod.ready is true (most reliable)
  if (pod.ready === true) {
    return true;
  }
  
  // Method 2: Parse ready containers vs total containers
  if (pod.readyContainers !== undefined && pod.totalContainers !== undefined) {
    return pod.readyContainers === pod.totalContainers && pod.totalContainers > 0;
  }
  
  // Method 3: Parse from containerStatuses if available
  if (pod.containerStatuses && Array.isArray(pod.containerStatuses)) {
    const readyContainers = pod.containerStatuses.filter(c => c.ready === true).length;
    const totalContainers = pod.containerStatuses.length;
    return readyContainers === totalContainers && totalContainers > 0;
  }
  
  // Method 4: Check status patterns - handle Init containers dynamically
  const status = pod.status || '';
  
  // Basic incomplete statuses
  const basicIncompleteStatuses = [
    'Pending', 
    'ContainerCreating', 
    'PodInitializing',
    'Terminating',
    'Unknown'
  ];
  
  if (basicIncompleteStatuses.includes(status)) {
    return false;
  }
  
  // Handle Init container patterns: Init:X/Y where X < Y
  if (status.startsWith('Init:')) {
    const initMatch = status.match(/^Init:(\d+)\/(\d+)$/);
    if (initMatch) {
      const currentInit = parseInt(initMatch[1]);
      const totalInit = parseInt(initMatch[2]);
      
      console.log(`🔍 Init container status detected: ${status} (${currentInit}/${totalInit})`);
      
      // Init containers are incomplete if current < total
      const isInitComplete = currentInit === totalInit;
      if (!isInitComplete) {
        console.log(`❌ Init containers not complete: ${currentInit} of ${totalInit} ready`);
        return false;
      } else {
        console.log(`✅ Init containers complete: ${currentInit}/${totalInit}`);
        // Even if init is complete, check if main containers are ready
        // Fall through to other checks
      }
    }
  }
  
  // Handle Completed status - check if it's a job/init with incomplete ratio
  if (status === 'Completed') {
    // For completed pods, check the ready ratio
    if (pod.readyContainers !== undefined && pod.totalContainers !== undefined) {
      const isCompleteAndReady = pod.readyContainers === pod.totalContainers;
      if (!isCompleteAndReady) {
        console.log(`❌ Completed pod with incomplete ratio: ${pod.readyContainers}/${pod.totalContainers}`);
        return false;
      }
    } else {
      // If no container info and status is Completed, likely an init/job container
      console.log(`❌ Completed pod without container status (likely init/job): ${pod.namespace}/${pod.name}`);
      return false;
    }
  }
  
  // Handle CrashLoopBackOff and similar error states
  const errorStatuses = [
    'CrashLoopBackOff',
    'ImagePullBackOff',
    'ErrImagePull',
    'InvalidImageName',
    'CreateContainerError',
    'RunContainerError'
  ];
  
  if (errorStatuses.includes(status)) {
    console.log(`❌ Pod in error state: ${status}`);
    return false;
  }
  
  // Handle PodReadyCondition patterns (some k8s versions use this)
  if (status.includes('PodReadyCondition')) {
    return false;
  }
  
  // Method 5: Check for partial readiness in pod name patterns
  // Some systems put readiness info in the pod name or labels
  const podName = pod.name || '';
  
  // Check if pod name suggests it's an init container
  if (podName.includes('-init-') || podName.includes('-setup-') || podName.includes('-migration-')) {
    console.log(`🔍 Pod name suggests init/setup container: ${podName}`);
    
    // Only include if it's Running AND ready
    if (status === 'Running' && pod.ready === true) {
      return true;
    } else {
      console.log(`❌ Init/setup container not ready: ${status}, ready: ${pod.ready}`);
      return false;
    }
  }
  
  // Method 6: If status is Running, check ready flag more strictly
  if (status === 'Running') {
    // For running pods, must have explicit ready=true or proper container ratios
    if (pod.ready === true) {
      return true;
    }
    
    // Check container readiness if available
    if (pod.readyContainers !== undefined && pod.totalContainers !== undefined) {
      return pod.readyContainers === pod.totalContainers && pod.totalContainers > 0;
    }
    
    // If running but no ready info, be conservative and exclude
    console.log(`⚠️ Running pod without clear ready status: ${pod.namespace}/${pod.name}`);
    return false;
  }
  
  // Method 7: Handle Succeeded status (completed jobs)
  if (status === 'Succeeded') {
    // Jobs that succeeded should generally be excluded unless specifically needed
    console.log(`🔍 Succeeded pod (completed job): ${pod.namespace}/${pod.name}`);
    return false;
  }
  
  // Default: exclude unknown states for safety
  console.log(`❓ Unknown pod status, excluding for safety: ${status} (${pod.namespace}/${pod.name})`);
  return false;
}


function getPodReadyString(pod) {
  // Show init container status if present
  if (pod.status && pod.status.startsWith('Init:')) {
    return pod.status; // Shows "Init:1/2", "Init:2/3", etc.
  }
  
  if (pod.readyContainers !== undefined && pod.totalContainers !== undefined) {
    return `${pod.readyContainers}/${pod.totalContainers}`;
  }
  
  if (pod.containerStatuses && Array.isArray(pod.containerStatuses)) {
    const readyContainers = pod.containerStatuses.filter(c => c.ready === true).length;
    const totalContainers = pod.containerStatuses.length;
    return `${readyContainers}/${totalContainers}`;
  }
  
  // Enhanced fallback with more context
  const readyStatus = pod.ready ? 'Ready' : 'Not Ready';
  return `${readyStatus} (${pod.status || 'Unknown'})`;
}

app.get('/api/kubernetes/pods/:namespace/:podName/history', async (req, res) => {
  try {
    const { namespace, podName } = req.params;
    
    const pods = podLifecycleService.getComprehensivePodList({      
      namespace
    });
    
    const pod = pods.find(p => p.name === podName && p.namespace === namespace);
    
    if (!pod) {
      return res.status(404).json({
        success: false,
        error: 'Pod not found in history'
      });
    }
    
    res.json({
      success: true,
      data: {
        pod: pod,
        statusHistory: pod.statusHistory,
        lifecycle: {
          firstSeen: pod.firstSeen,
          lastSeen: pod.lastSeen,
          isDeleted: pod.isDeleted,
          deletedAt: pod.deletedAt,
          age: pod.age,
          statusDuration: pod.statusDuration
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Pod history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/kubernetes/pods/statistics', async (req, res) => {
  try {
    const { namespace = 'all', timeRange = 24 } = req.query;
    
    const stats = podLifecycleService.getPodStatistics(
      namespace === 'all' ? null : namespace
    );
    
    // Add time-based statistics
    const pods = podLifecycleService.getComprehensivePodList({
      namespace: namespace === 'all' ? null : namespace,
      maxAge: parseInt(timeRange)
    });
    
    // Calculate trends
    const now = new Date();
    const intervals = {
      '1h': new Date(now - 60 * 60 * 1000),
      '6h': new Date(now - 6 * 60 * 60 * 1000),
      '24h': new Date(now - 24 * 60 * 60 * 1000)
    };
    
    const trends = {};
    Object.entries(intervals).forEach(([period, cutoff]) => {
      const recentPods = pods.filter(p => new Date(p.firstSeen) > cutoff);
      const deletedPods = pods.filter(p => p.isDeleted && p.deletedAt && new Date(p.deletedAt) > cutoff);
      
      trends[period] = {
        created: recentPods.length,
        deleted: deletedPods.length,
        netChange: recentPods.length - deletedPods.length
      };
    });
    
    res.json({
      success: true,
      data: {
        current: stats,
        trends: trends,
        timeRange: `${timeRange}h`,
        namespace: namespace
      }
    });
    
  } catch (error) {
    console.error('❌ Pod statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/pods/cleanup', async (req, res) => {
  try {
    const { maxAgeDays = 30 } = req.body;
    
    const removedCount = podLifecycleService.cleanupOldHistory(maxAgeDays);
    
    res.json({
      success: true,
      message: `Cleaned up ${removedCount} old pod records`,
      removedCount: removedCount
    });
    
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SCRIPT MANAGEMENT ROUTES
app.get('/api/scripts', (req, res) => {
  try {
    const scripts = scriptService.getAllScripts();
    res.json({ success: true, data: scripts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/scripts', (req, res) => {
  try {
    const newScript = scriptService.addScript(req.body);
    if (newScript) {
      res.json({ success: true, data: newScript });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save script' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/scripts/:id', (req, res) => {
  try {
    const updatedScript = scriptService.updateScript(req.params.id, req.body);
    if (updatedScript) {
      res.json({ success: true, data: updatedScript });
    } else {
      res.status(404).json({ success: false, error: 'Script not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/scripts/:id', (req, res) => {
  try {
    const deleted = scriptService.deleteScript(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Script deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Script not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADD these endpoints to your server.js file

// Reset Kubernetes monitoring state
app.post('/api/kubernetes/monitoring/reset', (req, res) => {
  try {
    console.log('🔄 Monitoring reset requested');
    
    // Reset the monitoring service state
    kubernetesMonitoringService.resetMonitoringState();
    
    res.json({
      success: true,
      message: 'Kubernetes monitoring state reset successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Reset monitoring error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Perform baseline check
app.post('/api/kubernetes/monitoring/baseline', async (req, res) => {
  try {
    console.log('📊 Baseline check requested');
    
    const config = kubernetesConfigService.getConfig();
    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Kubernetes not configured'
      });
    }
    
    // Perform baseline check
    await kubernetesMonitoringService.performBaselineCheck();
    
    res.json({
      success: true,
      message: 'Baseline check completed successfully',
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Baseline check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current monitoring statistics
app.get('/api/kubernetes/monitoring/stats', (req, res) => {
  try {
    const status = kubernetesMonitoringService.getStatus();
    
    // Add additional debug info
    const stats = {
      ...status,
      workloadStatusCount: kubernetesMonitoringService.workloadStatuses.size,
      nodeStatusCount: kubernetesMonitoringService.nodeStatuses.size,
      emailSentStatusCount: kubernetesMonitoringService.emailSentStatus.size
    };
    
    res.json({
      success: true,
      stats: stats,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Get monitoring stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get heartbeat configuration
app.get('/api/system/heartbeat/config', (req, res) => {
  try {
    const config = systemHeartbeatService.getConfig();
    res.json({ 
      success: true, 
      data: config 
    });
  } catch (error) {
    console.error('❌ Get heartbeat config error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Save heartbeat configuration
app.post('/api/system/heartbeat/config', (req, res) => {
  try {
    console.log('📝 Heartbeat config request body:', JSON.stringify(req.body, null, 2));
    
    const { emailGroupId, intervalMinutes, customMessage } = req.body;
    
    if (!emailGroupId) {
      return res.status(400).json({
        success: false,
        error: 'Email group ID is required'
      });
    }

    const configData = {
      emailGroupId: parseInt(emailGroupId), // Make sure it's a number
      intervalMinutes: intervalMinutes || 60,
      customMessage: customMessage || ''
    };

    console.log('📝 Config data to save:', JSON.stringify(configData, null, 2));

    const saved = systemHeartbeatService.updateConfig(configData);
    
    if (saved) {
      const currentConfig = systemHeartbeatService.getConfig();
      console.log('📝 Config after save:', JSON.stringify(currentConfig, null, 2));
      
      res.json({
        success: true,
        message: 'Heartbeat configuration saved',
        config: currentConfig
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save configuration'
      });
    }
  } catch (error) {
    console.error('❌ Heartbeat config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get heartbeat status
app.get('/api/system/heartbeat/status', (req, res) => {
  try {
    const status = systemHeartbeatService.getStatus();
    res.json({ 
      success: true, 
      data: status 
    });
  } catch (error) {
    console.error('❌ Get heartbeat status error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start heartbeat manually
app.post('/api/system/heartbeat/start', (req, res) => {
  try {
    const started = systemHeartbeatService.startMonitoring();
    
    if (started) {
      res.json({ 
        success: true, 
        message: 'Heartbeat started successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Failed to start heartbeat. Check configuration.' 
      });
    }
  } catch (error) {
    console.error('❌ Start heartbeat error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Stop heartbeat manually
app.post('/api/system/heartbeat/stop', (req, res) => {
  try {
    const stopped = systemHeartbeatService.stopMonitoring();
    
    res.json({ 
      success: true, 
      message: stopped ? 'Heartbeat stopped successfully' : 'Heartbeat was not running' 
    });
  } catch (error) {
    console.error('❌ Stop heartbeat error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send test heartbeat immediately
app.post('/api/system/heartbeat/test', async (req, res) => {
  try {
    console.log('💓 Test heartbeat requested');
    const sent = await systemHeartbeatService.sendHeartbeat();
    
    if (sent) {
      res.json({ 
        success: true, 
        message: 'Test heartbeat sent successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Failed to send test heartbeat. Check email configuration.' 
      });
    }
  } catch (error) {
    console.error('❌ Test heartbeat error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.post('/api/kubernetes/pods/import', async (req, res) => {
  try {
    const { pods } = req.body;
    console.log(`📥 Importing ${pods.length} pods into lifecycle tracking`);
    
    // Feed your pod data into the lifecycle service
    const changes = await podLifecycleService.updatePodLifecycle(pods);
    
    res.json({
      success: true,
      message: `Imported ${pods.length} pods`,
      changes: changes.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/kubernetes/debug/test-pod-alert', async (req, res) => {
  try {
    console.log('🧪 Testing pod disappearance email alert...');
    
    // Get Kubernetes configuration
    const kubeConfig = kubernetesConfigService.getConfig();
    if (!kubeConfig.emailGroupId) {
      return res.status(400).json({
        success: false,
        error: 'No email group configured for Kubernetes alerts'
      });
    }
    
    // Create a fake disappearance alert for testing
    const testAlert = {
      type: 'mass_disappearance',
      namespace: 'uattest',
      podCount: 5,
      timestamp: new Date().toISOString(),
      message: 'TEST: 5 pods stopped/disappeared in namespace \'uattest\'',
      pods: [
        { name: 'test-pod-1', namespace: 'uattest', status: 'Running' },
        { name: 'test-pod-2', namespace: 'uattest', status: 'Running' },
        { name: 'test-pod-3', namespace: 'uattest', status: 'Running' },
        { name: 'test-pod-4', namespace: 'uattest', status: 'Running' },
        { name: 'test-pod-5', namespace: 'uattest', status: 'Running' }
      ],
      severity: 'warning'
    };
    
    // Send test email
    const emailSent = await sendPodDisappearanceEmail(testAlert, kubeConfig.emailGroupId);
    
    if (emailSent) {
      res.json({
        success: true,
        message: 'Test pod disappearance email sent successfully!',
        emailGroupId: kubeConfig.emailGroupId,
        testAlert: testAlert
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send test email'
      });
    }
    
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add another debug route to check your email configuration
app.get('/api/kubernetes/debug/email-config', (req, res) => {
  try {
    const emailService = require('./services/emailService');
    const kubeConfig = kubernetesConfigService.getConfig();
    const emailGroups = emailService.getEmailGroups();
    
    const debugInfo = {
      kubernetesConfig: {
        isConfigured: kubeConfig.isConfigured,
        hasEmailGroup: !!kubeConfig.emailGroupId,
        emailGroupId: kubeConfig.emailGroupId
      },
      emailService: {
        isConfigured: emailService.isConfigured,
        totalGroups: emailGroups.length,
        enabledGroups: emailGroups.filter(g => g.enabled).length
      },
      selectedEmailGroup: null
    };
    
    if (kubeConfig.emailGroupId) {
      const selectedGroup = emailGroups.find(g => g.id === kubeConfig.emailGroupId);
      if (selectedGroup) {
        debugInfo.selectedEmailGroup = {
          id: selectedGroup.id,
          name: selectedGroup.name,
          enabled: selectedGroup.enabled,
          emailCount: selectedGroup.emails.length,
          emails: selectedGroup.emails // Show emails for debugging
        };
      }
    }
    
    res.json({
      success: true,
      debug: debugInfo
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/kubernetes/pod-monitoring/status', (req, res) => {
  try {
    const status = podMonitoringService.getStatus();
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/pod-monitoring/start', (req, res) => {
  try {
    const started = podMonitoringService.startMonitoring();
    if (started) {
      res.json({
        success: true,
        message: 'Pod monitoring started successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to start pod monitoring (already running or not configured)'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/check-pod-recovery', async (req, res) => {
  try {
    console.log('🔍 Manual pod recovery check requested');
    
    // Run the recovery check
    await podRecoveryNotifier.checkAndNotifyRecovery();
    
    res.json({
      success: true,
      message: 'Pod recovery check completed',
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Pod recovery check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/pod-monitoring/stop', (req, res) => {
  try {
    const stopped = podMonitoringService.stopMonitoring();
    if (stopped) {
      res.json({
        success: true,
        message: 'Pod monitoring stopped successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Pod monitoring was not running'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


app.get('/api/kubernetes/pod-recovery/status', (req, res) => {
  res.json({
    success: true,
    isWatching: podRecoveryNotifier.isWatching,
    config: {
      lastKnownPodsFile: podRecoveryNotifier.lastKnownPodsFile,
      dataDir: podRecoveryNotifier.dataDir
    }
  });
});

app.post('/api/kubernetes/pod-recovery/start', (req, res) => {
  try {
    podRecoveryNotifier.startWatching();
    res.json({
      success: true,
      message: 'Pod recovery notifier started'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kubernetes/pod-recovery/stop', (req, res) => {
  try {
    podRecoveryNotifier.stopWatching();
    res.json({
      success: true,
      message: 'Pod recovery notifier stopped'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual trigger for testing
app.post('/api/kubernetes/pod-recovery/check', async (req, res) => {
  try {
    console.log('🔍 Manual pod recovery check requested');
    await podRecoveryNotifier.checkAndNotifyRecovery();
    res.json({
      success: true,
      message: 'Pod recovery check completed',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('❌ Pod recovery check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Snapshot management endpoints
app.post('/api/kubernetes/snapshot/take', async (req, res) => {
  try {
    const { name } = req.body;
    
    // Get current pods
    const currentPods = await kubernetesService.getAllPodsWithContainers();
    
    // Take snapshot (will automatically exclude partially ready pods)
    const snapshot = podLifecycleService.takeSnapshot(currentPods, name);
    
    res.json({
      success: true,
      message: 'Snapshot taken successfully',
      snapshot: {
        name: snapshot.name,
        timestamp: snapshot.timestamp,
        includedCount: snapshot.totalCount,
        excludedCount: snapshot.excludedCount,
        originalCount: snapshot.originalCount
      },
      details: snapshot.excludedCount > 0 ? 
        `${snapshot.excludedCount} partially ready pods were excluded from the snapshot` : 
        'All pods were fully ready and included in the snapshot'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/kubernetes/snapshot/status', (req, res) => {
  try {
    const snapshot = podLifecycleService.getCurrentSnapshot();
    
    res.json({
      success: true,
      hasSnapshot: podLifecycleService.hasSnapshot(),
      snapshot: snapshot ? {
        name: snapshot.name,
        timestamp: snapshot.timestamp,
        count: snapshot.totalCount
      } : null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/kubernetes/snapshot', (req, res) => {
  try {
    podLifecycleService.clearSnapshot();
    
    res.json({
      success: true,
      message: 'Snapshot cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/kubernetes/restart-alerts/config', (req, res) => {
  try {
    const monitoringService = require('./services/kubernetesMonitoringService');
    const config = monitoringService.restartAlertConfig;
    const status = monitoringService.getStatus();
    
    res.json({
      success: true,
      data: {
        enabled: config.enabled,
        threshold: config.threshold,
        cooldownMinutes: config.cooldownMs / 60000,
        trackedPods: status.restartTracking?.trackedPods || 0,
        isMonitoring: status.isMonitoring
      }
    });
  } catch (error) {
    console.error('Get restart config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// UPDATE restart alert configuration
app.post('/api/kubernetes/restart-alerts/config', (req, res) => {
  try {
    const { enabled, threshold, cooldownMinutes } = req.body;
    const monitoringService = require('./services/kubernetesMonitoringService');
    
    // Validate inputs
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean'
      });
    }
    
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
      return res.status(400).json({
        success: false,
        error: 'threshold must be an integer between 1 and 100'
      });
    }
    
    if (!Number.isInteger(cooldownMinutes) || cooldownMinutes < 1 || cooldownMinutes > 1440) {
      return res.status(400).json({
        success: false,
        error: 'cooldownMinutes must be an integer between 1 and 1440 (24 hours)'
      });
    }
    
    // Update configuration
    monitoringService.configureRestartAlerts(enabled, threshold, cooldownMinutes);
    
    console.log(`🔧 Restart alert config updated via API: enabled=${enabled}, threshold=${threshold}, cooldown=${cooldownMinutes}min`);
    
    res.json({
      success: true,
      message: 'Restart alert configuration updated successfully',
      data: {
        enabled,
        threshold,
        cooldownMinutes
      }
    });
  } catch (error) {
    console.error('Update restart config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET restart alert statistics and tracked pods
app.get('/api/kubernetes/restart-alerts/stats', (req, res) => {
  try {
    const monitoringService = require('./services/kubernetesMonitoringService');
    const tracking = monitoringService.podRestartTracking;
    
    const stats = {
      totalTrackedPods: tracking.size,
      config: monitoringService.restartAlertConfig,
      pods: []
    };
    
    // Get recent restart information
    for (const [podKey, data] of tracking) {
      const [namespace, name] = podKey.split('/');
      stats.pods.push({
        namespace,
        name,
        restarts: data.restarts,
        lastSeen: data.lastSeen,
        lastAlertTime: data.lastAlertTime,
        timeSinceLastAlert: data.lastAlertTime ? 
          Math.round((new Date().getTime() - data.lastAlertTime.getTime()) / 60000) : null,
        timeSinceLastSeen: Math.round((new Date().getTime() - data.lastSeen.getTime()) / 60000)
      });
    }
    
    // Sort by restart count (highest first)
    stats.pods.sort((a, b) => b.restarts - a.restarts);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get restart stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// CLEAR restart alert tracking (useful for testing)
app.post('/api/kubernetes/restart-alerts/clear', (req, res) => {
  try {
    const monitoringService = require('./services/kubernetesMonitoringService');
    
    const previousCount = monitoringService.podRestartTracking.size;
    monitoringService.podRestartTracking.clear();
    
    console.log(`🗑️ Cleared ${previousCount} pod restart tracking entries via API`);
    
    res.json({
      success: true,
      message: `Cleared ${previousCount} pod restart tracking entries`,
      data: {
        clearedEntries: previousCount
      }
    });
  } catch (error) {
    console.error('Clear restart tracking error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// TEST restart alert (manually trigger for testing)
app.post('/api/kubernetes/restart-alerts/test', async (req, res) => {
  try {
    const { namespace, podName, emailGroupId } = req.body;
    const monitoringService = require('./services/kubernetesMonitoringService');
    
    if (!namespace || !podName) {
      return res.status(400).json({
        success: false,
        error: 'namespace and podName are required'
      });
    }
    
    // Create a mock pod for testing
    const mockPod = {
      name: podName,
      namespace: namespace,
      status: 'Running',
      ready: true,
      restarts: 5,
      node: 'test-node'
    };
    
    // Send test restart alert
    await monitoringService.sendPodRestartEmail(mockPod, 1, emailGroupId);
    
    console.log(`📧 Test restart alert sent for ${namespace}/${podName}`);
    
    res.json({
      success: true,
      message: `Test restart alert sent for ${namespace}/${podName}`,
      data: {
        pod: mockPod,
        emailGroupId
      }
    });
  } catch (error) {
    console.error('Test restart alert error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Route not found' 
  });
});

setTimeout(async () => {
  try {
    const kubeConfig = kubernetesConfigService.getConfig();
    
    if (kubeConfig.isConfigured) {
      console.log('🚀 Initializing Kubernetes pod snapshot...');
      
      // Get all current pods WITH CONTAINER INFO
      let pods = [];
      try {
        // Use the method that includes container details
        pods = await kubernetesService.getAllPodsWithContainers();
      } catch (error) {
        console.log('⚠️ Failed to get pods with containers, trying basic method...');
        pods = await kubernetesService.getAllPods();
      }
      
      console.log(`📊 Found ${pods.length} total pods in cluster`);
      
      // Take initial snapshot (will exclude unready pods)
      const snapshot = await podLifecycleService.takeInitialSnapshot(pods);
      
      console.log('✅ Pod snapshot initialized successfully');
      console.log(`📸 Snapshot contains ${snapshot.pods.length} fully ready pods`);
      console.log(`⚠️ Excluded ${snapshot.excludedUnreadyPods} pods with unready containers`);
      
    } else {
      console.log('⚠️ Kubernetes not configured - skipping pod snapshot');
    }
  } catch (error) {
    console.error('❌ Failed to initialize pod snapshot:', error);
  }
}, 5000);

setTimeout(() => {
  console.log('🌐 Auto-starting URL monitoring...');
  const started = urlMonitoringService.startAllMonitoring();
  console.log(`✅ Started monitoring ${started} URLs`);
}, 3000);

setTimeout(() => {
  const kubernetesConfig = kubernetesConfigService.getConfig();
  if (kubernetesConfig.isConfigured && kubernetesConfig.emailGroupId) {
    console.log('🔍 Starting pod recovery notifier...');
    podRecoveryNotifier.startWatching();
    console.log('✅ Pod recovery notifier started - watching last-known-pods.json');
  } else {
    console.log('⚠️ Pod recovery notifier not started - Kubernetes not configured or no email group set');
  }
}, 5000);

setTimeout(async () => {
  const config = kubernetesConfigService.getConfig();
  if (config.isConfigured && config.thresholds?.monitoringEnabled) {
    console.log('🚀 Auto-starting Kubernetes monitoring...');
    const monitoringService = require('./services/kubernetesMonitoringService');
    monitoringService.startMonitoring();
  }
}, 5000)
// Auto-start monitoring if database is configured
setTimeout(() => {
  const config = dbConfigService.getConfig();
  if (config.isConfigured) {
    console.log('🚀 Auto-starting database monitoring...');
    const started = monitoringService.startMonitoring();
    if (started) {
      console.log('✅ Database monitoring started automatically');
    } else {
      console.log('❌ Failed to auto-start monitoring');
    }
  } else {
    console.log('⚠️ Database not configured - monitoring not started');
  }
}, 2000); // Wait 2 seconds for services to initialize



setInterval(async () => {
  try {
    await podRecoveryNotifier.checkAndNotifyRecovery();
  } catch (error) {
    console.error('Error in automatic pod recovery check:', error);
  }
}, 60000); // Check every 60 seconds


setTimeout(() => {
  const config = systemHeartbeatService.getConfig();
  if (config.enabled) {
    console.log('💓 Auto-starting system heartbeat service...');
    const started = systemHeartbeatService.startMonitoring();
    if (started) {
      console.log('✅ System heartbeat started automatically');
    } else {
      console.log('❌ Failed to auto-start system heartbeat');
    }
  } else {
    console.log('💓 System heartbeat disabled in configuration');
  }
}, 6000);



app.listen(PORT, () => {
  console.log(`🚀 UPTIME WATCHDOG by Tsunami Solutions running on http://localhost:${PORT}`);
  console.log(`📊 Real Oracle database monitoring enabled`);
  console.log(`👤 User count: ${userService.getUserCount()}`);
  console.log(`🔗 Database configured: ${dbConfigService.getConfig().isConfigured}`);
  console.log('✅ Oracle Monitor Backend with Real DB Connection Started!');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await realOracleService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await realOracleService.disconnect();
  process.exit(0);
});