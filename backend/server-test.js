const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Backend is working!',
    timestamp: new Date(),
    status: 'OK'
  });
});

// Test route
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Test endpoint working!',
    port: PORT
  });
});

// Simple login route for testing
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log('Login attempt:', { username, password });
  
  if (username === 'admin' && password === 'admin123') {
    res.json({
      success: true,
      user: {
        id: 1,
        username: 'admin',
        firstName: 'System',
        lastName: 'Administrator',
        email: 'admin@company.com',
        role: 'admin'
      }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TEST SERVER running on http://localhost:${PORT}`);
  console.log(`📊 Test it: http://localhost:${PORT}/test`);
  console.log('✅ Basic server started successfully!');
});

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});