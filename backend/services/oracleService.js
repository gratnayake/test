const oracledb = require('oracledb');

class OracleService {
  constructor() {
    this.config = {
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PORT}/${process.env.ORACLE_SERVICE}`
    };
    this.connection = null;
  }

  async connect() {
    try {
      this.connection = await oracledb.getConnection(this.config);
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  async disconnect() {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  async checkConnection() {
    try {
      if (!this.connection) {
        const connected = await this.connect();
        if (!connected) return false;
      }
      
      // Simple query to test connection
      const result = await this.connection.execute('SELECT 1 FROM DUAL');
      return result.rows.length > 0;
    } catch (error) {
      console.error('Connection check failed:', error);
      return false;
    }
  }

  async getTablespaceInfo() {
    try {
      const query = `
        SELECT 
          tablespace_name,
          ROUND(used_space * 8192 / 1024 / 1024, 2) as used_mb,
          ROUND(tablespace_size * 8192 / 1024 / 1024, 2) as total_mb,
          ROUND((used_space / tablespace_size) * 100, 2) as usage_percent
        FROM dba_tablespace_usage_metrics
        WHERE tablespace_name NOT LIKE '%TEMP%'
        ORDER BY usage_percent DESC
      `;
      
      const result = await this.connection.execute(query);
      return result.rows.map(row => ({
        name: row[0],
        used: row[1],
        total: row[2],
        percentage: row[3]
      }));
    } catch (error) {
      console.error('Failed to get tablespace info:', error);
      return [];
    }
  }
}

module.exports = new OracleService();