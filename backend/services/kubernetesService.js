// backend/services/kubernetesService.js - Fixed with proper environment setup

const k8s = require('@kubernetes/client-node');
const kubernetesConfigService = require('./kubernetesConfigService');
const fs = require('fs');

class KubernetesService {
  constructor() {
    this.kc = new k8s.KubeConfig();
    this.k8sApi = null;
    this.isConfigured = false;
    this.lastError = null;
    this.initializeKubernetesClient();
  }

  initializeKubernetesClient() {
    try {
      const config = kubernetesConfigService.getConfig();
      
      if (!config.isConfigured || !config.kubeconfigPath) {
        console.log('⚠️ Kubernetes not configured - no kubeconfig path set');
        this.isConfigured = false;
        return;
      }

      // Check if kubeconfig file exists
      if (!fs.existsSync(config.kubeconfigPath)) {
        console.log(`❌ Kubeconfig file not found: ${config.kubeconfigPath}`);
        this.isConfigured = false;
        this.lastError = `Kubeconfig file not found: ${config.kubeconfigPath}`;
        return;
      }

      console.log(`🔧 Setting KUBECONFIG environment variable: ${config.kubeconfigPath}`);
      
      // SET THE ENVIRONMENT VARIABLE - This is what was missing!
      process.env.KUBECONFIG = config.kubeconfigPath;
      
      // Now load the kubeconfig
      this.kc.loadFromDefault();
      this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
      
      this.isConfigured = true;
      this.lastError = null;
      
      console.log('✅ Kubernetes client initialized with kubeconfig');
      console.log(`📂 Using kubeconfig: ${config.kubeconfigPath}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Kubernetes client:', error);
      this.isConfigured = false;
      this.lastError = error.message;
    }
  }

  getPodStatus(pod) {
    const phase = pod.status?.phase?.toLowerCase() || 'unknown';
    const conditions = pod.status?.conditions || [];
    const containerStatuses = pod.status?.containerStatuses || [];
    
    // Check for terminating pods (THIS IS KEY!)
    if (pod.metadata?.deletionTimestamp) {
      return 'Terminating';
    }
    
    // Check container states
    for (const container of containerStatuses) {
      if (container.state?.terminated) {
        return container.state.terminated.reason || 'Terminated';
      }
      if (container.state?.waiting && container.state.waiting.reason !== 'ContainerCreating') {
        return container.state.waiting.reason || 'Waiting';
      }
    }
    
    // Map phase to status
    switch (phase) {
      case 'running':
        // Check if all containers are ready
        const allReady = containerStatuses.every(c => c.ready);
        return allReady ? 'Running' : 'Not Ready';
      case 'succeeded':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      case 'unknown':
        return 'Unknown';
      default:
        return phase.charAt(0).toUpperCase() + phase.slice(1);
    }
  }
  // Refresh configuration if settings changed
  refreshConfiguration() {
    console.log('🔄 Refreshing Kubernetes configuration...');
    this.initializeKubernetesClient();
  }

  async testConnection() {
    if (!this.isConfigured) {
      return {
        success: false,
        error: this.lastError || 'Kubernetes client not configured',
        method: 'client_check'
      };
    }

    try {
      console.log('🧪 Testing Kubernetes connection...');
      
      // Set environment variable again to ensure it's current
      const config = kubernetesConfigService.getConfig();
      process.env.KUBECONFIG = config.kubeconfigPath;
      
      const startTime = Date.now();
      const result = await this.k8sApi.listNode();
      const responseTime = Date.now() - startTime;
      
      let nodeData = result.items || result.body?.items || result.data?.items;
      const nodeCount = nodeData ? nodeData.length : 0;
      
      console.log(`✅ Kubernetes connection successful - found ${nodeCount} nodes`);
      
      return {
        success: true,
        message: `Kubernetes connection successful - found ${nodeCount} nodes`,
        nodeCount: nodeCount,
        responseTime: `${responseTime}ms`,
        method: 'node_list'
      };
    } catch (error) {
      console.error(`❌ Kubernetes connection test failed: ${error.message}`);
      return {
        success: false,
        error: `Kubernetes test failed: ${error.message}`,
        method: 'node_list'
      };
    }
  }

  async getPods(namespace = 'default') {
    if (!this.isConfigured) {
      throw new Error('Kubernetes client not configured');
    }

    // Validate namespace parameter
    if (!namespace || namespace === null || namespace === undefined || namespace === 'null') {
      console.log('⚠️ No namespace provided, using default');
      namespace = 'default';
    }

    // Handle 'all' namespace selection from frontend
    if (namespace === 'all') {
      console.log('🔍 Fetching pods from all namespaces...');
      return this.getAllPods();
    }

    try {
      console.log(`🔍 Fetching pods from namespace: ${namespace}`);
      
      const config = kubernetesConfigService.getConfig();
      process.env.KUBECONFIG = config.kubeconfigPath;
      
      const response = await this.k8sApi.listNamespacedPod(namespace);
      
      let podData = response.items || response.body?.items || response.data?.items;
      
      if (!podData) {
        console.log('Pod response structure:', Object.keys(response));
        return [];
      }

      const pods = podData.map(pod => ({
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: this.getPodStatus(pod), // USE THE NEW METHOD HERE TOO!
        ready: this.getPodReadyStatus(pod),
        restarts: this.getPodRestarts(pod),
        age: this.calculateAge(pod.metadata.creationTimestamp),
        node: pod.spec.nodeName,
        containers: pod.spec.containers.map(container => ({
          name: container.name,
          image: container.image,
          ready: this.getContainerStatus(pod, container.name)
        })),
        // Add deletion timestamp
        deletionTimestamp: pod.metadata.deletionTimestamp || null
      }));

      console.log(`✅ Retrieved ${pods.length} pods from namespace: ${namespace}`);
      return pods;

    } catch (error) {
      console.error(`❌ Failed to get pods from namespace ${namespace}:`, error);
      
      // Handle specific errors
      if (error.message.includes('Forbidden')) {
        throw new Error(`Access denied to namespace '${namespace}'. Check your permissions.`);
      } else if (error.message.includes('not found')) {
        throw new Error(`Namespace '${namespace}' not found.`);
      } else {
        throw new Error(`Failed to get pods: ${error.message}`);
      }
    }
  }

async getAllPodsWithContainers() {
  if (!this.isConfigured) {
    throw new Error('Kubernetes client not configured');
  }

  try {
    console.log('🔍 Fetching pods with container details...');
    
    const config = kubernetesConfigService.getConfig();
    process.env.KUBECONFIG = config.kubeconfigPath;
    
    const response = await this.k8sApi.listPodForAllNamespaces();
    
    let podData = response.items || response.body?.items || response.data?.items;
    
    if (!podData) {
      console.log('All pods response structure:', Object.keys(response));
      return [];
    }

    const pods = podData.map(pod => {
      // Get container statuses
      const containerStatuses = pod.status.containerStatuses || [];
      const containers = pod.spec.containers.map(container => {
        const status = containerStatuses.find(cs => cs.name === container.name);
        return {
          name: container.name,
          image: container.image,
          ready: status ? status.ready : false,
          restartCount: status ? status.restartCount : 0,
          state: status ? this.getContainerState(status) : 'Unknown'
        };
      });

      // Calculate overall readiness
      const readyContainers = containers.filter(c => c.ready).length;
      const totalContainers = containers.length;
      const readinessRatio = `${readyContainers}/${totalContainers}`;

      return {
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: pod.status.phase,
        ready: readinessRatio, // Use ratio instead of boolean
        restarts: this.getPodRestarts(pod),
        age: this.calculateAge(pod.metadata.creationTimestamp),
        node: pod.spec.nodeName,
        labels: pod.metadata.labels || {},
        containers: containers,
        readyContainers: readyContainers,
        totalContainers: totalContainers,
        readinessRatio: readinessRatio
      };
    });

    console.log(`✅ Retrieved ${pods.length} pods with container details`);
    return pods;

  } catch (error) {
    console.error('❌ Failed to get pods with containers:', error);
    throw new Error(`Failed to get all pods: ${error.message}`);
  }
}

  

  getContainerState(containerStatus) {
    if (containerStatus.state.running) return 'Running';
    if (containerStatus.state.waiting) return `Waiting: ${containerStatus.state.waiting.reason || 'Unknown'}`;
    if (containerStatus.state.terminated) return `Terminated: ${containerStatus.state.terminated.reason || 'Unknown'}`;
    return 'Unknown';
  }

  async getAllPods() {
    if (!this.isConfigured) {
      throw new Error('Kubernetes client not configured');
    }

    try {
      console.log('🔍 Fetching pods from all namespaces...');
      
      const config = kubernetesConfigService.getConfig();
      process.env.KUBECONFIG = config.kubeconfigPath;
      
      const response = await this.k8sApi.listPodForAllNamespaces();
      
      let podData = response.items || response.body?.items || response.data?.items;
      
      if (!podData) {
        console.log('All pods response structure:', Object.keys(response));
        return [];
      }

      const pods = podData.map(pod => ({
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: this.getPodStatus(pod), // USE THE NEW METHOD HERE!
        ready: this.getPodReadyStatus(pod),
        restarts: this.getPodRestarts(pod),
        age: this.calculateAge(pod.metadata.creationTimestamp),
        node: pod.spec.nodeName,
        labels: pod.metadata.labels || {},
        // Add deletion timestamp for monitoring service
        deletionTimestamp: pod.metadata.deletionTimestamp || null
      }));

      console.log(`✅ Retrieved ${pods.length} pods from all namespaces`);
      return pods;

    } catch (error) {
      console.error('❌ Failed to get all pods:', error);
      throw new Error(`Failed to get all pods: ${error.message}`);
    }
  }

  async getNamespaces() {
    if (!this.isConfigured) {
      throw new Error('Kubernetes client not configured');
    }

    try {
      console.log('🔍 Fetching namespaces...');
      
      // Ensure environment variable is set
      const config = kubernetesConfigService.getConfig();
      process.env.KUBECONFIG = config.kubeconfigPath;
      
      const response = await this.k8sApi.listNamespace();
      
      let namespaceData = response.items || response.body?.items || response.data?.items;
      
      if (!namespaceData) {
        console.log('Namespace response structure:', Object.keys(response));
        return [];
      }
      
      const namespaces = namespaceData.map(ns => ({
        name: ns.metadata.name,
        status: ns.status.phase,
        age: this.calculateAge(ns.metadata.creationTimestamp)
      }));

      console.log(`✅ Retrieved ${namespaces.length} namespaces`);
      return namespaces;
    } catch (error) {
      console.error('Failed to get namespaces:', error);
      throw error;
    }
  }

  async getNodes() {
    if (!this.isConfigured) {
      throw new Error('Kubernetes client not configured');
    }

    try {
      console.log('🔍 Fetching nodes...');
      
      // Ensure environment variable is set
      const config = kubernetesConfigService.getConfig();
      process.env.KUBECONFIG = config.kubeconfigPath;
      
      const response = await this.k8sApi.listNode();
      
      let nodeData = response.items || response.body?.items || response.data?.items;
      
      if (!nodeData) {
        console.log('Node response structure:', Object.keys(response));
        return [];
      }
      
      const nodes = nodeData.map(node => ({
        name: node.metadata.name,
        status: this.getNodeStatus(node),
        roles: this.getNodeRoles(node),
        version: node.status.nodeInfo.kubeletVersion,
        age: this.calculateAge(node.metadata.creationTimestamp),
        capacity: {
          cpu: node.status.capacity.cpu,
          memory: node.status.capacity.memory,
          pods: node.status.capacity.pods
        }
      }));

      console.log(`✅ Retrieved ${nodes.length} nodes`);
      return nodes;
    } catch (error) {
      console.error('Failed to get nodes:', error);
      throw error;
    }
  }

  getPodReadyStatus(pod) {
    const containerStatuses = pod.status.containerStatuses || [];
    const readyContainers = containerStatuses.filter(status => status.ready).length;
    const totalContainers = containerStatuses.length;
    
    // Return the ratio format that matches kubectl output
    return `${readyContainers}/${totalContainers}`;
  }

  getPodRestarts(pod) {
    const containerStatuses = pod.status.containerStatuses || [];
    return containerStatuses.reduce((total, status) => total + status.restartCount, 0);
  }

  getContainerStatus(pod, containerName) {
    const containerStatuses = pod.status.containerStatuses || [];
    const status = containerStatuses.find(s => s.name === containerName);
    return status ? status.ready : false;
  }

  getNodeStatus(node) {
    const conditions = node.status.conditions || [];
    const readyCondition = conditions.find(c => c.type === 'Ready');
    return readyCondition && readyCondition.status === 'True' ? 'Ready' : 'NotReady';
  }

  getNodeRoles(node) {
    const labels = node.metadata.labels || {};
    const roles = [];
    
    if (labels['node-role.kubernetes.io/master'] !== undefined || 
        labels['node-role.kubernetes.io/control-plane'] !== undefined) {
      roles.push('master');
    }
    if (labels['node-role.kubernetes.io/worker'] !== undefined) {
      roles.push('worker');
    }
    
    return roles.length > 0 ? roles : ['worker'];
  }

  calculateAge(timestamp) {
    const now = new Date();
    const created = new Date(timestamp);
    const diffMs = now - created;
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  async getClusterInfo() {
    if (!this.isConfigured) {
      return { configured: false, error: 'Kubernetes client not configured. Please set the kubeconfig path first.' };
    }

    try {
      // Ensure environment variable is set
      const config = kubernetesConfigService.getConfig();
      process.env.KUBECONFIG = config.kubeconfigPath;
      
      const [pods, nodes, namespaces] = await Promise.all([
        this.getAllPods(),
        this.getNodes(),
        this.getNamespaces()
      ]);

      const podStats = {
        total: pods.length,
        running: pods.filter(p => p.status === 'Running').length,
        pending: pods.filter(p => p.status === 'Pending').length,
        failed: pods.filter(p => p.status === 'Failed').length,
        succeeded: pods.filter(p => p.status === 'Succeeded').length
      };

      const nodeStats = {
        total: nodes.length,
        ready: nodes.filter(n => n.status === 'Ready').length,
        notReady: nodes.filter(n => n.status === 'NotReady').length
      };

      return {
        configured: true,
        timestamp: new Date(),
        pods: podStats,
        nodes: nodeStats,
        namespaces: namespaces.length
      };
    } catch (error) {
      console.error('Failed to get cluster info:', error);
      return { configured: false, error: error.message };
    }
  }
}

module.exports = new KubernetesService();