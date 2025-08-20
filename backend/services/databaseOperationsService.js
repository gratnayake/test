// backend/services/databaseOperationsService.js - FIXED VERSION
require('dotenv').config();
const oracledb = require('oracledb');
const dbConfigService = require('./dbConfigService');

class DatabaseOperationsService {
  constructor() {
    console.log('🔧 Database Operations Service initialized - Oracle XE Optimized');
  }

  // FIXED: Replace the getConnectionConfig method in your DatabaseOperationsService.js

getConnectionConfig(useRootContainer = false) {
  const dbConfig = dbConfigService.getConfig();
  
  if (!dbConfig.isConfigured) {
    throw new Error('Database not configured. Please configure database connection first.');
  }

  if (!process.env.DB_RESTART_USERNAME || !process.env.DB_RESTART_PASSWORD) {
    throw new Error('SYS credentials not configured in environment variables');
  }

  let serviceName;
  
  if (useRootContainer) {
    // ENHANCED: Better detection for different Oracle setups
    if (dbConfig.serviceName === 'XEPDB1') {
      serviceName = 'XE';  // Oracle XE
    } else if (dbConfig.serviceName.match(/^.*PDB\d*$/i)) {
      // Extract root from any PDB name (ORCLPDB1 -> ORCL, PRODPDB1 -> PROD)
      serviceName = dbConfig.serviceName.replace(/PDB\d*$/i, '');
    } else if (dbConfig.serviceName.includes('PDB')) {
      // Generic PDB detection
      serviceName = dbConfig.serviceName.split('PDB')[0];
    } else {
      // Non-CDB database or already root container name
      serviceName = dbConfig.serviceName;
    }
    
    console.log(`🔗 Root container detected: ${dbConfig.serviceName} -> ${serviceName}`);
  } else {
    serviceName = dbConfig.serviceName;
  }

  return {
    user: process.env.DB_RESTART_USERNAME,
    password: process.env.DB_RESTART_PASSWORD,
    connectString: `${dbConfig.host}:${dbConfig.port}/${serviceName}`,
    privilege: oracledb.SYSDBA
  };
}

async generateStartupScript(sysUsername, sysPassword, dbConfig) {
  // Detect if this is a CDB/PDB setup
  const isPDB = dbConfig.serviceName && (
    dbConfig.serviceName.includes('PDB') || 
    dbConfig.serviceName !== 'ORCL' && dbConfig.serviceName !== 'XE'
  );
  
  let startupScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
STARTUP;`;

  if (isPDB) {
    // Add PDB commands for CDB/PDB setups
    if (dbConfig.serviceName === 'XEPDB1') {
      startupScript += `\nALTER PLUGGABLE DATABASE XEPDB1 OPEN;`;
    } else if (dbConfig.serviceName.includes('PDB')) {
      startupScript += `\nALTER PLUGGABLE DATABASE ${dbConfig.serviceName} OPEN;`;
    } else {
      // Try to open all PDBs if specific name unknown
      startupScript += `\nALTER PLUGGABLE DATABASE ALL OPEN;`;
    }
  }
  
  startupScript += `\nEXIT;`;
  
  return startupScript;
}

// 3. PLATFORM-AWARE COMMAND EXECUTION
async executeSqlplusScript(tempScriptPath) {
  const isWindows = process.platform === 'win32';
  
  let sqlplusCommand;
  if (isWindows) {
    // Windows: Use quotes around path
    sqlplusCommand = `sqlplus /nolog @"${tempScriptPath}"`;
  } else {
    // Linux/Unix: No quotes needed
    sqlplusCommand = `sqlplus /nolog @${tempScriptPath}`;
  }
  
  console.log(`🔧 Platform: ${process.platform}, Command: ${sqlplusCommand}`);
  
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  return await execAsync(sqlplusCommand, { 
    timeout: 90000,
    killSignal: 'SIGKILL'
  });
}

// 4. ENHANCED DATABASE TYPE DETECTION
async detectDatabaseType() {
  try {
    const sysUsername = process.env.DB_RESTART_USERNAME;
    const sysPassword = process.env.DB_RESTART_PASSWORD;
    
    const detectScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
SELECT 
  (SELECT CDB FROM v$database) as IS_CDB,
  (SELECT COUNT(*) FROM v$pdbs WHERE name != 'PDB$SEED') as PDB_COUNT
FROM dual;
EXIT;`;

    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    const detectCommand = `echo "${detectScript}" | sqlplus -S /nolog`;
    const { stdout } = await execAsync(detectCommand, { timeout: 15000 });
    
    const isCDB = stdout.includes('YES');
    const pdbMatch = stdout.match(/(\d+)/);
    const pdbCount = pdbMatch ? parseInt(pdbMatch[1]) : 0;
    
    return {
      isCDB: isCDB,
      pdbCount: pdbCount,
      type: isCDB ? 'CDB/PDB' : 'Non-CDB'
    };
    
  } catch (error) {
    return {
      isCDB: false,
      pdbCount: 0,
      type: 'Unknown',
      error: error.message
    };
  }
}

  async checkDatabaseStatus() {
    let connection;
    try {
      const connectionConfig = this.getConnectionConfig();
      connection = await oracledb.getConnection(connectionConfig);
      
      const result = await connection.execute('SELECT status FROM v$instance');
      const status = result.rows[0][0];
      
      return {
        isRunning: true,
        status: status,
        canConnect: true
      };
    } catch (error) {
      return {
        isRunning: false,
        status: 'DOWN',
        canConnect: false,
        error: error.message
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          // Expected during shutdown
        }
      }
    }
  }

  async killAllUserSessions() {
    let connection;
    try {
      console.log('🔧 Killing all user sessions...');
      
      const connectionConfig = this.getConnectionConfig();
      connection = await oracledb.getConnection(connectionConfig);
      
      // Get all active user sessions (excluding SYS and system sessions)
      const sessionsResult = await connection.execute(`
        SELECT sid, serial#, username, machine, program 
        FROM v$session 
        WHERE username IS NOT NULL 
        AND username NOT IN ('SYS', 'SYSTEM', 'SYSMAN', 'DBSNMP')
        AND status = 'ACTIVE'
      `);
      
      console.log(`📊 Found ${sessionsResult.rows.length} user sessions to kill`);
      
      let killedSessions = 0;
      
      // Kill each session
      for (const session of sessionsResult.rows) {
        const [sid, serial, username, machine, program] = session;
        try {
          await connection.execute(`ALTER SYSTEM KILL SESSION '${sid},${serial}' IMMEDIATE`);
          console.log(`✅ Killed session: ${username}@${machine} (${program})`);
          killedSessions++;
        } catch (killError) {
          console.log(`⚠️ Failed to kill session ${sid},${serial}: ${killError.message}`);
        }
      }
      
      return {
        success: true,
        sessionsFound: sessionsResult.rows.length,
        sessionsKilled: killedSessions,
        message: `Killed ${killedSessions} of ${sessionsResult.rows.length} user sessions`
      };
      
    } catch (error) {
      console.error('❌ Failed to kill user sessions:', error);
      return {
        success: false,
        error: error.message,
        sessionsFound: 0,
        sessionsKilled: 0
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.log('Connection closed');
        }
      }
    }
  }


// REPLACE your startup() method with this version that uses the same reliable approach:

// COMPLETE universal startup() method - REPLACE your entire startup method with this:

async startup() {
  try {
    console.log('🚀 Starting TRUE DATABASE STARTUP...');
    
    let startupSteps = [];
    
    // Step 1: Get credentials and config
    const sysUsername = process.env.DB_RESTART_USERNAME;
    const sysPassword = process.env.DB_RESTART_PASSWORD;
    const dbConfig = require('./dbConfigService').getConfig();

    if (!sysUsername || !sysPassword) {
      return {
        success: false,
        message: 'Missing SYS credentials',
        output: `Startup failed: Missing configuration\n\n❌ Required:\n- DB_RESTART_USERNAME in .env\n- DB_RESTART_PASSWORD in .env`,
        error: 'Missing credentials',
        action: 'startup',
        method: 'startup_config_error',
        timestamp: new Date()
      };
    }

    // Step 2: Setup execution environment
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    const fs = require('fs');
    const path = require('path');

    // Step 3: Check if database is already running
    console.log('🔍 Checking if database is already running...');
    try {
      const statusCheck = `echo "CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
SELECT 'DB_UP' FROM dual;
EXIT;" | sqlplus -S /nolog`;
      
      const { stdout } = await execAsync(statusCheck, { timeout: 10000 });
      
      if (stdout.includes('DB_UP') || stdout.includes('Connected')) {
        return {
          success: true,
          message: 'Database is already running',
          output: `Database Status: Already UP\nDatabase is already running normally.`,
          action: 'startup',
          method: 'already_running',
          verified: true,
          timestamp: new Date()
        };
      }
    } catch (statusError) {
      console.log('📋 Database appears to be down, proceeding with startup...');
    }

    // Step 4: Detect database type for universal support
    console.log('🔍 Detecting database type...');
    let dbType = { isCDB: false, pdbCount: 0, type: 'Unknown' };
    
    try {
      const detectScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
SELECT 
  (SELECT CDB FROM v$database) as IS_CDB,
  (SELECT COUNT(*) FROM v$pdbs WHERE name != 'PDB$SEED') as PDB_COUNT
FROM dual;
EXIT;`;

      const detectCommand = `echo "${detectScript}" | sqlplus -S /nolog`;
      const { stdout: detectOutput } = await execAsync(detectCommand, { timeout: 15000 });
      
      const isCDB = detectOutput.includes('YES');
      const pdbMatch = detectOutput.match(/(\d+)/);
      const pdbCount = pdbMatch ? parseInt(pdbMatch[1]) : 0;
      
      dbType = {
        isCDB: isCDB,
        pdbCount: pdbCount,
        type: isCDB ? 'CDB/PDB' : 'Non-CDB'
      };
      
      startupSteps.push(`✅ Database type detected: ${dbType.type}`);
      console.log(`🔍 Database type: ${dbType.type}, PDB count: ${dbType.pdbCount}`);
      
    } catch (detectError) {
      startupSteps.push('⚠️ Could not detect database type, using default logic');
      console.log('⚠️ Database type detection failed, proceeding with default logic');
    }

    // Step 5: Generate appropriate startup script based on database type
    console.log('📝 Generating startup script...');
    const needsQuoting = /[^a-zA-Z0-9_]/.test(sysPassword);
    let connectCommand;

    if (needsQuoting) {
      // Password has special characters - use quotes
      connectCommand = `CONNECT ${sysUsername}/"${sysPassword}" AS SYSDBA`;
      console.log('📝 Using quoted password (contains special characters)');
    } else {
      // Simple password
      connectCommand = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA`;
      console.log('📝 Using standard password format');
    }

    // Build the startup script
    let startupScript = `${connectCommand}
    STARTUP;`;
    

    // Add PDB commands based on database type and configuration
    if (dbType.isCDB || dbConfig.serviceName.includes('PDB')) {
      if (dbConfig.serviceName === 'XEPDB1') {
        startupScript += `\nALTER PLUGGABLE DATABASE XEPDB1 OPEN;`;
        startupSteps.push('📝 Added XEPDB1 open command');
      } else if (dbConfig.serviceName && dbConfig.serviceName.includes('PDB')) {
        startupScript += `\nALTER PLUGGABLE DATABASE ${dbConfig.serviceName} OPEN;`;
        startupSteps.push(`📝 Added ${dbConfig.serviceName} open command`);
      } else if (dbType.pdbCount > 0) {
        startupScript += `\nALTER PLUGGABLE DATABASE ALL OPEN;`;
        startupSteps.push('📝 Added open all PDBs command');
      }
    } else {
      startupSteps.push('📝 Non-CDB database - no PDB commands needed');
    }

    startupScript += `\nEXIT;`;

    console.log('📝 Generated startup script:');
    console.log('---START SCRIPT---');
    console.log(startupScript.replace(sysPassword, '***HIDDEN***'));
    console.log('---END SCRIPT---');
    // Step 6: Execute startup using script file method
    console.log('🚀 Executing STARTUP using script file method...');
    
    try {
      // Create temp directory and script file
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempScriptPath = path.join(tempDir, 'startup.sql');
      
      // Write startup script to file
      fs.writeFileSync(tempScriptPath, startupScript);
      startupSteps.push('✅ Created startup script file');

      console.log('🔧 Executing sqlplus with startup script...');
      startupSteps.push('📝 Executing STARTUP via script file');

      // Platform-aware command execution
      const isWindows = process.platform === 'win32';
      let sqlplusCommand;
      
      if (isWindows) {
        sqlplusCommand = `sqlplus /nolog @"${tempScriptPath}"`;
      } else {
        sqlplusCommand = `sqlplus /nolog @${tempScriptPath}`;
      }
      
      console.log(`🔧 Platform: ${process.platform}, Command: ${sqlplusCommand}`);
      
      const { stdout, stderr } = await execAsync(sqlplusCommand, { 
        timeout: 90000, // 90 seconds for startup
        killSignal: 'SIGKILL'
      });

      // Clean up temp file
      try {
        fs.unlinkSync(tempScriptPath);
        startupSteps.push('✅ Cleaned up script file');
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      console.log('📝 STARTUP command output:', stdout);
      startupSteps.push('✅ STARTUP command executed');

      // Parse the output for different Oracle responses
      const outputLines = stdout.split('\n');
      let foundConnection = false;
      let foundStartup = false;
      let foundMount = false;
      let foundOpen = false;
      let foundPDBOpen = false;

      for (const line of outputLines) {
        const cleanLine = line.trim();
        
        if (cleanLine.includes('Connected to:') || cleanLine.includes('Connected.')) {
          startupSteps.push('✅ Connected to Oracle successfully');
          foundConnection = true;
        }
        
        if (cleanLine.includes('ORACLE instance started')) {
          startupSteps.push('✅ Oracle instance started');
          foundStartup = true;
        }
        
        if (cleanLine.includes('Database mounted')) {
          startupSteps.push('✅ Database mounted');
          foundMount = true;
        }
        
        if (cleanLine.includes('Database opened')) {
          startupSteps.push('✅ Database opened');
          foundOpen = true;
        }
        
        if (cleanLine.includes('Pluggable database altered') || cleanLine.includes('opened')) {
          startupSteps.push(`✅ Pluggable database opened`);
          foundPDBOpen = true;
        }
        
        // Handle specific Oracle errors
        if (cleanLine.includes('ORA-01005')) {
          return {
            success: false,
            message: 'Authentication failed',
            output: `Startup failed: Invalid SYS password\n\nCheck .env file: DB_RESTART_PASSWORD`,
            error: 'Authentication failed',
            action: 'startup',
            method: 'startup_auth_error',
            timestamp: new Date()
          };
        }
        
        if (cleanLine.includes('ORA-01081')) {
          startupSteps.push('ℹ️ Database was already started');
          foundStartup = true;
        }
        
        if (cleanLine.includes('ORA-65019')) {
          startupSteps.push('ℹ️ Pluggable database was already open');
          foundPDBOpen = true;
        }
      }

      // Provide feedback on what was accomplished
      if (!foundConnection) {
        startupSteps.push('⚠️ No connection confirmation found');
      }
      
      if (!foundStartup && !stdout.includes('ORA-01081')) {
        startupSteps.push('⚠️ No instance startup confirmation found');
      }

      // Step 7: Wait for startup to complete
      console.log('⏳ Waiting for startup to complete...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      startupSteps.push('✅ Waited for startup completion');

      // Step 8: Verify startup by attempting connection
      console.log('🔍 Verifying startup by testing connection...');
      
      try {
        const verifyScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
SELECT 'DB_UP' FROM dual;
EXIT;`;
        
        const verifyCommand = `echo "${verifyScript}" | sqlplus -S /nolog`;
        const { stdout: verifyOutput } = await execAsync(verifyCommand, { timeout: 15000 });
        
        console.log('🔍 Verify output:', verifyOutput);
        
        if (verifyOutput.includes('DB_UP') || verifyOutput.includes('Connected')) {
          // Database is up and responding
          startupSteps.push('✅ Database startup verified - connection successful');
          
          return {
            success: true,
            message: 'Database startup completed successfully',
            output: `TRUE STARTUP Results:\n\n${startupSteps.join('\n')}\n\nDatabase Type: ${dbType.type}\nFinal Status: UP\n\n✅ STARTUP COMPLETE: Oracle instance started and is accessible`,
            action: 'startup',
            method: 'startup_success',
            verified: true,
            dbType: dbType.type,
            timestamp: new Date()
          };
        } else {
          // Database not responding properly
          startupSteps.push('⚠️ Database not responding to verification');
          
          return {
            success: false,
            message: 'Startup commands executed but database not responding',
            output: `Startup Attempt:\n\n${startupSteps.join('\n')}\n\nDatabase Type: ${dbType.type}\nVerification: Database not responding properly\n\nTry manual verification:\nsqlplus sys/password as sysdba\nSELECT status FROM v$instance;`,
            action: 'startup',
            method: 'startup_verification_failed',
            verified: false,
            dbType: dbType.type,
            timestamp: new Date()
          };
        }
        
      } catch (verifyError) {
        // Verification failed - database might still be starting
        startupSteps.push('⚠️ Verification failed - database may still be initializing');
        
        return {
          success: true, // Commands executed successfully
          message: 'Startup commands executed successfully',
          output: `TRUE STARTUP Results:\n\n${startupSteps.join('\n')}\n\nDatabase Type: ${dbType.type}\n\n✅ STARTUP COMMANDS COMPLETED\n\n📝 Note: Verification failed but startup commands executed successfully. Database may still be initializing.`,
          action: 'startup',
          method: 'startup_commands_success',
          verified: false,
          dbType: dbType.type,
          timestamp: new Date()
        };
      }

    } catch (execError) {
      startupSteps.push(`❌ Startup execution error: ${execError.message}`);
      
      return {
        success: false,
        message: 'STARTUP execution failed',
        output: `Startup Failed:\n\n${startupSteps.join('\n')}\n\nError: ${execError.message}\n\nTry manual startup:\nsqlplus sys/password as sysdba\nSTARTUP;\nALTER PLUGGABLE DATABASE ${dbConfig.serviceName || 'ALL'} OPEN;`,
        error: execError.message,
        action: 'startup',
        method: 'startup_execution_failed',
        timestamp: new Date()
      };
    }

  } catch (error) {
    console.error('❌ STARTUP process failed:', error);
    
    return {
      success: false,
      message: `STARTUP failed: ${error.message}`,
      output: `Process failed: ${error.message}`,
      error: error.message,
      action: 'startup',
      method: 'startup_error',
      timestamp: new Date()
    };
  }
}


// COMPLETE shutdownImmediate() method - REPLACE your entire method with this:

// REPLACE your shutdownImmediate() method with this version that matches what worked manually:

async shutdownImmediate() {
  try {
    console.log('🛑 Starting TRUE SHUTDOWN IMMEDIATE...');
    
    let shutdownSteps = [];
    
    // Step 1: Get credentials
    const sysUsername = process.env.DB_RESTART_USERNAME;
    const sysPassword = process.env.DB_RESTART_PASSWORD;

    if (!sysUsername || !sysPassword) {
      return {
        success: false,
        message: 'Missing SYS credentials',
        output: `Shutdown failed: Missing configuration\n\n❌ Required:\n- DB_RESTART_USERNAME in .env\n- DB_RESTART_PASSWORD in .env`,
        error: 'Missing credentials',
        action: 'shutdown',
        method: 'shutdown_config_error',
        timestamp: new Date()
      };
    }

    // Step 2: Kill user sessions first
    console.log('👥 Killing user sessions before shutdown...');
    try {
      const sessionKillResult = await this.killAllUserSessions();
      shutdownSteps.push(`✅ Sessions killed: ${sessionKillResult.sessionsKilled}/${sessionKillResult.sessionsFound}`);
    } catch (sessionError) {
      shutdownSteps.push(`⚠️ Session cleanup: ${sessionError.message}`);
    }

    // Step 3: Use the exact method that worked manually
    console.log('🛑 Executing SHUTDOWN IMMEDIATE using working method...');
    
    const { exec } = require('child_process');
    const util = require('util');
    const fs = require('fs');
    const path = require('path');
    const execAsync = util.promisify(exec);

    try {
      // Create a temporary SQL file (more reliable than echo)
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempScriptPath = path.join(tempDir, 'shutdown.sql');
      
      // Create the exact script that works manually
      const shutdownScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
SHUTDOWN IMMEDIATE;
EXIT;`;

      fs.writeFileSync(tempScriptPath, shutdownScript);
      shutdownSteps.push('✅ Created shutdown script file');

      console.log('🔧 Executing sqlplus with script file...');
      shutdownSteps.push('📝 Executing SHUTDOWN IMMEDIATE via script file');

      // Use the working method: sqlplus with script file
      const sqlplusCommand = `sqlplus /nolog @"${tempScriptPath}"`;
      
      console.log(`🔧 Running command: ${sqlplusCommand}`);
      
      const { stdout, stderr } = await execAsync(sqlplusCommand, { 
        timeout: 60000,
        killSignal: 'SIGKILL'
      });

      // Clean up temp file
      try {
        fs.unlinkSync(tempScriptPath);
        shutdownSteps.push('✅ Cleaned up script file');
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      console.log('📝 SHUTDOWN command output:', stdout);
      shutdownSteps.push('✅ SHUTDOWN IMMEDIATE command executed');

      // Parse the output (like your manual result)
      if (stdout.includes('Database closed')) {
        shutdownSteps.push('✅ Database closed');
      }
      if (stdout.includes('Database dismounted')) {
        shutdownSteps.push('✅ Database dismounted');
      }
      if (stdout.includes('ORACLE instance shut down')) {
        shutdownSteps.push('✅ Oracle instance shut down');
      }
      if (stdout.includes('Connected to:') || stdout.includes('Connected.')) {
        shutdownSteps.push('✅ Connected to Oracle successfully');
      }
      
      // Check for errors
      if (stdout.includes('ORA-01005')) {
        return {
          success: false,
          message: 'Authentication failed',
          output: `Shutdown failed: Invalid SYS password\n\nCheck .env file: DB_RESTART_PASSWORD`,
          error: 'Authentication failed',
          action: 'shutdown',
          method: 'shutdown_auth_error',
          timestamp: new Date()
        };
      }

      // Step 4: Wait for shutdown
      console.log('⏳ Waiting for shutdown to complete...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      shutdownSteps.push('✅ Waited for shutdown completion');

      // Step 5: Simple verification - try to connect
      console.log('🔍 Verifying shutdown by attempting connection...');
      
      try {
        // Try to connect - if this fails, database is down
        const verifyScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
SELECT 'DB_UP' FROM dual;
EXIT;`;
        
        const verifyCommand = `echo "${verifyScript}" | sqlplus -S /nolog`;
        const { stdout: verifyOutput } = await execAsync(verifyCommand, { timeout: 10000 });
        
        console.log('🔍 Verify output:', verifyOutput);
        
        if (verifyOutput.includes('DB_UP') || verifyOutput.includes('Connected')) {
          // Database is still up
          shutdownSteps.push('⚠️ Database still appears to be running');
          
          return {
            success: false,
            message: 'Shutdown command executed but database still running',
            output: `Shutdown Attempt:\n\n${shutdownSteps.join('\n')}\n\nVerification: Database still responds to connections\n\n⚠️ Possible issues:\n1. Oracle service auto-restart enabled\n2. Multiple Oracle instances\n3. Shutdown command failed silently\n\nFull output:\n${stdout}`,
            action: 'shutdown',
            method: 'shutdown_verification_failed',
            verified: false,
            timestamp: new Date()
          };
        } else {
          // Connection failed - database is down
          shutdownSteps.push('✅ Database shutdown verified - cannot connect');
          
          return {
            success: true,
            message: 'Database shutdown completed successfully',
            output: `TRUE SHUTDOWN IMMEDIATE Results:\n\n${shutdownSteps.join('\n')}\n\n✅ SHUTDOWN COMPLETE: Oracle instance shut down successfully`,
            action: 'shutdown',
            method: 'shutdown_immediate_success',
            verified: true,
            timestamp: new Date()
          };
        }
        
      } catch (verifyError) {
        // Verification command failed - database is likely down
        shutdownSteps.push('✅ Database shutdown verified - connection failed');
        
        return {
          success: true,
          message: 'Database shutdown completed successfully',
          output: `TRUE SHUTDOWN IMMEDIATE Results:\n\n${shutdownSteps.join('\n')}\n\n✅ SHUTDOWN COMPLETE: Oracle instance shut down successfully`,
          action: 'shutdown',
          method: 'shutdown_immediate_success',
          verified: true,
          timestamp: new Date()
        };
      }

    } catch (execError) {
      shutdownSteps.push(`❌ Shutdown execution error: ${execError.message}`);
      
      return {
        success: false,
        message: 'SHUTDOWN IMMEDIATE execution failed',
        output: `Shutdown Failed:\n\n${shutdownSteps.join('\n')}\n\nError: ${execError.message}\n\nTry manual shutdown:\nsqlplus sys/password as sysdba\nSHUTDOWN IMMEDIATE;`,
        error: execError.message,
        action: 'shutdown',
        method: 'shutdown_execution_failed',
        timestamp: new Date()
      };
    }

  } catch (error) {
    console.error('❌ SHUTDOWN process failed:', error);
    
    return {
      success: false,
      message: `SHUTDOWN failed: ${error.message}`,
      output: `Process failed: ${error.message}`,
      error: error.message,
      action: 'shutdown',
      method: 'shutdown_error',
      timestamp: new Date()
    };
  }
}

// ALSO ADD this local verification method to your class:


async checkDatabaseStatusLocal() {
  try {
    const sysUsername = process.env.DB_RESTART_USERNAME;
    const sysPassword = process.env.DB_RESTART_PASSWORD;

    if (!sysUsername || !sysPassword) {
      throw new Error('Missing SYS credentials for local check');
    }

    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    // Use local connection to check status
    const statusScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
SELECT status FROM v$instance;
EXIT;`;

    const sqlplusCommand = `echo "${statusScript}" | sqlplus -S /nolog`;
    
    console.log('🔍 Executing local status check...');
    const { stdout, stderr } = await execAsync(sqlplusCommand, { timeout: 15000 });

    console.log('🔍 Raw stdout:', JSON.stringify(stdout));
    console.log('🔍 Raw stderr:', JSON.stringify(stderr));
    
    // More detailed parsing with debugging
    const lines = stdout.split('\n').map(line => line.trim()).filter(line => line);
    console.log('🔍 Parsed lines:', lines);

    let foundStatus = null;
    let foundError = null;

    for (const line of lines) {
      console.log(`🔍 Checking line: "${line}"`);
      
      if (line.includes('OPEN') && !line.includes('ORA-')) {
        foundStatus = 'OPEN';
        console.log('✅ Found OPEN status');
      } else if (line.includes('MOUNTED') && !line.includes('ORA-')) {
        foundStatus = 'MOUNTED';
        console.log('✅ Found MOUNTED status');
      } else if (line.includes('STARTED') && !line.includes('ORA-')) {
        foundStatus = 'STARTED';  
        console.log('✅ Found STARTED status');
      } else if (line.includes('ORA-01034')) {
        foundError = 'ORA-01034';
        console.log('✅ Found ORA-01034 (database not available)');
      } else if (line.includes('ORA-01012')) {
        foundError = 'ORA-01012';
        console.log('✅ Found ORA-01012 (not logged on)');
      } else if (line.includes('not available')) {
        foundError = 'not available';
        console.log('✅ Found "not available" message');
      }
    }

    console.log(`🔍 Final parsing result - Status: ${foundStatus}, Error: ${foundError}`);

    // Determine result based on what we found
    if (foundError) {
      console.log('🔍 Database appears DOWN due to error');
      return {
        isRunning: false,
        status: 'DOWN',
        canConnect: false,
        foundError: foundError,
        rawOutput: stdout
      };
    } else if (foundStatus) {
      console.log(`🔍 Database appears UP with status: ${foundStatus}`);
      return {
        isRunning: true,
        status: foundStatus,
        canConnect: true,
        rawOutput: stdout
      };
    } else {
      console.log('🔍 Could not determine status from output');
      return {
        isRunning: false,
        status: 'UNKNOWN',
        canConnect: false,
        rawOutput: stdout,
        parsingIssue: true
      };
    }

  } catch (error) {
    console.log('🔍 Exception in local status check:', error.message);
    // If sqlplus command fails completely, database is likely down
    return {
      isRunning: false,
      status: 'DOWN',
      canConnect: false,
      error: error.message
    };
  }
}


  // Test connection
  async testConnection() {
    let connection;
    try {
      console.log('🧪 Testing SYS database connection...');
      
      const connectionConfig = this.getConnectionConfig();
      connection = await oracledb.getConnection(connectionConfig);
      
      const result = await connection.execute('SELECT instance_name, status FROM v$instance');
      
      console.log('✅ SYS connection test successful');
      return {
        success: true,
        message: 'SYS connection successful',
        instanceInfo: result.rows[0] ? {
          name: result.rows[0][0],
          status: result.rows[0][1]
        } : null
      };
    } catch (error) {
      console.error('❌ SYS connection test failed:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing test connection:', err);
        }
      }
    }
  }

  // Get database status
  async getStatus() {
    let connection;
    try {
      const connectionConfig = this.getConnectionConfig();
      connection = await oracledb.getConnection(connectionConfig);
      
      const instanceResult = await connection.execute(`
        SELECT instance_name, status, database_status, startup_time, version
        FROM v$instance
      `);

      const dbResult = await connection.execute(`
        SELECT name, open_mode, database_role FROM v$database
      `);

      const instance = instanceResult.rows[0];
      const database = dbResult.rows[0];

      return {
        success: true,
        status: {
          instance: {
            name: instance[0],
            status: instance[1],
            databaseStatus: instance[2],
            startupTime: instance[3],
            version: instance[4]
          },
          database: {
            name: database[0],
            openMode: database[1],
            role: database[2]
          },
          timestamp: new Date()
        }
      };

    } catch (error) {
      console.error('❌ Failed to get database status:', error);
      return {
        success: false,
        error: error.message,
        status: 'error'
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing status connection:', err);
        }
      }
    }
  }

  // Get configuration info
  getConfigInfo() {
    try {
      const dbConfig = dbConfigService.getConfig();
      
      return {
        host: dbConfig.host || 'Not configured',
        port: dbConfig.port || '1521',
        serviceName: dbConfig.serviceName || 'Not configured',
        sysUsername: process.env.DB_RESTART_USERNAME || 'Not configured',
        sysPasswordConfigured: !!process.env.DB_RESTART_PASSWORD,
        databaseConfigured: dbConfig.isConfigured,
        isConfigured: dbConfig.isConfigured && 
                      !!process.env.DB_RESTART_USERNAME && 
                      !!process.env.DB_RESTART_PASSWORD
      };
    } catch (error) {
      return {
        host: 'Error loading config',
        port: 'Error',
        serviceName: 'Error',
        sysUsername: 'Error',
        sysPasswordConfigured: false,
        databaseConfigured: false,
        isConfigured: false
      };
    }
  }

  // Validate configuration
  validateConfig() {
    try {
      const dbConfig = dbConfigService.getConfig();
      const missingItems = [];
      
      if (!dbConfig.isConfigured) {
        missingItems.push('Database connection not configured');
      }
      
      if (!process.env.DB_RESTART_USERNAME) {
        missingItems.push('DB_RESTART_USERNAME not set in .env');
      }
      
      if (!process.env.DB_RESTART_PASSWORD) {
        missingItems.push('DB_RESTART_PASSWORD not set in .env');
      }

      return {
        isValid: missingItems.length === 0,
        missingItems: missingItems,
        configInfo: this.getConfigInfo()
      };
    } catch (error) {
      return {
        isValid: false,
        missingItems: ['Error validating configuration'],
        configInfo: this.getConfigInfo()
      };
    }
  }
}

module.exports = new DatabaseOperationsService();