import React, { createContext, useContext, useState, useEffect } from 'react';
import { message } from 'antd';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');

  // Check for saved user on app start
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (error) {
        localStorage.removeItem('currentUser');
      }
    }
    checkBackendConnection();
  }, []);

  const checkBackendConnection = async () => {
    try {
      console.log('Checking backend connection...');
      const response = await authAPI.checkHealth();
      console.log('Backend response:', response);
      setBackendStatus('connected');
      message.success('Backend connected successfully!');
    } catch (error) {
      console.error('Backend connection error:', error);
      setBackendStatus('disconnected');
      message.error('Backend connection failed');
    }
  };

  const login = async (credentials) => {
    try {
      setLoading(true);
      console.log('Attempting login with:', credentials);
      
      const response = await authAPI.login(credentials);
      console.log('Login response:', response);
      
      if (response.success) {
        setCurrentUser(response.user);
        localStorage.setItem('currentUser', JSON.stringify(response.user));
        message.success('Login successful!');
        return { success: true };
      } else {
        message.error('Login failed');
        return { success: false, error: 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      
      let errorMessage = 'Login failed';
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error;
      } else if (error.request) {
        errorMessage = 'Cannot connect to server. Please check if backend is running.';
      } else {
        errorMessage = error.message;
      }
      
      message.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    message.success('Logged out successfully!');
  };

  const value = {
    currentUser,
    loading,
    backendStatus,
    login,
    logout,
    checkBackendConnection,
    isAuthenticated: !!currentUser,
    isAdmin: currentUser?.role === 'admin'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};