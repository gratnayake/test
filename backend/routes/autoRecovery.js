// backend/routes/autoRecovery.js
const express = require('express');
const router = express.Router();
const databaseAutoRecoveryService = require('../services/databaseAutoRecoveryService');

// GET /api/auto-recovery/status - Get auto recovery status
router.get('/status', (req, res) => {
  try {
    const status = databaseAutoRecoveryService.getAutoRecoveryStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ Error getting auto-recovery status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get auto-recovery status',
      error: error.message
    });
  }
});

// POST /api/auto-recovery/toggle - Enable/disable auto recovery
router.post('/toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled must be a boolean value'
      });
    }

    const newStatus = databaseAutoRecoveryService.setAutoRecoveryEnabled(enabled);
    
    console.log(`🔄 Auto-recovery toggled: ${enabled}`);
    
    res.json({
      success: true,
      message: `Auto-recovery ${enabled ? 'enabled' : 'disabled'}`,
      data: {
        enabled: newStatus
      }
    });
  } catch (error) {
    console.error('❌ Error toggling auto-recovery:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle auto-recovery',
      error: error.message
    });
  }
});

// POST /api/auto-recovery/reset - Reset recovery attempts
router.post('/reset', (req, res) => {
  try {
    databaseAutoRecoveryService.resetRecoveryAttempts();
    
    console.log('🔄 Recovery attempts reset');
    
    res.json({
      success: true,
      message: 'Recovery attempts reset successfully'
    });
  } catch (error) {
    console.error('❌ Error resetting recovery attempts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset recovery attempts',
      error: error.message
    });
  }
});

// POST /api/auto-recovery/test - Manually trigger recovery process (for testing)
router.post('/test', async (req, res) => {
  try {
    console.log('🧪 Manual recovery test triggered');
    
    const result = await databaseAutoRecoveryService.handleDatabaseDown();
    
    res.json({
      success: true,
      message: 'Recovery test completed',
      data: {
        recoverySuccess: result,
        status: databaseAutoRecoveryService.getAutoRecoveryStatus()
      }
    });
  } catch (error) {
    console.error('❌ Error during recovery test:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run recovery test',
      error: error.message
    });
  }
});

module.exports = router;