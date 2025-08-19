import React, { useState, useEffect } from 'react';
import { 
  Row, 
  Col, 
  Card, 
  Button, 
  Typography, 
  Space, 
  Alert, 
  Statistic, 
  Tag, 
  Progress,
  message,
  Switch,
  Tooltip
} from 'antd';
import { 
  DatabaseOutlined, 
  ReloadOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { Line } from '@ant-design/plots';
import { databaseAPI, monitoringAPI } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext'

const { Title, Text } = Typography;

const RealtimeDashboard = () => {
  const [dbStatus, setDbStatus] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [tablespaceData, setTablespaceData] = useState([]);
  const [monitoringStatus, setMonitoringStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { isDarkMode } = useTheme();

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadRealtimeData();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadDatabaseStatus(),
        loadDashboardData(),
        loadTablespaceData(),
        loadMonitoringStatus()
      ]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRealtimeData = async () => {
    try {
      await Promise.all([
        loadDatabaseStatus(),
        loadMonitoringStatus()
      ]);
    } catch (error) {
      console.error('Failed to load realtime data:', error);
    }
  };

  const loadDatabaseStatus = async () => {
    try {
      const response = await databaseAPI.getStatus();
      if (response.success) {
        setDbStatus(response);
      }
    } catch (error) {
      console.error('Failed to load database status:', error);
    }
  };

  const loadDashboardData = async () => {
    try {
      const response = await databaseAPI.getDashboard();
      if (response.success) {
        setDashboardData(response.data);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const loadTablespaceData = async () => {
    try {
      const response = await databaseAPI.getTablespace();
      if (response.success) {
        setTablespaceData(response.data);
      }
    } catch (error) {
      console.error('Failed to load tablespace data:', error);
    }
  };

  const loadMonitoringStatus = async () => {
    try {
      const response = await monitoringAPI.getStatus();
      if (response.success) {
        setMonitoringStatus(response.status);
      }
    } catch (error) {
      console.error('Failed to load monitoring status:', error);
    }
  };

  const handleStartMonitoring = async () => {
    try {
      const response = await monitoringAPI.start();
      if (response.success) {
        message.success('Monitoring started successfully!');
        setMonitoringStatus(response.status);
      } else {
        message.error(response.error || 'Failed to start monitoring');
      }
    } catch (error) {
      message.error('Failed to start monitoring: ' + error.message);
    }
  };

  const handleStopMonitoring = async () => {
    try {
      const response = await monitoringAPI.stop();
      if (response.success) {
        message.success('Monitoring stopped successfully!');
        setMonitoringStatus(response.status);
      } else {
        message.error(response.error || 'Failed to stop monitoring');
      }
    } catch (error) {
      message.error('Failed to stop monitoring: ' + error.message);
    }
  };

  const handleForceCheck = async () => {
    try {
      const response = await monitoringAPI.forceCheck();
      if (response.success) {
        message.success('Manual check completed!');
        await loadRealtimeData();
      }
    } catch (error) {
      message.error('Failed to perform manual check: ' + error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'UP': return '#52c41a';
      case 'DOWN': return '#ff4d4f';
      case 'NOT_CONFIGURED': return '#fa8c16';
      default: return '#d9d9d9';
    }
  };

  const getTablespaceChart = () => {
    if (!tablespaceData.length) return null;

    const chartData = tablespaceData.map(ts => ({
      name: ts.name,
      usage: ts.usagePercent,
      type: 'Used Space %'
    }));

    const config = {
        data: chartData,
        xField: 'name',
        yField: 'usage',
        seriesField: 'type',
        color: ({ usage }) => {
            if (usage > 90) return '#ff4d4f';
            if (usage > 75) return '#fa8c16';
            return '#52c41a';
        },
        point: {
            size: 5,
            shape: 'diamond',
        },
        // Add theme configuration for dark mode
        theme: isDarkMode ? 'dark' : 'light',
        // Add axis styling for dark mode
        xAxis: {
            label: {
            style: {
                fill: isDarkMode ? '#ffffff' : '#000000',
            },
            },
        },
        yAxis: {
            label: {
            style: {
                fill: isDarkMode ? '#ffffff' : '#000000',
            },
            },
        },
        };

    return <Line {...config} />;
  };

  return (
    <div>
      {loading && (
      <Alert
        message="Loading Database Information"
        description="Database response is slow, please wait... This may take up to 60 seconds."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />
    )}
      {/* Real-time Status Header */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Space direction="vertical" size="small">
              <Title level={3} style={{ margin: 0 }}>
                <DatabaseOutlined style={{ marginRight: 8 }} />
                Database Status
              </Title>
              <Tag 
                color={dbStatus ? getStatusColor(dbStatus.status) : 'default'}
                style={{ fontSize: '14px', padding: '4px 12px' }}
              >
                {dbStatus?.status || 'UNKNOWN'}
              </Tag>
            </Space>
          </Col>
          
          <Col xs={24} sm={12} md={8}>
            <Space direction="vertical" size="small">
              <Text strong>Monitoring Status</Text>
              <Space>
                <Switch 
                  checked={monitoringStatus?.isMonitoring}
                  onChange={monitoringStatus?.isMonitoring ? handleStopMonitoring : handleStartMonitoring}
                  checkedChildren="ON"
                  unCheckedChildren="OFF"
                />
                <Text type="secondary">
                  {monitoringStatus?.isMonitoring ? 'Active' : 'Stopped'}
                </Text>
              </Space>
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={handleForceCheck}
                type="primary"
              >
                Check Now
              </Button>
              <Tooltip title="Auto-refresh every 5 seconds">
                <Switch 
                  checked={autoRefresh}
                  onChange={setAutoRefresh}
                  size="small"
                />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Status Alerts */}
      {dbStatus?.isDown && (
        <Alert
          message="Database is Currently DOWN"
          description={`Last checked: ${new Date(dbStatus.timestamp).toLocaleString()}`}
          type="error"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {!monitoringStatus?.isMonitoring && (
        <Alert
          message="Monitoring is Stopped"
          description="Automatic database monitoring is not running. Start monitoring to receive real-time alerts."
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
          action={
            <Button size="small" onClick={handleStartMonitoring}>
              Start Monitoring
            </Button>
          }
        />
      )}

      {/* Real-time Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Database Status"
              value={dbStatus?.status || 'Unknown'}
              valueStyle={{ 
                color: dbStatus ? getStatusColor(dbStatus.status) : '#d9d9d9' 
              }}
              prefix={<DatabaseOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Response Time: {dbStatus?.responseTime || 'N/A'}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Uptime"
              value={dashboardData?.instance?.uptimeDays || 0}
              precision={1}
              suffix="days"
              valueStyle={{ color: '#52c41a' }}
              prefix={<ClockCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {dashboardData?.instance?.uptimeFormatted || 'N/A'}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Sessions"
              value={dashboardData?.sessions?.activeSessions || 0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<CheckCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Total: {dashboardData?.sessions?.totalSessions || 0}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="DB Size"
              value={dashboardData?.size?.totalSizeGB || 0}
              precision={2}
              suffix="GB"
              valueStyle={{ color: '#722ed1' }}
              prefix={<BarChartOutlined />}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Oracle Database
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Database Details */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="Database Information" loading={loading}>
            {dashboardData ? (
              <div>
                <p><strong>Version:</strong> {dashboardData.version?.version || 'Unknown'}</p>
                <p><strong>Instance:</strong> {dashboardData.instance?.instanceName || 'Unknown'}</p>
                <p><strong>Host:</strong> {dashboardData.instance?.hostName || 'Unknown'}</p>
                <p><strong>Status:</strong> {dashboardData.instance?.status || 'Unknown'}</p>
                <p><strong>Started:</strong> {
                  dashboardData.instance?.startupTime 
                    ? new Date(dashboardData.instance.startupTime).toLocaleString()
                    : 'Unknown'
                }</p>
              </div>
            ) : (
              <Text type="secondary">Database information not available</Text>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Monitoring Details">
            {monitoringStatus ? (
              <div>
                <p><strong>Status:</strong> 
                  <Tag color={monitoringStatus.isMonitoring ? 'green' : 'red'}>
                    {monitoringStatus.isMonitoring ? 'ACTIVE' : 'STOPPED'}
                  </Tag>
                </p>
                <p><strong>Current DB Status:</strong> 
                  <Tag color={monitoringStatus.lastStatus === 'UP' ? 'green' : 'red'}>
                    {monitoringStatus.lastStatus || 'UNKNOWN'}
                  </Tag>
                </p>
                <p><strong>Check Frequency:</strong> Every minute</p>
                <p><strong>Total Checks:</strong> {monitoringStatus.totalChecks || 0}</p>
                {monitoringStatus.isCurrentlyDown && (
                  <p><strong>Downtime Started:</strong> 
                    {monitoringStatus.downtimeStartTime 
                      ? new Date(monitoringStatus.downtimeStartTime).toLocaleString()
                      : 'Unknown'
                    }
                  </p>
                )}
              </div>
            ) : (
              <Text type="secondary">Monitoring status not available</Text>
            )}
          </Card>
        </Col>
      </Row>

      
    </div>
  );
};

export default RealtimeDashboard;