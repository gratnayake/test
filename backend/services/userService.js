const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

class UserService {
  constructor() {
    this.usersFile = path.join(__dirname, '../data/users.json');
    this.ensureDataDirectory();
    this.ensureUsersFile();
  }

  ensureDataDirectory() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Created data directory');
    }
  }

  ensureUsersFile() {
    if (!fs.existsSync(this.usersFile)) {
      // Create default admin user
      const defaultUsers = [
        {
          id: 1,
          username: 'admin',
          password: bcrypt.hashSync('admin123', 10),
          firstName: 'System',
          lastName: 'Administrator',
          email: 'admin@company.com',
          role: 'admin',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      this.saveUsers(defaultUsers);
      console.log('👤 Created default admin user');
    }
  }

  loadUsers() {
    try {
      const data = fs.readFileSync(this.usersFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  }

  saveUsers(users) {
    try {
      fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2));
      console.log('💾 Users saved to JSON file');
      return true;
    } catch (error) {
      console.error('Error saving users:', error);
      return false;
    }
  }

  // Get all users (without passwords)
  getAllUsers() {
    const users = this.loadUsers();
    return users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  // Get user by ID
  getUserById(id) {
    const users = this.loadUsers();
    const user = users.find(u => u.id === parseInt(id));
    if (user) {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }
    return null;
  }

  // Get user by username (for login)
  getUserByUsername(username) {
    const users = this.loadUsers();
    return users.find(u => u.username === username);
  }

  // Create new user
  createUser(userData) {
    const users = this.loadUsers();
    
    // Check if username or email already exists
    const existingUser = users.find(u => 
      u.username === userData.username || u.email === userData.email
    );
    
    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(userData.password, 10);
    
    // Create new user
    const newUser = {
      id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
      username: userData.username,
      password: hashedPassword,
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      role: userData.role || 'user',
      status: userData.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.push(newUser);
    
    if (this.saveUsers(users)) {
      const { password, ...userWithoutPassword } = newUser;
      console.log(`✅ Created user: ${userData.username}`);
      return userWithoutPassword;
    } else {
      throw new Error('Failed to save user');
    }
  }

  // Update user
  updateUser(id, userData) {
    const users = this.loadUsers();
    const userIndex = users.findIndex(u => u.id === parseInt(id));
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    // Check if username or email already exists (excluding current user)
    const existingUser = users.find(u => 
      u.id !== parseInt(id) && 
      (u.username === userData.username || u.email === userData.email)
    );
    
    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    // Update user data
    const updatedUser = {
      ...users[userIndex],
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      role: userData.role,
      status: userData.status,
      updatedAt: new Date().toISOString()
    };

    // Update password if provided
    if (userData.password && userData.password.trim() !== '') {
      updatedUser.password = bcrypt.hashSync(userData.password, 10);
    }

    users[userIndex] = updatedUser;
    
    if (this.saveUsers(users)) {
      const { password, ...userWithoutPassword } = updatedUser;
      console.log(`🔄 Updated user: ${userData.username}`);
      return userWithoutPassword;
    } else {
      throw new Error('Failed to update user');
    }
  }

  // Delete user
  deleteUser(id) {
    const users = this.loadUsers();
    const userIndex = users.findIndex(u => u.id === parseInt(id));
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    // Don't allow deleting the admin user
    if (users[userIndex].username === 'admin') {
      throw new Error('Cannot delete admin user');
    }

    const deletedUser = users[userIndex];
    users.splice(userIndex, 1);
    
    if (this.saveUsers(users)) {
      console.log(`🗑️ Deleted user: ${deletedUser.username}`);
      return true;
    } else {
      throw new Error('Failed to delete user');
    }
  }

  // Authenticate user
  authenticateUser(username, password) {
    const user = this.getUserByUsername(username);
    
    if (!user) {
      return null;
    }

    if (user.status !== 'active') {
      throw new Error('User account is inactive');
    }

    const isValidPassword = bcrypt.compareSync(password, user.password);
    
    if (isValidPassword) {
      const { password: userPassword, ...userWithoutPassword } = user;
      console.log(`🔐 User logged in: ${username}`);
      return userWithoutPassword;
    }
    
    return null;
  }

  // Get user count
  getUserCount() {
    const users = this.loadUsers();
    return users.length;
  }
}

module.exports = new UserService();