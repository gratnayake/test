import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Progress, Typography } from 'antd';
import { 
  DesktopOutlined, 
   DatabaseOutlined as MemoryIcon, 
  HddOutlined, 
  WifiOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { systemAPI } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';


const { Text } = Typography;


const SystemMetrics = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const { isDarkMode } = useTheme();
  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const response = await systemAPI.getMetrics();
      if (response.success) {
        setMetrics(response.data);
      }
    } catch (error) {
      console.error('Failed to load system metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  if (!metrics) return <div>Loading system metrics...</div>;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="CPU Usage"
              value={metrics.cpu.usage}
              suffix="%"
              valueStyle={{ color: metrics.cpu.usage > 80 ? '#ff4d4f' : '#52c41a' }}
              prefix={<DesktopOutlined />}
            />
            <Progress percent={metrics.cpu.usage} size="small" />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {metrics.cpu.cores} cores @ {metrics.cpu.speed}GHz
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Memory Usage"
              value={metrics.memory.usage}
              suffix="%"
              valueStyle={{ color: metrics.memory.usage > 80 ? '#ff4d4f' : '#52c41a' }}
              prefix={<MemoryIcon  />}
            />
            <Progress percent={metrics.memory.usage} size="small" />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {metrics.memory.used}GB / {metrics.memory.total}GB
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Server Uptime"
              value={formatUptime(metrics.uptime)}
              prefix={<ClockCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Process uptime
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Network"
              value={metrics.network?.rx || 0}
              suffix="MB"
              prefix={<WifiOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              RX: {metrics.network?.rx || 0}MB, TX: {metrics.network?.tx || 0}MB
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Disk Usage */}
      <Card title="Disk Usage">
        <Row gutter={[16, 16]}>
          {metrics.disk.map((disk, index) => (
            <Col xs={24} sm={12} md={8} key={index}>
              <Card size="small">
                <div style={{ marginBottom: 8 }}>
                  <Text strong>{disk.mount}</Text>
                  <Text style={{ float: 'right' }}>{disk.usage}%</Text>
                </div>
                <Progress 
                  percent={disk.usage} 
                  status={disk.usage > 90 ? 'exception' : 'normal'}
                  strokeColor={disk.usage > 90 ? '#ff4d4f' : '#52c41a'}
                  trailColor={isDarkMode ? '#434343' : '#f5f5f5'}
                />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {disk.used}GB / {disk.total}GB
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
};

export default SystemMetrics;