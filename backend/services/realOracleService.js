const oracledb = require('oracledb');
const dbConfigService = require('./dbConfigService');

class RealOracleService {
  constructor() {
    this.connection = null;
    this.lastConnectionTime = null;
    this.connectionStatus = 'disconnected';
    this.lastError = null;
    this.cachedData = {
      version: null,
      instanceInfo: null,
      sessions: null,
      tablespaces: null,
      lastUpdate: null
    };
  }

  async getConnectionConfig() {
    const config = dbConfigService.getConfig();
    
    if (!config.isConfigured) {
      throw new Error('Database not configured. Please configure connection details first.');
    }

    return {
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.serviceName}`
    };
  }

  async connect() {
    try {
      const config = await this.getConnectionConfig();
      console.log(`🔌 Attempting to connect to Oracle: ${config.connectString}`);
      
      this.connection = await oracledb.getConnection(config);
      this.connectionStatus = 'connected';
      this.lastConnectionTime = new Date();
      this.lastError = null;
      
      console.log('✅ Oracle connection established successfully');
      return true;
    } catch (error) {
      this.connectionStatus = 'error';
      this.lastError = error.message;
      console.error('❌ Oracle connection failed:', error.message);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
        this.connectionStatus = 'disconnected';
        console.log('🔌 Oracle connection closed');
      }
    } catch (error) {
      console.error('Error closing Oracle connection:', error);
    }
  }

  async testConnection(connectionDetails = null) {
    let testConfig;
    
    if (connectionDetails) {
      testConfig = {
        user: connectionDetails.username,
        password: connectionDetails.password,
        connectString: `${connectionDetails.host}:${connectionDetails.port}/${connectionDetails.serviceName}`
      };
    } else {
      testConfig = await this.getConnectionConfig();
    }

    let testConnection = null;
    try {
      console.log(`🧪 Testing Oracle connection: ${testConfig.connectString}`);
      const startTime = Date.now();
      testConnection = await oracledb.getConnection(testConfig);
      
      const result = await testConnection.execute('SELECT 1 FROM DUAL');
      const responseTime = Date.now() - startTime;
      
      await testConnection.close();
      console.log('✅ Oracle connection test successful');
      
      return {
        success: true,
        message: 'Connection successful!',
        responseTime: `${responseTime}ms`
      };
    } catch (error) {
      if (testConnection) {
        try { await testConnection.close(); } catch (e) {}
      }
      
      console.error('❌ Oracle connection test failed:', error.message);
      return {
        success: false,
        message: error.message,
        error: error.code || 'CONNECTION_ERROR'
      };
    }
  }

  async checkConnection() {
  try {
    if (!this.connection) {
      const connected = await this.connect();
      if (!connected) return { isConnected: false, error: 'Failed to connect' };
    }
    
    const startTime = Date.now();
    
    // Much shorter timeout - 10 seconds max
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database timeout after 10 seconds')), 10000);
    });
    
    const queryPromise = this.connection.execute('SELECT 1 FROM DUAL');
    
    try {
      const result = await Promise.race([queryPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;
      
      // If response time is over 10 seconds, consider it slow
      if (responseTime > 10000) {
        console.log(`⚠️ Slow database response: ${responseTime}ms`);
      }
      
      this.connectionStatus = 'connected';
      this.lastConnectionTime = new Date();
      this.lastError = null;
      
      return {
        isConnected: result.rows.length > 0,
        responseTime: `${responseTime}ms`
      };
    } catch (timeoutError) {
      throw new Error(`Database is too slow (>10s) or unresponsive: ${timeoutError.message}`);
    }
  } catch (error) {
    console.error('❌ Connection check failed:', error.message);
    this.connectionStatus = 'error';
    this.lastError = error.message;
    
    // Don't close connection on timeout, might recover
    if (!error.message.includes('timeout')) {
      this.connection = null;
    }
    
    return {
      isConnected: false,
      responseTime: 'N/A',
      error: error.message
    };
  }
}

  async getDatabaseVersion() {
    try {
      if (!await this.checkConnection()) {
        throw new Error('Database connection not available');
      }

      // Updated query without VERSION_FULL column
      const query = `
        SELECT 
          banner as version
        FROM v$version 
        WHERE banner LIKE 'Oracle%'
        AND ROWNUM = 1
      `;
      
      const result = await this.connection.execute(query);
      
      if (result.rows.length > 0) {
        const versionString = result.rows[0][0];
        return {
          version: versionString,
          versionFull: versionString  // Use the same value for both
        };
      }
      
      return { version: 'Unknown', versionFull: 'Unknown' };
    } catch (error) {
      console.error('Failed to get database version:', error);
      return { version: 'Error getting version', versionFull: error.message };
    }
  }

  async getInstanceInfo() {
    try {
      if (!await this.checkConnection()) {
        throw new Error('Database connection not available');
      }

      const query = `
        SELECT 
          instance_name,
          host_name,
          startup_time,
          status,
          database_status,
          ROUND((SYSDATE - startup_time) * 24, 2) as uptime_hours,
          ROUND((SYSDATE - startup_time), 2) as uptime_days
        FROM v$instance
      `;
      
      const result = await this.connection.execute(query);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          instanceName: row[0],
          hostName: row[1],
          startupTime: row[2],
          status: row[3],
          databaseStatus: row[4],
          uptimeHours: row[5],
          uptimeDays: row[6],
          uptimeFormatted: this.formatUptime(row[6])
        };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get instance info:', error);
      throw error;
    }
  }

  async getSessionInfo() {
    try {
      if (!await this.checkConnection()) {
        throw new Error('Database connection not available');
      }

      const query = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_sessions,
          COUNT(CASE WHEN status = 'INACTIVE' THEN 1 END) as inactive_sessions,
          COUNT(CASE WHEN type = 'USER' THEN 1 END) as user_sessions,
          COUNT(CASE WHEN type = 'BACKGROUND' THEN 1 END) as background_sessions
        FROM v$session
      `;
      
      const result = await this.connection.execute(query);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          totalSessions: row[0],
          activeSessions: row[1],
          inactiveSessions: row[2],
          userSessions: row[3],
          backgroundSessions: row[4]
        };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get session info:', error);
      throw error;
    }
  }

  // Update the getTablespaceInfo function in backend/services/realOracleService.js with detailed logging:

async getTablespaceInfo() {
  try {
    console.log('🔍 Starting getTablespaceInfo...');
    
    // Check connection first
    const connectionCheck = await this.checkConnection();
    console.log('📊 Connection check result:', connectionCheck);
    
    if (!connectionCheck || !connectionCheck.isConnected) {
      console.error('❌ No database connection available');
      throw new Error('Database connection not available');
    }

    const query = `
      SELECT 
        df.tablespace_name,
        ROUND(df.bytes / 1024 / 1024, 2) as total_mb,
        ROUND(NVL(fs.bytes, 0) / 1024 / 1024, 2) as free_mb,
        ROUND((df.bytes - NVL(fs.bytes, 0)) / 1024 / 1024, 2) as used_mb,
        ROUND(((df.bytes - NVL(fs.bytes, 0)) / df.bytes) * 100, 2) as usage_percent
      FROM (
        SELECT tablespace_name, SUM(bytes) bytes
        FROM dba_data_files
        GROUP BY tablespace_name
      ) df
      LEFT JOIN (
        SELECT tablespace_name, SUM(bytes) bytes
        FROM dba_free_space
        GROUP BY tablespace_name
      ) fs ON df.tablespace_name = fs.tablespace_name
      WHERE df.tablespace_name NOT LIKE '%TEMP%'
        AND df.tablespace_name NOT LIKE '%UNDO%'
      ORDER BY usage_percent DESC
    `;
    
    console.log('📝 Executing tablespace query...');
    const result = await this.connection.execute(query);
    console.log(`✅ Query executed, got ${result.rows.length} rows`);
    
    // Log first few rows for debugging
    if (result.rows.length > 0) {
      console.log('📊 Sample data (first 3 rows):');
      result.rows.slice(0, 3).forEach((row, index) => {
        console.log(`  Row ${index + 1}:`, row);
      });
    } else {
      console.log('⚠️ Query returned 0 rows - possible permission issue or no tablespaces found');
    }
    
    const mappedData = result.rows.map(row => ({
      name: row[0],
      totalMB: row[1],
      freeMB: row[2],
      usedMB: row[3],
      usagePercent: row[4],
      status: row[4] > 90 ? 'critical' : row[4] > 75 ? 'warning' : 'normal'
    }));
    
    console.log(`📊 Returning ${mappedData.length} tablespaces`);
    return mappedData;
    
  } catch (error) {
    console.error('❌ Failed to get tablespace info:');
    console.error('  Error Code:', error.errorNum);
    console.error('  Error Message:', error.message);
    console.error('  Full Error:', error);
    
    // Check for specific Oracle errors
    if (error.errorNum === 942) {
      console.error('  ⚠️ ORA-00942: Table or view does not exist');
      console.error('  📌 Solution: Grant SELECT privileges on DBA_DATA_FILES and DBA_FREE_SPACE');
      console.error('  📌 Run as SYSDBA: GRANT SELECT ON dba_data_files TO your_user;');
      console.error('  📌 Run as SYSDBA: GRANT SELECT ON dba_free_space TO your_user;');
    }
    
    // Try alternative query using USER views instead of DBA views
    if (error.errorNum === 942 || error.message.includes('ORA-00942')) {
      console.log('🔄 Attempting fallback query with USER_TABLESPACES...');
      try {
        const fallbackQuery = `
          SELECT 
            tablespace_name,
            0 as total_mb,
            0 as free_mb,
            0 as used_mb,
            0 as usage_percent
          FROM user_tablespaces
          ORDER BY tablespace_name
        `;
        
        const fallbackResult = await this.connection.execute(fallbackQuery);
        console.log(`⚠️ Fallback query returned ${fallbackResult.rows.length} tablespaces (limited data)`);
        
        return fallbackResult.rows.map(row => ({
          name: row[0],
          totalMB: 0,
          freeMB: 0,
          usedMB: 0,
          usagePercent: 0,
          status: 'unknown',
          note: 'Limited data - DBA privileges required'
        }));
      } catch (fallbackError) {
        console.error('❌ Fallback query also failed:', fallbackError.message);
      }
    }
    
    // Return empty array instead of throwing
    return [];
  }
}

  async getDatabaseSize() {
    try {
      if (!await this.checkConnection()) {
        throw new Error('Database connection not available');
      }

      const query = `
        SELECT 
          ROUND(SUM(bytes) / 1024 / 1024 / 1024, 2) as total_size_gb
        FROM dba_data_files
      `;
      
      const result = await this.connection.execute(query);
      
      if (result.rows.length > 0) {
        return {
          totalSizeGB: result.rows[0][0]
        };
      }
      
      return { totalSizeGB: 0 };
    } catch (error) {
      console.error('Failed to get database size:', error);
      throw error;
    }
  }

  async getRealtimeDashboardData() {
    try {
      console.log('📊 Fetching real-time dashboard data...');
      
      const [
        connectionCheck,
        versionInfo,
        instanceInfo,
        sessionInfo,
        tablespaceInfo,
        sizeInfo
      ] = await Promise.allSettled([
        this.checkConnection(),
        this.getDatabaseVersion(),
        this.getInstanceInfo(),
        this.getSessionInfo(),
        this.getTablespaceInfo(),
        this.getDatabaseSize()
      ]);

      const dashboardData = {
        timestamp: new Date(),
        connection: {
          status: connectionCheck.status === 'fulfilled' && connectionCheck.value.isConnected ? 'UP' : 'DOWN',
          responseTime: connectionCheck.status === 'fulfilled' ? connectionCheck.value.responseTime : 'N/A',
          error: connectionCheck.status === 'rejected' ? connectionCheck.reason.message : null
        },
        version: versionInfo.status === 'fulfilled' ? versionInfo.value : { version: 'Unknown', versionFull: 'Unknown' },
        instance: instanceInfo.status === 'fulfilled' ? instanceInfo.value : null,
        sessions: sessionInfo.status === 'fulfilled' ? sessionInfo.value : null,
        tablespaces: tablespaceInfo.status === 'fulfilled' ? tablespaceInfo.value : [],
        size: sizeInfo.status === 'fulfilled' ? sizeInfo.value : { totalSizeGB: 0 }
      };

      // Cache the data
      this.cachedData = { ...dashboardData, lastUpdate: new Date() };
      
      console.log('✅ Real-time dashboard data fetched successfully');
      return dashboardData;
    } catch (error) {
      console.error('❌ Failed to get dashboard data:', error);
      throw error;
    }
  }

  formatUptime(days) {
    const totalDays = Math.floor(days);
    const hours = Math.floor((days - totalDays) * 24);
    const minutes = Math.floor(((days - totalDays) * 24 - hours) * 60);
    
    if (totalDays > 0) {
      return `${totalDays}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  getConnectionStatus() {
    const config = dbConfigService.getPublicConfig();
    
    return {
      status: this.connectionStatus,
      lastConnectionTime: this.lastConnectionTime,
      lastError: this.lastError,
      isConfigured: config.isConfigured,
      connectionString: config.isConfigured ? 
        `${config.host}:${config.port}/${config.serviceName}` : 
        'Not configured',
      cachedDataAge: this.cachedData.lastUpdate ? 
        Math.floor((new Date() - this.cachedData.lastUpdate) / 1000) : null
    };
  }

  getCachedData() {
    return this.cachedData;
  }
}

module.exports = new RealOracleService();