const winston = require('winston');
const fs = require('fs');
const path = require('path');

class LogService {
  constructor() {
    // Ensure logs directory exists
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: path.join(logsDir, 'downtime.log') 
        }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });

    this.downtimeEvents = [];
  }

  logDowntimeStart() {
    const event = {
      id: Date.now(),
      type: 'DOWN',
      timestamp: new Date(),
      status: 'ongoing'
    };
    
    this.downtimeEvents.push(event);
    this.logger.error('Database went DOWN', event);
    return event.id;
  }

  logDowntimeEnd(eventId) {
    const event = this.downtimeEvents.find(e => e.id === eventId);
    if (event) {
      event.endTime = new Date();
      event.status = 'resolved';
      event.duration = this.calculateDuration(event.timestamp, event.endTime);
      
      this.logger.info('Database came back UP', {
        ...event,
        type: 'UP'
      });
      
      return event.duration;
    }
    return null;
  }

  calculateDuration(start, end) {
    const diff = end - start;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  async getDowntimeLogs() {
    try {
      const logFile = path.join(__dirname, '../logs/downtime.log');
      if (!fs.existsSync(logFile)) {
        return [];
      }

      const data = fs.readFileSync(logFile, 'utf8');
      const lines = data.trim().split('\n').filter(line => line);
      
      return lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(log => log !== null);
    } catch (error) {
      console.error('Error reading logs:', error);
      return [];
    }
  }
}

module.exports = new LogService();