const si = require('systeminformation');

class SystemMonitoringService {
  constructor() {
    this.cachedMetrics = null;
    this.lastUpdate = null;
    this.cacheTimeout = 5000; // 5 seconds cache
  }

  async getSystemMetrics() {
    // Return cached data if fresh
    if (this.cachedMetrics && this.lastUpdate && 
        (Date.now() - this.lastUpdate) < this.cacheTimeout) {
      return this.cachedMetrics;
    }

    try {
      const [cpu, memory, disk, network, load] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.currentLoad()
      ]);

      const metrics = {
        timestamp: new Date(),
        cpu: {
          model: cpu.manufacturer + ' ' + cpu.brand,
          cores: cpu.cores,
          speed: cpu.speed,
          usage: Math.round(load.currentLoad)
        },
        memory: {
          total: Math.round(memory.total / 1024 / 1024 / 1024), // GB
          used: Math.round(memory.used / 1024 / 1024 / 1024), // GB
          free: Math.round(memory.free / 1024 / 1024 / 1024), // GB
          usage: Math.round((memory.used / memory.total) * 100)
        },
        disk: disk.map(d => ({
          mount: d.mount,
          total: Math.round(d.size / 1024 / 1024 / 1024), // GB
          used: Math.round(d.used / 1024 / 1024 / 1024), // GB
          usage: Math.round(d.use)
        })),
        network: network.length > 0 ? {
          interface: network[0].iface,
          rx: Math.round(network[0].rx_bytes / 1024 / 1024), // MB
          tx: Math.round(network[0].tx_bytes / 1024 / 1024)  // MB
        } : null,
        uptime: Math.round(process.uptime())
      };

      this.cachedMetrics = metrics;
      this.lastUpdate = Date.now();
      return metrics;

    } catch (error) {
      console.error('Failed to get system metrics:', error);
      throw error;
    }
  }
}

module.exports = new SystemMonitoringService();