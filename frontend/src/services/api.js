 import axios from 'axios';

// Configure axios
const api = axios.create({
  baseURL: 'http://localhost:5001',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Auth API functions
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/api/auth/login', credentials);
    return response.data;
  },

  checkHealth: async () => {
    const response = await api.get('/api/health');
    return response.data;
  }
};

// User API functions
export const userAPI = {
  getAll: async () => {
    const response = await api.get('/api/users');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/api/users/${id}`);
    return response.data;
  },

  create: async (userData) => {
    const response = await api.post('/api/users', userData);
    return response.data;
  },

  update: async (id, userData) => {
    const response = await api.put(`/api/users/${id}`, userData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/api/users/${id}`);
    return response.data;
  }
};

// Database API functions
export const databaseAPI = {
  // Get database configuration
  getConfig: async () => {
    const response = await api.get('/api/database/config');
    return response.data;
  },
  getTablespace: async () => {
    const response = await api.get('/api/database/tablespace');
    return response.data;
  },

  // ENHANCED: Save config with thresholds
  saveConfig: async (configData) => {
    const response = await api.post('/api/database/config', configData);
    return response.data;
  },

  // Use existing test connection endpoint
  testConnection: async (configData) => {
    const response = await api.post('/api/database/test-connection', configData);
    return response.data;
  },

  // Add other existing database methods here...
  getStatus: async () => {
    const response = await api.get('/api/database/status');
    return response.data;
  },

  getDashboard: async () => {
    const response = await api.get('/api/database/dashboard');
    return response.data;
  }
};


// NEW: Monitoring API functions
export const monitoringAPI = {
  getStatus: async () => {
    const response = await api.get('/api/monitoring/status');
    return response.data;
  },

  start: async () => {
    const response = await api.post('/api/monitoring/start');
    return response.data;
  },

  stop: async () => {
    const response = await api.post('/api/monitoring/stop');
    return response.data;
  },

  forceCheck: async () => {
    const response = await api.post('/api/monitoring/force-check');
    return response.data;
  },

  getHistory: async () => {
    const response = await api.get('/api/monitoring/history');
    return response.data;
  }
};

// NEW: Logs API functions
export const logsAPI = {
  getDowntimeLogs: async () => {
    const response = await api.get('/api/logs/downtime');
    return response.data;
  }
};

// System monitoring API
export const systemAPI = {
  getMetrics: async () => {
    const response = await api.get('/api/system/metrics');
    return response.data;
  }
};

// NEW: Email API functions
export const emailAPI = {
  getEmailList: async () => {
    const response = await api.get('/api/email/list');
    return response.data;
  },

  updateEmailList: async (emails) => {
    const response = await api.post('/api/email/list', { emails });
    return response.data;
  },

  sendTestEmail: async () => {
    const response = await api.post('/api/email/test');
    return response.data;
  },

  getEmailConfig: async () => {
    const response = await api.get('/api/email/config');
    return response.data;
  },

  saveEmailConfig: async (configData) => {
    const response = await api.post('/api/email/config', configData);
    return response.data;
  },

  testConfiguration: async () => {
    const response = await api.get('/api/email/config/test');
    return response.data;
  },

  // Add to emailAPI:
getEmailGroups: async () => {
  const response = await api.get('/api/email/groups');
  return response.data;
},

createEmailGroup: async (groupData) => {
  const response = await api.post('/api/email/groups', groupData);
  return response.data;
},

updateEmailGroup: async (id, groupData) => {
  const response = await api.put(`/api/email/groups/${id}`, groupData);
  return response.data;
},

deleteEmailGroup: async (id) => {
  const response = await api.delete(`/api/email/groups/${id}`);
  return response.data;
},
};

// Add to your existing API exports:
export const urlAPI = {
  getAllUrls: async () => {
    const response = await api.get('/api/urls');
    return response.data;
  },

  addUrl: async (urlData) => {
    const response = await api.post('/api/urls', urlData);
    return response.data;
  },

  updateUrl: async (id, urlData) => {
    const response = await api.put(`/api/urls/${id}`, urlData);
    return response.data;
  },

  deleteUrl: async (id) => {
    const response = await api.delete(`/api/urls/${id}`);
    return response.data;
  },

  getUrlStatuses: async () => {
    const response = await api.get('/api/urls/statuses');
    return response.data;
  },

  getUrlStats: async () => {
    const response = await api.get('/api/urls/stats');
    return response.data;
  },

  checkUrl: async (id) => {
    const response = await api.post(`/api/urls/check/${id}`);
    return response.data;
  }
};

// Add this export with your other APIs
export const kubernetesAPI = {
  // Existing methods...
  getConfig: async () => {
    const response = await api.get('/api/kubernetes/config');
    return response.data;
  },

  // ENHANCED: Save config with thresholds
  saveConfig: async (configData) => {
    const response = await api.post('/api/kubernetes/config', configData);
    return response.data;
  },

  testConfig: async (configData) => {
    const response = await api.post('/api/kubernetes/config/test', configData);
    return response.data;
  },

  getPods: async (namespace = 'default') => {
    const response = await api.get(`/api/kubernetes/pods?namespace=${namespace}`);
    return response.data;
  },

  getAllPods: async () => {
    const response = await api.get('/api/kubernetes/pods/all');
    return response.data;
  },

  getNamespaces: async () => {
    const response = await api.get('/api/kubernetes/namespaces');
    return response.data;
  },

  getNodes: async () => {
    const response = await api.get('/api/kubernetes/nodes');
    return response.data;
  },

  getClusterInfo: async () => {
    const response = await api.get('/api/kubernetes/cluster-info');
    return response.data;
  },

  restartPod: async (namespace, podName) => {
    const response = await api.post(`/api/kubernetes/pods/${namespace}/${podName}/restart`);
    return response.data;
  },

  deletePod: async (namespace, podName, force = false) => {
    const response = await api.delete(`/api/kubernetes/pods/${namespace}/${podName}?force=${force}`);
    return response.data;
  },

  getPodLogs: async (namespace, podName, options = {}) => {
    const { container, lines = 100, follow = false } = options;
    const params = new URLSearchParams();
    
    if (container) params.append('container', container);
    params.append('lines', lines.toString());
    params.append('follow', follow.toString());
    
    const response = await api.get(`/api/kubernetes/pods/${namespace}/${podName}/logs?${params}`);
    return response.data;
  },

  execInPod: async (namespace, podName, options = {}) => {
    const { container, command = '/bin/bash' } = options;
    const response = await api.post(`/api/kubernetes/pods/${namespace}/${podName}/exec`, {
      container,
      command
    });
    return response.data;
  },

  scaleDeployment: async (namespace, deploymentName, replicas) => {
    const response = await api.post(`/api/kubernetes/deployments/${namespace}/${deploymentName}/scale`, {
      replicas: replicas
    });
    return response.data;
  },

  describePod: async (namespace, podName) => {
    const response = await api.get(`/api/kubernetes/pods/${namespace}/${podName}/describe`);
    return response.data;
  },

  getPodContainers: async (namespace, podName) => {
    const response = await api.get(`/api/kubernetes/pods/${namespace}/${podName}/containers`);
    return response.data;
  },

  getDeploymentInfo: async (namespace, podName) => {
    const response = await api.get(`/api/kubernetes/pods/${namespace}/${podName}/deployment`);
    return response.data;
  }
};

export const thresholdAPI = {
  // Existing database size threshold methods
  getDbSizeThreshold: async () => {
    const response = await api.get('/api/thresholds/db-size');
    return response.data;
  },

  saveDbSizeThreshold: async (thresholdData) => {
    const response = await api.post('/api/thresholds/db-size', thresholdData);
    return response.data;
  },

  // NEW: Database monitoring thresholds
  getDatabaseThresholds: async () => {
    const response = await api.get('/api/thresholds/database');
    return response.data;
  },

  saveDatabaseThresholds: async (thresholdData) => {
    const response = await api.post('/api/thresholds/database', thresholdData);
    return response.data;
  },

  // NEW: Kubernetes thresholds
  getKubernetesThresholds: async () => {
    const response = await api.get('/api/thresholds/kubernetes');
    return response.data;
  },

  saveKubernetesThresholds: async (thresholdData) => {
    const response = await api.post('/api/thresholds/kubernetes', thresholdData);
    return response.data;
  },

  // Get all thresholds
  getAllThresholds: async () => {
    const response = await api.get('/api/thresholds/all');
    return response.data;
  }
};


export const simpleScriptAPI = {
  // Execute a script
  executeScript: async (scriptData) => {
    try {
      console.log('🏃 Executing script:', scriptData);
      const response = await api.post('/api/execute-script', {
        scriptPath: scriptData.scriptPath,
        arguments: scriptData.arguments,
        name: scriptData.name
      }, {
        timeout: 300000 // 5 minutes timeout
      });
      
      console.log('✅ Script execution completed:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Script execution failed:', error);
      
      // Handle different error types
      if (error.code === 'ECONNABORTED') {
        throw new Error('Script execution timed out');
      } else if (error.response?.data) {
        // Server returned an error response
        throw new Error(error.response.data.error || 'Script execution failed');
      } else {
        throw new Error(`Network error: ${error.message}`);
      }
    }
  },

  // Validate script path
  validatePath: async (scriptPath) => {
    try {
      const response = await api.post('/api/validate-script-path', {
        scriptPath: scriptPath
      });
      return response.data;
    } catch (error) {
      console.error('Path validation error:', error);
      return {
        valid: false,
        error: 'Failed to validate path'
      };
    }
  }
};


export const databaseOperationsAPI = {
getStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/api/database/operations/status`);
    return response.json();
  },
  
  shutdown: async () => {
    const response = await fetch(`${API_BASE_URL}/api/database/operations/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  },
  
  startup: async () => {
    const response = await fetch(`${API_BASE_URL}/api/database/operations/startup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  },
  
  test: async () => {
    const response = await fetch(`${API_BASE_URL}/api/database/operations/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  },
  
  validate: async () => {
    const response = await fetch(`${API_BASE_URL}/api/database/operations/validate`);
    return response.json();
  },
  
  checkStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/api/database/operations/check-status`);
    return response.json();
  }
};


export const scriptAPI = {
  // Get all scripts from backend
  getAllScripts: async () => {
    const response = await api.get('/api/scripts');
    return response.data;
  },

  // Add new script to backend
  addScript: async (scriptData) => {
    const response = await api.post('/api/scripts', scriptData);
    return response.data;
  },

  // Update existing script
  updateScript: async (scriptId, scriptData) => {
    const response = await api.put(`/api/scripts/${scriptId}`, scriptData);
    return response.data;
  },

  // Delete script
  deleteScript: async (scriptId) => {
    const response = await api.delete(`/api/scripts/${scriptId}`);
    return response.data;
  }
};

export default api;