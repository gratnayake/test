import React, { createContext, useContext, useState, useEffect } from 'react';
import { kubernetesAPI } from '../services/api';

const ModeContext = createContext();

export const useMode = () => {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error('useMode must be used within a ModeProvider');
  }
  return context;
};

export const ModeProvider = ({ children }) => {
  const [mode, setMode] = useState('client'); // 'server' or 'client'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkKubernetesMode();
    
    // Check mode every 30 seconds
    const interval = setInterval(checkKubernetesMode, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkKubernetesMode = async () => {
    try {
      const response = await kubernetesAPI.getConfig();
      if (response.success && response.config.isConfigured) {
        setMode('server');
      } else {
        setMode('client');
      }
    } catch (error) {
      setMode('client');
    } finally {
      setLoading(false);
    }
  };

  const value = {
    mode,
    loading,
    isServerMode: mode === 'server',
    isClientMode: mode === 'client',
    refreshMode: checkKubernetesMode
  };

  return (
    <ModeContext.Provider value={value}>
      {children}
    </ModeContext.Provider>
  );
};