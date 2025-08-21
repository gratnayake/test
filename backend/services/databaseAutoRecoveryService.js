// backend/services/databaseAutoRecoveryService.js
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class DatabaseAutoRecoveryService {
  constructor() {
    this.isRecoveryInProgress = false;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 3;
    this.recoveryLog = [];
    this.configFile = path.join(__dirname, '../data/autoRecoveryConfig.json');
    
    // Load saved configuration
    this.loadConfig();
    
    console.log('🔧 Database Auto-Recovery Service initialized');
    console.log(`🔧 Auto-recovery status: ${this.isAutoRecoveryEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  // Load configuration from file
  loadConfig() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.configFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Load config file if it exists
      if (fs.existsSync(this.configFile)) {
        const configData = fs.readFileSync(this.configFile, 'utf8');
        const config = JSON.parse(configData);
        
        this.isAutoRecoveryEnabled = config.enabled || false;
        this.maxRecoveryAttempts = config.maxAttempts || 3;
        
        console.log('📋 Loaded auto-recovery config from file');
      } else {
        // Create default config
        this.isAutoRecoveryEnabled = false;
        this.saveConfig();
        console.log('📋 Created default auto-recovery config');
      }
    } catch (error) {
      console.error('❌ Error loading auto-recovery config:', error);
      this.isAutoRecoveryEnabled = false;
    }
  }

  // Save configuration to file
  saveConfig() {
    try {
      const config = {
        enabled: this.isAutoRecoveryEnabled,
        maxAttempts: this.maxRecoveryAttempts,
        waitAfterStop: 5000,
        waitAfterRestart: 10000,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      console.log('💾 Auto-recovery config saved to file');
    } catch (error) {
      console.error('❌ Error saving auto-recovery config:', error);
    }
  }

  // Get configuration (simplified)
  getConfig() {
    return {
      enabled: this.isAutoRecoveryEnabled,
      maxAttempts: this.maxRecoveryAttempts,
      waitAfterStop: 15000,  // Increased to 15 seconds for pods to fully stop
      waitAfterRestart: 20000 // Increased to 20 seconds for database to fully start
    };
  }

  // Enable or disable auto recovery
  setAutoRecoveryEnabled(enabled) {
    this.isAutoRecoveryEnabled = enabled;
    console.log(`🔄 Auto-recovery ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (!enabled) {
      this.recoveryAttempts = 0;
      this.isRecoveryInProgress = false;
    }
    
    // Save to file immediately
    this.saveConfig();
    
    return this.isAutoRecoveryEnabled;
  }

  // Get current auto recovery status
  getAutoRecoveryStatus() {
    const stopScript = this.findScriptByName('Stop Pods');
    const startScript = this.findScriptByName('Start Pods');
    
    return {
      enabled: this.isAutoRecoveryEnabled || false,
      inProgress: this.isRecoveryInProgress,
      attempts: this.recoveryAttempts,
      maxAttempts: this.maxRecoveryAttempts,
      log: this.recoveryLog.slice(-10), // Last 10 entries
      config: {
        stopScriptFound: !!stopScript,
        startScriptFound: !!startScript,
        stopScriptName: stopScript ? stopScript.name : 'Not Found',
        startScriptName: startScript ? startScript.name : 'Not Found'
      }
    };
  }

  // Main method called when database goes down
  /*async handleDatabaseDown() {
    const config = this.getConfig();
    
    console.log('🚨 === DATABASE AUTO-RECOVERY STARTED ===');
    console.log(`🔧 Auto-recovery enabled: ${config.enabled}`);
    console.log(`🔧 Current attempts: ${this.recoveryAttempts}/${config.maxAttempts}`);
    console.log(`🔧 Recovery in progress: ${this.isRecoveryInProgress}`);
    
    if (!config.enabled) {
      console.log('📋 Auto-recovery is disabled, skipping recovery');
      return false;
    }

    if (this.isRecoveryInProgress) {
      console.log('🔄 Recovery already in progress, skipping');
      return false;
    }

    if (this.recoveryAttempts >= config.maxAttempts) {
      console.log(`🚫 Maximum recovery attempts (${config.maxAttempts}) reached`);
      this.logRecovery('MAX_ATTEMPTS_REACHED', 'Maximum recovery attempts exceeded');
      return false;
    }

    console.log('🚨 Starting automatic database recovery...');
    this.isRecoveryInProgress = true;
    this.recoveryAttempts++;

    try {
      // Step 1: Run "Stop Pods" script
      console.log('📋 === STEP 1: STOP PODS ===');
      console.log('🔍 Looking for script named "Stop Pods"...');
      
      const stopResult = await this.runScriptByName('Stop Pods');
      console.log(`📋 Stop script result:`, stopResult);
      
      if (!stopResult.success) {
        const errorMsg = `Stop Pods script failed: ${stopResult.error}`;
        console.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      console.log('✅ Stop Pods script completed successfully');
      
      // Wait after stop
      console.log(`📋 === STEP 2: WAITING ${config.waitAfterStop}ms ===`);
      await this.sleep(config.waitAfterStop);
      
      // Step 3: Try to restart the database
      console.log('📋 === STEP 3: RESTART DATABASE ===');
      const restartSuccess = await this.restartDatabase();
      console.log(`📋 Database restart result: ${restartSuccess}`);
      
      if (restartSuccess) {
        // Step 4: Wait for database to come up
        console.log(`📋 === STEP 4: WAITING ${config.waitAfterRestart}ms FOR DB ===`);
        await this.sleep(config.waitAfterRestart);
        
        // Step 5: Check if database is really up
        console.log('📋 === STEP 5: VERIFY DATABASE ===');
        const isUp = await this.checkDatabaseStatus();
        console.log(`📋 Database status check result: ${isUp}`);
        
        if (isUp) {
          // Step 6: Run "Start Pods" script
          console.log('📋 === STEP 6: START PODS ===');
          console.log('🔍 Looking for script named "Start Pods"...');
          
          const startResult = await this.runScriptByName('Start Pods');
          console.log(`📋 Start script result:`, startResult);
          
          if (!startResult.success) {
            console.log('⚠️ Start Pods script failed, but database is up');
            this.logRecovery('PARTIAL_SUCCESS', 'Database recovered but Start Pods script failed');
          } else {
            console.log('🎉 Database recovery completed successfully!');
            this.logRecovery('SUCCESS', 'Database recovered successfully');
          }
          
          this.recoveryAttempts = 0; // Reset attempts on success
          this.isRecoveryInProgress = false;
          console.log('🚨 === DATABASE AUTO-RECOVERY COMPLETED ===');
          return true;
        } else {
          console.log('❌ Database failed to start after restart attempt');
          this.logRecovery('FAILED', 'Database failed to start after restart');
        }
      } else {
        console.log('❌ Database restart command failed');
        this.logRecovery('RESTART_FAILED', 'Database restart command failed');
      }
      
    } catch (error) {
      console.error('❌ Error during database recovery:', error);
      this.logRecovery('ERROR', `Recovery failed: ${error.message}`);
    }

    this.isRecoveryInProgress = false;
    console.log('🚨 === DATABASE AUTO-RECOVERY FAILED ===');
    return false;
  }*/

    async handleDatabaseDown() {
  const config = this.getConfig();
  
  console.log('🚨 === DATABASE AUTO-RECOVERY STARTED ===');
  console.log(`🔧 Auto-recovery enabled: ${config.enabled}`);
  console.log(`🔧 Current attempts: ${this.recoveryAttempts}/${config.maxAttempts}`);
  
  if (!config.enabled) {
    console.log('📋 Auto-recovery is disabled, skipping recovery');
    return false;
  }

  if (this.isRecoveryInProgress) {
    console.log('🔄 Recovery already in progress, skipping');
    return false;
  }

  if (this.recoveryAttempts >= config.maxAttempts) {
    console.log(`🚫 Maximum recovery attempts (${config.maxAttempts}) reached`);
    this.logRecovery('MAX_ATTEMPTS_REACHED', 'Maximum recovery attempts exceeded');
    // Send alert email about max attempts reached
    await this.sendMaxAttemptsAlert();
    return false;
  }

  console.log('🚨 Starting automatic database recovery...');
  this.isRecoveryInProgress = true;
  this.recoveryAttempts++;

  try {
    // Step 1: Stop Pods (releases all connections)
    console.log('📋 === STEP 1: STOP PODS ===');
    const stopResult = await this.runScriptByName('Stop Pods');
    
    if (!stopResult.success) {
      console.error(`❌ Stop Pods script failed: ${stopResult.error}`);
      // Continue anyway - database might still be recoverable
    } else {
      console.log('✅ Stop Pods script completed successfully');
    }
    
    // Step 2: Wait after stop
    console.log(`📋 === STEP 2: WAITING ${config.waitAfterStop}ms ===`);
    await this.sleep(config.waitAfterStop);
    
    // Step 3: Restart database using the SAME METHOD as manual button
    console.log('📋 === STEP 3: RESTART DATABASE (using manual button method) ===');
    const restartSuccess = await this.restartDatabase(); // This now uses your working startup() method
    
    if (restartSuccess) {
      // Step 4: Wait for database to fully initialize
      console.log(`📋 === STEP 4: WAITING ${config.waitAfterRestart}ms FOR DB ===`);
      await this.sleep(config.waitAfterRestart);
      
      // Step 5: Verify database (with retries for ORA-12518)
      console.log('📋 === STEP 5: VERIFY DATABASE ===');
      const isUp = await this.checkDatabaseStatus();
      
      if (isUp) {
        // Step 6: Start Pods
        console.log('📋 === STEP 6: START PODS ===');
        const startResult = await this.runScriptByName('Start Pods');
        
        if (!startResult.success) {
          console.log('⚠️ Start Pods script failed, but database is up');
          this.logRecovery('PARTIAL_SUCCESS', 'Database recovered but Start Pods script failed');
          await this.sendPartialSuccessAlert();
        } else {
          console.log('🎉 Database recovery completed successfully!');
          this.logRecovery('SUCCESS', 'Database recovered successfully');
          await this.sendSuccessAlert();
        }
        
        this.recoveryAttempts = 0; // Reset on success
        this.isRecoveryInProgress = false;
        console.log('🚨 === DATABASE AUTO-RECOVERY COMPLETED ===');
        return true;
      } else {
        console.log('❌ Database failed to start after restart attempt');
        this.logRecovery('FAILED', 'Database failed to start after restart');
      }
    } else {
      console.log('❌ Database restart command failed');
      this.logRecovery('RESTART_FAILED', 'Database restart command failed');
    }
    
  } catch (error) {
    console.error('❌ Error during database recovery:', error);
    this.logRecovery('ERROR', `Recovery failed: ${error.message}`);
  }

  this.isRecoveryInProgress = false;
  console.log('🚨 === DATABASE AUTO-RECOVERY FAILED ===');
  
  // Check if we should try again later
  if (this.recoveryAttempts < config.maxAttempts) {
    const waitTime = config.cooldownPeriod || 300000; // 5 minutes default
    console.log(`⏰ Will retry in ${waitTime/1000} seconds (attempt ${this.recoveryAttempts}/${config.maxAttempts})`);
  }
  
  return false;
}
  // Find script by exact name
  findScriptByName(scriptName) {
    try {
      const scriptService = require('./scriptService');
      const allScripts = scriptService.getAllScripts();
      
      console.log(`🔍 Looking for script named: "${scriptName}"`);
      console.log(`🔍 Available scripts:`, allScripts.map(s => `"${s.name}" (ID: ${s.id})`));
      
      const script = allScripts.find(s => s.name.trim() === scriptName.trim());
      
      if (script) {
        console.log(`✅ Found script: "${scriptName}" (ID: ${script.id})`);
        return script;
      } else {
        console.log(`❌ Script not found: "${scriptName}"`);
        console.log(`📋 Available script names: ${allScripts.map(s => `"${s.name}"`).join(', ')}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error finding script "${scriptName}":`, error);
      return null;
    }
  }

  // Run script by exact name with proper environment
  async runScriptByName(scriptName) {
    try {
      console.log(`🔧 runScriptByName called with: "${scriptName}"`);
      
      const script = this.findScriptByName(scriptName);
      
      if (!script) {
        const errorMsg = `Script "${scriptName}" not found. Please create a script named exactly "${scriptName}" in your Script Manager.`;
        console.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      console.log(`🔧 Found script "${script.name}" with ID: ${script.id}`);
      console.log(`📋 Script path: ${script.scriptPath}`);
      console.log(`📋 Arguments: ${script.arguments || 'None'}`);
      
      // ENHANCED: Run script with better environment for Java/mtctl.cmd
      if (script.scriptPath.includes('mtctl.cmd')) {
        console.log('🔧 Detected mtctl.cmd script - using enhanced execution environment');
        return await this.runMtctlScript(script);
      }
      
      const scriptService = require('./scriptService');
      
      // IMPORTANT: Pass the script ID, not the script object
      console.log(`🔧 Calling scriptService.runScript with ID: ${script.id}`);
      const result = await scriptService.runScript(script.id);
      
      console.log(`📋 Script service returned:`, { success: result.success, error: result.error });
      
      if (result.success) {
        console.log(`✅ Script "${script.name}" completed successfully`);
        console.log(`📋 Output preview: ${(result.output || '').substring(0, 200)}...`);
        return { success: true, output: result.output };
      } else {
        console.error(`❌ Script "${script.name}" failed`);
        console.error(`📋 Error: ${result.error}`);
        return { success: false, error: result.error };
      }
      
    } catch (error) {
      console.error(`❌ Failed to run script "${scriptName}":`, error);
      return { success: false, error: error.message };
    }
  }

  // Special handler for mtctl.cmd scripts with proper environment
  async runMtctlScript(script) {
    return new Promise((resolve) => {
      const path = require('path');
      const { exec } = require('child_process');
      
      // Extract directory from script path
      const scriptDir = path.dirname(script.scriptPath);
      const scriptFile = path.basename(script.scriptPath);
      
      console.log(`🔧 Running mtctl.cmd with enhanced environment:`);
      console.log(`📁 Working directory: ${scriptDir}`);
      console.log(`📄 Script file: ${scriptFile}`);
      console.log(`⚙️ Arguments: ${script.arguments}`);
      
      // Build command - run from the script's directory
      const command = `cd /d "${scriptDir}" && ${scriptFile} ${script.arguments || ''}`;
      console.log(`🖥️ Full command: ${command}`);
      
      // Enhanced environment options
      const execOptions = {
        cwd: scriptDir, // Run from script's directory
        timeout: 300000, // 5 minutes timeout
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        env: {
          ...process.env, // Inherit all environment variables
          // Add any specific environment variables if needed
          // JAVA_HOME: 'C:\\Program Files\\Java\\jdk-11', // Uncomment if needed
        },
        shell: true,
        windowsHide: true
      };
      
      console.log('🚀 Executing mtctl.cmd with enhanced environment...');
      
      exec(command, execOptions, (error, stdout, stderr) => {
        console.log('📋 mtctl.cmd execution completed');
        console.log('📋 STDOUT:', stdout);
        console.log('📋 STDERR:', stderr);
        
        if (error) {
          console.error(`❌ mtctl.cmd execution error:`, error);
          resolve({ 
            success: false, 
            error: error.message,
            output: `Error: ${error.message}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}` 
          });
          return;
        }
        
        // Check for Java errors even if command didn't fail
        if (stderr && (stderr.includes('ClassNotFoundException') || stderr.includes('Error:'))) {
          console.error(`❌ mtctl.cmd Java error detected in stderr`);
          resolve({ 
            success: false, 
            error: 'Java ClassNotFoundException or other error',
            output: `STDOUT: ${stdout}\nSTDERR: ${stderr}` 
          });
          return;
        }
        
        // Success
        console.log('✅ mtctl.cmd completed successfully');
        resolve({ 
          success: true, 
          output: `STDOUT: ${stdout}\nSTDERR: ${stderr}` 
        });
      });
    });
  }

  // Restart the database using SQL*Plus commands (same as manual operations)
  /*async restartDatabase() {
    return new Promise(async (resolve) => {
      console.log('🔄 Attempting to restart Oracle database using SQL*Plus commands...');
      console.log('💡 Using same method as your manual database operations');
      
      try {
        const { exec } = require('child_process');
        const path = require('path');
        const fs = require('fs');
        
        // Get credentials from environment (same as manual operations)
        const sysUsername = process.env.DB_RESTART_USERNAME || 'sys';
        const sysPassword = process.env.DB_RESTART_PASSWORD;
        
        if (!sysPassword) {
          console.error('❌ DB_RESTART_PASSWORD not found in environment variables');
          resolve(false);
          return;
        }
        
        console.log(`🔧 Using SYS credentials: ${sysUsername}/***** `);
        
        // Step 1: SHUTDOWN IMMEDIATE using SQL*Plus
        console.log('🛑 Step 1: SHUTDOWN IMMEDIATE via SQL*Plus');
        console.log('💡 Note: Database might already be down from manual shutdown');
        
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const shutdownScriptPath = path.join(tempDir, 'auto_shutdown.sql');
        const shutdownScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
SHUTDOWN IMMEDIATE;
EXIT;`;
        
        fs.writeFileSync(shutdownScriptPath, shutdownScript);
        console.log('📝 Created shutdown script file');
        
        // Execute SHUTDOWN IMMEDIATE
        const shutdownCommand = `sqlplus /nolog @"${shutdownScriptPath}"`;
        console.log(`🔧 Executing: ${shutdownCommand}`);
        
        exec(shutdownCommand, { timeout: 60000 }, (shutdownError, shutdownStdout, shutdownStderr) => {
          console.log('📋 SHUTDOWN output:', shutdownStdout);
          
          // Clean up shutdown script
          try { fs.unlinkSync(shutdownScriptPath); } catch(e) {}
          
          // ENHANCED: Handle case where DB is already down
          if (shutdownError || shutdownStdout.includes('not connected') || shutdownStdout.includes('ORA-')) {
            console.log('💡 Database appears to already be shut down (expected for manual shutdown)');
            console.log('📋 This is normal if database was manually shut down');
          } else {
            console.log('✅ SHUTDOWN IMMEDIATE completed');
          }
          
          // Wait 10 seconds between shutdown and startup (same as manual)
          console.log('⏳ Waiting 10 seconds between shutdown and startup...');
          setTimeout(() => {
            
            // Step 2: STARTUP using SQL*Plus
            console.log('🚀 Step 2: STARTUP via SQL*Plus');
            
            const startupScriptPath = path.join(tempDir, 'auto_startup.sql');
            
            // Create startup script (same logic as manual operations)
            const startupScript = `CONNECT ${sysUsername}/${sysPassword} AS SYSDBA
STARTUP;
ALTER PLUGGABLE DATABASE ALL OPEN;
EXIT;`;
            
            fs.writeFileSync(startupScriptPath, startupScript);
            console.log('📝 Created startup script file');
            
            // Execute STARTUP
            const startupCommand = `sqlplus /nolog @"${startupScriptPath}"`;
            console.log(`🔧 Executing: ${startupCommand}`);
            
            exec(startupCommand, { timeout: 120000 }, (startupError, startupStdout, startupStderr) => {
              console.log('📋 STARTUP output:', startupStdout);
              
              // Clean up startup script
              try { fs.unlinkSync(startupScriptPath); } catch(e) {}
              
              if (startupError) {
                console.error(`❌ STARTUP error: ${startupError.message}`);
                resolve(false);
                return;
              }
              
              // Check for success indicators in output (same as manual)
              const shutdownSuccess = shutdownStdout && (
                shutdownStdout.includes('Database closed') ||
                shutdownStdout.includes('Database dismounted') ||
                shutdownStdout.includes('ORACLE instance shut down')
              );
              
              const startupSuccess = startupStdout && (
                startupStdout.includes('Database mounted') ||
                startupStdout.includes('Database opened') ||
                startupStdout.includes('ORACLE instance started')
              );
              
              console.log(`📊 Shutdown indicators found: ${shutdownSuccess}`);
              console.log(`📊 Startup indicators found: ${startupSuccess}`);
              
              if (startupSuccess || startupStdout.includes('Connected')) {
                console.log('✅ Oracle database restart completed successfully via SQL*Plus');
                resolve(true);
              } else {
                console.log('⚠️ Database restart may have succeeded, but unclear from output');
                console.log('💡 Will let database status check verify if it worked');
                resolve(true); // Let the database status check be the final arbiter
              }
            });
            
          }, 10000); // 10 second wait between shutdown and startup
        });
        
      } catch (error) {
        console.error('❌ Database restart process failed:', error);
        resolve(false);
      }
    });
  }*/

  async restartDatabase() {
    try {
      console.log('🔄 Starting database restart process...');
      
      // IMPORTANT: Use the SAME startup() method that works with your manual button
      const databaseOperationsService = require('./databaseOperationsService');
      
      // The startup() method is what works when you click the button manually
      console.log('🚀 Calling databaseOperationsService.startup() - same as manual button...');
      const startupResult = await databaseOperationsService.startup();
      
      console.log('📋 Startup result:', {
        success: startupResult.success,
        message: startupResult.message,
        method: startupResult.method,
        verified: startupResult.verified
      });
      
      if (startupResult.success) {
        console.log('✅ Database startup command executed successfully');
        
        // Handle different success scenarios
        if (startupResult.method === 'already_running') {
          console.log('ℹ️ Database was already running');
          return true;
        } else if (startupResult.verified) {
          console.log('✅ Database startup verified');
          return true;
        } else {
          console.log('⚠️ Database startup executed but not verified yet');
          // Still return true as the startup commands were executed
          // The verification in step 5 will check if it's really up
          return true;
        }
      } else {
        console.error('❌ Database startup failed:', startupResult.error || startupResult.message);
        return false;
      }
      
    } catch (error) {
      console.error('❌ Exception during database restart:', error);
      return false;
    }
  }
  // Check if database is up (simple connection test)
  /*async checkDatabaseStatus() {
    try {
      // Import your existing database service
      const realOracleService = require('./realOracleService');
      const result = await realOracleService.testConnection();
      return result.success;
    } catch (error) {
      console.error('❌ Database status check failed:', error);
      return false;
    }
  }*/

  async checkDatabaseStatus() {
    try {
      console.log('🔍 Checking database status...');
      
      const realOracleService = require('./realOracleService');
      
      // Try multiple times as database might still be registering with listener
      let attempts = 0;
      const maxAttempts = 3;
      const delayBetweenAttempts = 10000; // 10 seconds
      
      while (attempts < maxAttempts) {
        attempts++;
        console.log(`🔍 Database check attempt ${attempts}/${maxAttempts}...`);
        
        const result = await realOracleService.checkConnection();
        
        if (result.isConnected) {
          console.log('✅ Database is UP and responding');
          return true;
        } else {
          console.log(`❌ Database check failed: ${result.error}`);
          
          // If it's ORA-12518, the database might be starting up
          if (result.error && result.error.includes('ORA-12518')) {
            console.log('ℹ️ ORA-12518: Listener registration pending, database may still be starting...');
            
            if (attempts < maxAttempts) {
              console.log(`⏳ Waiting ${delayBetweenAttempts/1000} seconds before retry...`);
              await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
              continue;
            }
          }
          
          // For other errors or last attempt, return false
          if (attempts >= maxAttempts) {
            console.log('❌ Database is DOWN after all attempts');
            return false;
          }
        }
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ Error checking database status:', error);
      return false;
    }
  }

  // Helper method to sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Log recovery attempts
  logRecovery(status, message) {
    const logEntry = {
      timestamp: new Date(),
      attempt: this.recoveryAttempts,
      status,
      message
    };
    
    this.recoveryLog.push(logEntry);
    
    // Keep only last 50 entries
    if (this.recoveryLog.length > 50) {
      this.recoveryLog = this.recoveryLog.slice(-50);
    }
    
    console.log(`📝 Recovery log: ${status} - ${message}`);
  }

  // Reset recovery attempts (useful for manual reset)
  resetRecoveryAttempts() {
    this.recoveryAttempts = 0;
    this.isRecoveryInProgress = false;
    console.log('🔄 Recovery attempts reset');
  }
}

module.exports = new DatabaseAutoRecoveryService();