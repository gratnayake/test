const express = require('express');
const jwt = require('jsonwebtoken');
const userService = require('../services/userService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = userService.authenticateUser(username, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
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
    res.status(400).json({ error: error.message });
  }
});

// GET /api/users - Get all users (Admin only)
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = userService.getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users - Create new user (Admin only)
router.post('/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username, password, firstName, lastName, email, role, status } = req.body;

    // Validate required fields
    if (!username || !password || !firstName || !lastName || !email) {
      return res.status(400).json({ 
        error: 'Username, password, first name, last name, and email are required' 
      });
    }

    const userData = {
      username,
      password,
      firstName,
      lastName,
      email,
      role: role || 'user',
      status: status || 'active'
    };

    const newUser = userService.createUser(userData);
    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/users/:id - Update user
router.put('/users/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstName, lastName, email, role, status } = req.body;

    // Users can only update their own data unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const userData = {
      username,
      firstName,
      lastName,
      email,
      role: req.user.role === 'admin' ? role : undefined,
      status: req.user.role === 'admin' ? status : undefined
    };

    // Only include password if provided
    if (password && password.trim() !== '') {
      userData.password = password;
    }

    // Remove undefined values
    Object.keys(userData).forEach(key => 
      userData[key] === undefined && delete userData[key]
    );

    const updatedUser = userService.updateUser(id, userData);
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    
    userService.deleteUser(id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;