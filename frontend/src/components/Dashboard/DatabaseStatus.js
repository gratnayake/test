import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Button, Typography, message } from 'antd';
import { DatabaseOutlined, ReloadOutlined } from '@ant-design/icons';
import DowntimeTable from './DowntimeTable';

const { Title } = Typography;

const DatabaseStatus = () => {
  const [dbStatus, setDbStatus] = useState('online');

  // Simulate database status check
  useEffect(() => {
    const interval = setInterval(() => {
      const isOnline = Math.random() > 0.1;
      setDbStatus(isOnline ? 'online' : 'offline');
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    message.info('Status refreshed');
    // In the future, this will trigger a real database check
  };

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card 
            title="Current Status"
            extra={
              <Button 
                icon={<ReloadOutlined />} 
                onClick={handleRefresh}
              >
                Refresh
              </Button>
            }
          >
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <DatabaseOutlined 
                style={{ 
                  fontSize: 72, 
                  color: dbStatus === 'online' ? '#52c41a' : '#ff4d4f',
                  marginBottom: 16 
                }} 
              />
              <Title level={2} style={{ 
                color: dbStatus === 'online' ? '#52c41a' : '#ff4d4f',
                margin: 0 
              }}>
                {dbStatus === 'online' ? 'DATABASE ONLINE' : 'DATABASE OFFLINE'}
              </Title>
              <p style={{ marginTop: 8, color: '#666' }}>
                Last checked: {new Date().toLocaleTimeString()}
              </p>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Connection Details">
            <div style={{ padding: '20px 0' }}>
              <p><strong>Host:</strong> oracle-prod.company.com</p>
              <p><strong>Port:</strong> 1521</p>
              <p><strong>Service:</strong> ORCL</p>
              <p><strong>Response Time:</strong> 2.3ms</p>
              <p><strong>Last Downtime:</strong> 2024-01-15 09:30:15</p>
              <p><strong>Uptime:</strong> 99.8%</p>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="Downtime History">
        <DowntimeTable />
      </Card>
    </div>
  );
};

export default DatabaseStatus;