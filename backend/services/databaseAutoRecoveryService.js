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
  console.log(`🔧 Recovery in progress: ${this.isRecoveryInProgress}`); // Added back
  
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
  const attemptNumber = this.recoveryAttempts; // Store for email alerts

  try {
    // Step 1: Stop Pods (releases all connections)
    console.log('📋 === STEP 1: STOP PODS ===');
    console.log('🔍 Looking for script named "Stop Pods"...'); // Added back
    
    /*const stopResult = await this.runScriptByName('Stop Pods');
    console.log(`📋 Stop script result:`, stopResult); // Added back
    
    if (!stopResult.success) {
      const errorMsg = `Stop Pods script failed: ${stopResult.error}`;
      console.error(`❌ ${errorMsg}`);
      // Continue anyway - database might still be recoverable
      // Don't throw error, just log it
    } else {
      console.log('✅ Stop Pods script completed successfully');
      // SEND ALERT: Pods stopped
      await this.sendPodsStoppedAlert(attemptNumber);
    }
    */
    // Step 2: Wait after stop
    console.log(`📋 === STEP 2: WAITING ${config.waitAfterStop}ms ===`);
    await this.sleep(config.waitAfterStop);
    
    // Step 3: Restart database using the SAME METHOD as manual button
    console.log('📋 === STEP 3: RESTART DATABASE (using manual button method) ===');
    
    // SEND ALERT: Database restarting
    await this.sendDatabaseRestartingAlert(attemptNumber);
    
    const restartSuccess = await this.restartDatabase();
    console.log(`📋 Database restart result: ${restartSuccess}`); // Added back
    
    /*if (restartSuccess) {
      // Step 4: Wait for database to fully initialize
      console.log(`📋 === STEP 4: WAITING ${config.waitAfterRestart}ms FOR DB ===`);
      await this.sleep(config.waitAfterRestart);
      
      // Step 5: Verify database (with retries for ORA-12518)
      console.log('📋 === STEP 5: VERIFY DATABASE ===');
      const isUp = await this.checkDatabaseStatus();
      console.log(`📋 Database status check result: ${isUp}`); // Added back
      
      if (isUp) {
        // Step 6: Start Pods
        console.log('📋 === STEP 6: START PODS ===');
        console.log('🔍 Looking for script named "Start Pods"...'); // Added back
        
        // SEND ALERT: Pods starting
        await this.sendPodsStartingAlert(attemptNumber, true);
        
        const startResult = await this.runScriptByName('Start Pods');
        console.log(`📋 Start script result:`, startResult); // Added back
        
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
        // SEND ALERT: Database verification failed
        await this.sendDatabaseVerificationFailedAlert(attemptNumber);
      }
    } else {
      console.log('❌ Database restart command failed');
      this.logRecovery('RESTART_FAILED', 'Database restart command failed');
      // SEND ALERT: Database restart failed
      await this.sendDatabaseRestartFailedAlert(attemptNumber);
    }*/
    
  } catch (error) {
    console.error('❌ Error during database recovery:', error);
    this.logRecovery('ERROR', `Recovery failed: ${error.message}`);
    // SEND ALERT: Recovery error
    await this.sendRecoveryErrorAlert(attemptNumber, error.message);
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

async sendDatabaseVerificationFailedAlert(attemptNumber) {
  try {
    const emailService = require('./emailService');
    const config = this.getConfig();
    
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == config.emailGroupId);
    
    if (!targetGroup || !targetGroup.enabled) return;
    
    const subject = `❌ Auto-Recovery: Database Verification Failed - Attempt ${attemptNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">❌ DATABASE VERIFICATION FAILED</h1>
          <p style="margin: 8px 0 0 0;">Database started but cannot verify connection</p>
        </div>
        <div style="padding: 20px;">
          <p>The database restart command executed but we cannot verify the database is accessible.</p>
          <p>This might be due to:</p>
          <ul>
            <li>Listener not yet registered (ORA-12518)</li>
            <li>Database still initializing</li>
            <li>Network connectivity issues</li>
          </ul>
          <p><strong>Attempt ${attemptNumber} of ${config.maxAttempts}</strong></p>
          ${this.recoveryAttempts < config.maxAttempts ? 
            `<p>Will retry in ${(config.cooldownPeriod || 300000)/1000} seconds.</p>` : 
            '<p>This was the final attempt.</p>'}
        </div>
      </div>
    `;
    
    await emailService.transporter.sendMail({
      to: targetGroup.emails,
      subject: subject,
      html: html
    });
  } catch (error) {
    console.error('Failed to send verification failed alert:', error);
  }
}

async sendDatabaseRestartFailedAlert(attemptNumber) {
  try {
    const emailService = require('./emailService');
    const config = this.getConfig();
    
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == config.emailGroupId);
    
    if (!targetGroup || !targetGroup.enabled) return;
    
    const subject = `❌ Auto-Recovery: Database Restart Failed - Attempt ${attemptNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">❌ DATABASE RESTART FAILED</h1>
          <p style="margin: 8px 0 0 0;">Failed to execute database startup command</p>
        </div>
        <div style="padding: 20px;">
          <p>The database restart command failed to execute properly.</p>
          <p><strong>Attempt ${attemptNumber} of ${config.maxAttempts}</strong></p>
          ${this.recoveryAttempts < config.maxAttempts ? 
            `<p>Will retry in ${(config.cooldownPeriod || 300000)/1000} seconds.</p>` : 
            '<p>This was the final attempt. Manual intervention required.</p>'}
        </div>
      </div>
    `;
    
    await emailService.transporter.sendMail({
      to: targetGroup.emails,
      subject: subject,
      html: html
    });
  } catch (error) {
    console.error('Failed to send restart failed alert:', error);
  }
}

async sendRecoveryErrorAlert(attemptNumber, errorMessage) {
  try {
    const emailService = require('./emailService');
    const config = this.getConfig();
    
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == config.emailGroupId);
    
    if (!targetGroup || !targetGroup.enabled) return;
    
    const subject = `❌ Auto-Recovery Error - Attempt ${attemptNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">❌ AUTO-RECOVERY ERROR</h1>
        </div>
        <div style="padding: 20px;">
          <p><strong>Error:</strong> ${errorMessage}</p>
          <p><strong>Attempt ${attemptNumber} of ${config.maxAttempts}</strong></p>
          ${this.recoveryAttempts < config.maxAttempts ? 
            `<p>Will retry in ${(config.cooldownPeriod || 300000)/1000} seconds.</p>` : 
            '<p>Maximum attempts reached. Manual intervention required.</p>'}
        </div>
      </div>
    `;
    
    await emailService.transporter.sendMail({
      to: targetGroup.emails,
      subject: subject,
      html: html
    });
  } catch (error) {
    console.error('Failed to send error alert:', error);
  }
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
  async sendPodsStoppedAlert(attemptNumber) {
  try {
    console.log('📧 Sending pods stopped alert...');
    
    const emailService = require('./emailService');
    const dbConfigService = require('./dbConfigService');
    
    // Get email group from DATABASE CONFIG, not auto-recovery config
    const dbConfig = dbConfigService.getConfig();
    console.log('📧 Database config emailGroupId:', dbConfig.emailGroupId);
    
    if (!dbConfig.emailGroupId) {
      console.log('⚠️ No email group configured in database config');
      return;
    }
    
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == dbConfig.emailGroupId);
    
    if (!targetGroup) {
      console.log(`⚠️ Email group ${dbConfig.emailGroupId} not found`);
      return;
    }
    
    if (!targetGroup.enabled) {
      console.log(`⚠️ Email group ${targetGroup.name} is disabled`);
      return;
    }
    
    console.log(`📧 Sending alert to group: ${targetGroup.name} (${targetGroup.emails.length} recipients)`);
    
    const config = this.getConfig(); // Auto-recovery config for attempt numbers
    const timestamp = new Date();
    const subject = `🛑 Auto-Recovery: Pods Stopped (Step 1/4) - Attempt ${attemptNumber}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🛑 PODS STOPPED</h1>
          <p style="margin: 8px 0 0 0; font-size: 16px;">Auto-Recovery Step 1 of 4</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px;">
          <div style="background-color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h2 style="margin-top: 0; color: #333;">Auto-Recovery Progress</h2>
            
            <div style="margin: 15px 0;">
              <div style="display: flex; align-items: center; margin: 10px 0;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background: #28a745; color: white; display: flex; align-items: center; justify-content: center; margin-right: 10px;">✓</div>
                <div>
                  <strong>Step 1: Stop All Pods</strong> - COMPLETED
                  <div style="color: #666; font-size: 12px;">Releasing all database connections</div>
                </div>
              </div>
              
              <div style="display: flex; align-items: center; margin: 10px 0;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background: #ffc107; color: white; display: flex; align-items: center; justify-content: center; margin-right: 10px;">2</div>
                <div>
                  <strong>Step 2: Restart Database</strong> - PENDING
                  <div style="color: #666; font-size: 12px;">Will restart Oracle database</div>
                </div>
              </div>
              
              <div style="display: flex; align-items: center; margin: 10px 0;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background: #6c757d; color: white; display: flex; align-items: center; justify-content: center; margin-right: 10px;">3</div>
                <div>
                  <strong>Step 3: Verify Database</strong> - WAITING
                  <div style="color: #666; font-size: 12px;">Will verify database is accessible</div>
                </div>
              </div>
              
              <div style="display: flex; align-items: center; margin: 10px 0;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background: #6c757d; color: white; display: flex; align-items: center; justify-content: center; margin-right: 10px;">4</div>
                <div>
                  <strong>Step 4: Start Pods</strong> - WAITING
                  <div style="color: #666; font-size: 12px;">Will restore all pods</div>
                </div>
              </div>
            </div>
            
            <table style="width: 100%; margin-top: 15px;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>Time:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${timestamp.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px;"><strong>Recovery Attempt:</strong></td>
                <td style="padding: 8px;">${attemptNumber} of ${config.maxAttempts}</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px;">
            <strong>⏳ Next Step:</strong> Database will be restarted in ${config.waitAfterStop/1000} seconds
          </div>
        </div>
        
        <div style="background-color: #343a40; color: white; padding: 15px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">Database Auto-Recovery System - Step 1/4 Complete</p>
        </div>
      </div>
    `;
    
    await emailService.transporter.sendMail({
      to: targetGroup.emails,
      subject: subject,
      html: html
    });
    
    console.log('📧 ✅ Pods stopped alert sent successfully');
  } catch (error) {
    console.error('📧 ❌ Failed to send pods stopped alert:', error);
  }
}

async sendDatabaseRestartingAlert() {
  try {
    console.log('📧 Sending database restarting alert...');
    
    // Get database config for email group
    const dbConfigService = require('./dbConfigService');
    const dbConfig = dbConfigService.getConfig();
    console.log('📄 Database config loaded:', { 
      isConfigured: dbConfig.isConfigured, 
      host: dbConfig.host, 
      emailGroupId: dbConfig.emailGroupId 
    });
    
    if (!dbConfig.emailGroupId) {
      console.log('⚠️ No email group configured for database alerts');
      return false;
    }
    
    console.log('📧 Database config emailGroupId:', dbConfig.emailGroupId);
    
    // Get email service
    const emailService = require('./emailService');
    
    // Get the email group
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === dbConfig.emailGroupId && g.enabled);
    
    if (!targetGroup || targetGroup.emails.length === 0) {
      console.log('⚠️ No valid email group found for database alerts');
      return false;
    }
    
    console.log(`📧 Sending alert to group: ${targetGroup.name} (${targetGroup.emails.length} recipients)`);
    
    const currentTime = new Date();
    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: `🔄 AUTO-RECOVERY: Database Restart in Progress`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #17a2b8; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🔄 DATABASE RESTART IN PROGRESS</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #17a2b8;">
            <h2 style="color: #0c5460; margin-top: 0;">Automatic Database Recovery Initiated</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 30%;">Status:</td>
                <td style="padding: 8px; color: #17a2b8;">🔄 RESTARTING DATABASE</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Database:</td>
                <td style="padding: 8px;">${dbConfig.host}:${dbConfig.port}/${dbConfig.serviceName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Time:</td>
                <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Recovery Attempt:</td>
                <td style="padding: 8px;">${this.recoveryAttempts} of ${this.maxRecoveryAttempts}</td>
              </tr>
            </table>
            
            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #0c5460;">🔧 RECOVERY PROGRESS</h3>
              <ol style="color: #0c5460; margin: 10px 0;">
                <li>✅ Step 1: Stop Pods - Completed</li>
                <li>✅ Step 2: Wait for pods to stop - Completed</li>
                <li><strong>➡️ Step 3: Restart Oracle Database - IN PROGRESS</strong></li>
                <li>Step 4: Wait for database to come online</li>
                <li>Step 5: Verify database connection</li>
                <li>Step 6: Start Pods</li>
              </ol>
            </div>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #856404;">⏱️ EXPECTED ACTIONS</h3>
              <ul style="color: #856404; margin: 10px 0;">
                <li>Database shutdown in progress</li>
                <li>Database will be restarted automatically</li>
                <li>This process may take 2-5 minutes</li>
                <li>Services will remain unavailable during restart</li>
                <li>You will be notified when recovery completes</li>
              </ul>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">This is an automated recovery notification from the Database Auto-Recovery System</p>
            <p style="margin: 5px 0 0 0;">Please do not attempt manual intervention unless recovery fails</p>
          </div>
        </div>
      `
    };
    
    // Send the email using the transporter directly
    await emailService.transporter.sendMail(mailOptions);
    console.log('📧 ✅ Database restarting alert email sent successfully');
    return true;
    
  } catch (error) {
    console.error('📧 ❌ Failed to send database restarting alert:', error);
    return false;
  }
}

async sendPodsStartingAlert(scriptName, namespace) {
  try {
    console.log('📧 Sending pods starting alert...');
    
    // Get database config for email group
    const dbConfigService = require('./dbConfigService');
    const dbConfig = dbConfigService.getConfig();
    console.log('📄 Database config loaded:', { 
      isConfigured: dbConfig.isConfigured, 
      host: dbConfig.host, 
      emailGroupId: dbConfig.emailGroupId 
    });
    
    if (!dbConfig.emailGroupId) {
      console.log('⚠️ No email group configured for database alerts');
      return false;
    }
    
    console.log('📧 Database config emailGroupId:', dbConfig.emailGroupId);
    
    // Get email service
    const emailService = require('./emailService');
    
    // Get the email group
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id === dbConfig.emailGroupId && g.enabled);
    
    if (!targetGroup || targetGroup.emails.length === 0) {
      console.log('⚠️ No valid email group found for database alerts');
      return false;
    }
    
    console.log(`📧 Sending alert to group: ${targetGroup.name} (${targetGroup.emails.length} recipients)`);
    
    const currentTime = new Date();
    const mailOptions = {
      from: emailService.getEmailConfig().user,
      to: targetGroup.emails.join(','),
      subject: `🚀 AUTO-RECOVERY: Starting Pods - Database Recovery Almost Complete`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🚀 STARTING PODS</h1>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-left: 5px solid #28a745;">
            <h2 style="color: #155724; margin-top: 0;">Database Recovered - Restarting Services</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 30%;">Status:</td>
                <td style="padding: 8px; color: #28a745;">🚀 STARTING SERVICES</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Database Status:</td>
                <td style="padding: 8px; color: #28a745;">✅ ONLINE</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Script Executing:</td>
                <td style="padding: 8px;">${scriptName || 'Start Pods'}</td>
              </tr>
              ${namespace ? `
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Namespace:</td>
                <td style="padding: 8px;">${namespace}</td>
              </tr>
              ` : ''}
              <tr ${namespace ? '' : 'style="background-color: #ffffff;"'}>
                <td style="padding: 8px; font-weight: bold;">Time:</td>
                <td style="padding: 8px;">${currentTime.toLocaleString()}</td>
              </tr>
              <tr style="background-color: #ffffff;">
                <td style="padding: 8px; font-weight: bold;">Recovery Attempt:</td>
                <td style="padding: 8px;">${this.recoveryAttempts} of ${this.maxRecoveryAttempts}</td>
              </tr>
            </table>
            
            <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #155724;">✅ RECOVERY PROGRESS</h3>
              <ol style="color: #155724; margin: 10px 0;">
                <li>✅ Step 1: Stop Pods - Completed</li>
                <li>✅ Step 2: Wait for pods to stop - Completed</li>
                <li>✅ Step 3: Restart Oracle Database - Completed</li>
                <li>✅ Step 4: Wait for database - Completed</li>
                <li>✅ Step 5: Verify database connection - Completed</li>
                <li><strong>➡️ Step 6: Start Pods - IN PROGRESS</strong></li>
              </ol>
            </div>
            
            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #0c5460;">🎯 FINAL STEPS</h3>
              <ul style="color: #0c5460; margin: 10px 0;">
                <li>Pods are being started automatically</li>
                <li>Services should be available within 1-2 minutes</li>
                <li>Monitor application logs for any issues</li>
                <li>Verify all critical services are running</li>
                <li>A final success notification will be sent</li>
              </ul>
            </div>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <p style="color: #856404; margin: 0;">
                <strong>Note:</strong> The database has been successfully recovered. 
                Application services are now being restored. Please allow a few minutes 
                for all services to become fully operational.
              </p>
            </div>
          </div>
          
          <div style="background-color: #e9ecef; padding: 15px; text-align: center; font-size: 12px; color: #6c757d;">
            <p style="margin: 0;">This is an automated recovery notification from the Database Auto-Recovery System</p>
            <p style="margin: 5px 0 0 0;">Recovery is nearly complete - services will be available shortly</p>
          </div>
        </div>
      `
    };
    
    // Send the email using the transporter directly
    await emailService.transporter.sendMail(mailOptions);
    console.log('📧 ✅ Pods starting alert email sent successfully');
    return true;
    
  } catch (error) {
    console.error('📧 ❌ Failed to send pods starting alert:', error);
    return false;
  }
}

getEmailGroup() {
  try {
    const emailService = require('./emailService');
    const dbConfigService = require('./dbConfigService');
    
    // Get email group from DATABASE CONFIG
    const dbConfig = dbConfigService.getConfig();
    console.log('📧 Getting email group from database config:', dbConfig.emailGroupId);
    
    if (!dbConfig.emailGroupId) {
      console.log('⚠️ No email group configured in database config');
      return null;
    }
    
    const groups = emailService.getEmailGroups();
    const targetGroup = groups.find(g => g.id == dbConfig.emailGroupId);
    
    if (!targetGroup) {
      console.log(`⚠️ Email group ${dbConfig.emailGroupId} not found`);
      return null;
    }
    
    if (!targetGroup.enabled) {
      console.log(`⚠️ Email group ${targetGroup.name} is disabled`);
      return null;
    }
    
    console.log(`📧 Using email group: ${targetGroup.name} (${targetGroup.emails.length} recipients)`);
    return targetGroup;
    
  } catch (error) {
    console.error('📧 ❌ Failed to get email group:', error);
    return null;
  }
}

// Then you can simplify all alert methods:
async sendAnyAlert(subject, html) {
  try {
    const emailService = require('./emailService');
    const targetGroup = this.getEmailGroup();
    
    if (!targetGroup) {
      return; // Already logged why in getEmailGroup()
    }
    
    await emailService.transporter.sendMail({
      to: targetGroup.emails,
      subject: subject,
      html: html
    });
    
    console.log(`📧 ✅ Alert sent: ${subject}`);
    return true;
    
  } catch (error) {
    console.error(`📧 ❌ Failed to send alert:`, error);
    return false;
  }
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