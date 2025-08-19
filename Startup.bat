@echo off
REM =================================================
REM Oracle Database Shutdown Script for Windows
REM File: shutdown-oracle.bat
REM Place this in your backend/scripts/ folder
REM =================================================

echo Oracle Database Shutdown Script Starting...
echo Time: %date% %time%
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with Administrator privileges
) else (
    echo [ERROR] This script requires Administrator privileges
    echo Please run as Administrator
    pause
    exit /b 1
)

echo.
echo =================================================
echo STEP 1: Checking Oracle Services
echo =================================================

REM Check Oracle Service status
sc query "OracleServiceXE" | find "STATE" | find "RUNNING" >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] OracleServiceXE is currently RUNNING
    set ORACLE_RUNNING=1
) else (
    echo [INFO] OracleServiceXE is not running
    set ORACLE_RUNNING=0
)

REM Check Oracle Listener status
sc query "OracleXETNSListener" | find "STATE" | find "RUNNING" >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] OracleXETNSListener is currently RUNNING
    set LISTENER_RUNNING=1
) else (
    echo [INFO] OracleXETNSListener is not running
    set LISTENER_RUNNING=0
)

echo.
echo =================================================
echo STEP 2: Attempting Graceful Shutdown via SQL*Plus
echo =================================================

if %ORACLE_RUNNING% == 1 (
    echo [INFO] Attempting graceful shutdown via SQL*Plus...
    
    REM Create temporary SQL script
    echo CONNECT sys/%DB_RESTART_PASSWORD%@localhost:1521/XEPDB1 AS SYSDBA > temp_shutdown.sql
    echo SHUTDOWN IMMEDIATE; >> temp_shutdown.sql
    echo EXIT; >> temp_shutdown.sql
    
    REM Execute SQL*Plus shutdown
    sqlplus /nolog @temp_shutdown.sql >nul 2>&1
    
    REM Clean up temp file
    del temp_shutdown.sql >nul 2>&1
    
    echo [INFO] SQL*Plus shutdown command sent
    echo [INFO] Waiting 10 seconds for graceful shutdown...
    timeout /t 10 /nobreak >nul 2>&1
    
    REM Check if shutdown was successful
    sc query "OracleServiceXE" | find "STATE" | find "RUNNING" >nul 2>&1
    if %errorLevel% == 0 (
        echo [WARNING] Database still running after SQL*Plus shutdown
        set NEED_FORCE_STOP=1
    ) else (
        echo [SUCCESS] Database shutdown gracefully via SQL*Plus
        set NEED_FORCE_STOP=0
    )
) else (
    echo [INFO] Oracle service not running, skipping SQL*Plus shutdown
    set NEED_FORCE_STOP=0
)

echo.
echo =================================================
echo STEP 3: Force Stop Services (if needed)
echo =================================================

if %NEED_FORCE_STOP% == 1 (
    echo [INFO] Forcing service shutdown...
    
    REM Stop Oracle Database Service
    echo [ACTION] Stopping OracleServiceXE...
    net stop "OracleServiceXE" 2>nul
    if %errorLevel% == 0 (
        echo [SUCCESS] OracleServiceXE stopped successfully
    ) else (
        echo [WARNING] Failed to stop OracleServiceXE via net stop, trying sc stop...
        sc stop "OracleServiceXE" >nul 2>&1
        if %errorLevel% == 0 (
            echo [SUCCESS] OracleServiceXE stopped via sc stop
        ) else (
            echo [ERROR] Failed to stop OracleServiceXE
        )
    )
    
    REM Stop Oracle Listener Service
    if %LISTENER_RUNNING% == 1 (
        echo [ACTION] Stopping OracleXETNSListener...
        net stop "OracleXETNSListener" >nul 2>&1
        if %errorLevel% == 0 (
            echo [SUCCESS] OracleXETNSListener stopped successfully
        ) else (
            echo [WARNING] Failed to stop OracleXETNSListener (might not be critical)
        )
    )
    
    echo [INFO] Waiting 5 seconds for services to fully stop...
    timeout /t 5 /nobreak >nul 2>&1
)

echo.
echo =================================================
echo STEP 4: Verification
echo =================================================

REM Final verification
sc query "OracleServiceXE" | find "STATE" | find "STOPPED" >nul 2>&1
if %errorLevel% == 0 (
    echo [SUCCESS] OracleServiceXE is now STOPPED
    set SHUTDOWN_SUCCESS=1
) else (
    echo [ERROR] OracleServiceXE is still running
    set SHUTDOWN_SUCCESS=0
)

sc query "OracleXETNSListener" | find "STATE" | find "STOPPED" >nul 2>&1
if %errorLevel% == 0 (
    echo [SUCCESS] OracleXETNSListener is now STOPPED
) else (
    echo [INFO] OracleXETNSListener status: Not stopped (may be ok)
)

echo.
echo =================================================
echo SHUTDOWN SUMMARY
echo =================================================
echo Time: %date% %time%

if %SHUTDOWN_SUCCESS% == 1 (
    echo [RESULT] SUCCESS - Oracle Database has been shut down
    exit /b 0
) else (
    echo [RESULT] FAILED - Oracle Database shutdown was not successful
    echo.
    echo Manual steps to try:
    echo 1. Open Services.msc as Administrator
    echo 2. Find and stop "Oracle Database Service - XE"
    echo 3. Stop "Oracle TNS Listener - XE" if present
    echo 4. Kill oracle.exe processes in Task Manager if needed
    exit /b 1
)

REM =================================================
REM End of script
REM =================================================