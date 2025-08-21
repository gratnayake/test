import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Switch, 
  InputNumber, 
  Select, 
  Button, 
  Space, 
  Alert, 
  Typography, 
  Row, 
  Col,
  Statistic,
  Input,
  Divider,
  message,
  Badge,
  Tooltip
} from 'antd';
import { 
  HeartOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SendOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const SystemHeartbeatConfig = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [emailGroups, setEmailGroups] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [configResponse, statusResponse, groupsResponse] = await Promise.allSettled([
        fetch('/api/system/heartbeat/config'),
        fetch('/api/system/heartbeat/status'),
        fetch('/api/email/groups')
      ]);

      if (configResponse.status === 'fulfilled' && configResponse.value.ok) {
        const configData = await configResponse.value.json();
        setConfig(configData.data);
        form.setFieldsValue(configData.data);
      }

      if (statusResponse.status === 'fulfilled' && statusResponse.value.ok) {
        const statusData = await statusResponse.value.json();
        setStatus(statusData.data);
      }

      if (groupsResponse.status === 'fulfilled' && groupsResponse.value.ok) {
        const groupsData = await groupsResponse.value.json();
        setEmailGroups(groupsData.data || []);
      }
    } catch (error) {
      console.error('Failed to load heartbeat data:', error);
      message.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values) => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/system/heartbeat/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      const data = await response.json();
      
      if (data.success) {
        message.success('Heartbeat configuration saved successfully!');
        setConfig(data.data);
        await loadData(); // Refresh status
      } else {
        message.error(`Failed to save configuration: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      message.error('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/system/heartbeat/start', {
        method: 'POST'
      });

      const data = await response.json();
      
      if (data.success) {
        message.success('Heartbeat started successfully!');
        await loadData();
      } else {
        message.error(`Failed to start heartbeat: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to start heartbeat:', error);
      message.error('Failed to start heartbeat');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/system/heartbeat/stop', {
        method: 'POST'
      });

      const data = await response.json();
      
      if (data.success) {
        message.success('Heartbeat stopped successfully!');
        await loadData();
      } else {
        message.error(`Failed to stop heartbeat: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to stop heartbeat:', error);
      message.error('Failed to stop heartbeat');
    } finally {
      setLoading(false);
    }
  };

  const handleTestHeartbeat = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/system/heartbeat/test', {
        method: 'POST'
      });

      const data = await response.json();
      
      if (data.success) {
        message.success('Test heartbeat sent successfully!');
      } else {
        message.error(`Failed to send test heartbeat: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to send test heartbeat:', error);
      message.error('Failed to send test heartbeat');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    if (!status) return 'default';
    return status.isRunning ? 'success' : 'default';
  };

  const getStatusText = () => {
    if (!status) return 'Unknown';
    return status.isRunning ? 'Running' : 'Stopped';
  };

  const formatLastHeartbeat = () => {
    if (!status?.lastHeartbeat) return 'Never';
    return new Date(status.lastHeartbeat).toLocaleString();
  };

  const getIntervalText = (minutes) => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours}h ${remainingMinutes}m`;
  };

  if (!config) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <HeartOutlined style={{ fontSize: '48px', color: '#ccc' }} />
        <div style={{ marginTop: '16px' }}>Loading heartbeat configuration...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <HeartOutlined style={{ color: '#ff6b7d' }} />
          System Heartbeat Monitor
        </Title>
        <Text type="secondary">
          Sends regular "I'm alive" emails to verify system operation
        </Text>
      </div>

      {/* Status Overview */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Heartbeat Status"
              value={getStatusText()}
              prefix={
                <Badge 
                  status={getStatusColor()} 
                  style={{ marginRight: '8px' }}
                />
              }
              valueStyle={{ 
                color: status?.isRunning ? '#52c41a' : '#8c8c8c',
                fontSize: '18px'
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Interval"
              value={config.intervalMinutes ? getIntervalText(config.intervalMinutes) : 'Not Set'}
              prefix={<SettingOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Sent"
              value={status?.heartbeatCount || 0}
              prefix={<SendOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Last Heartbeat"
              value={formatLastHeartbeat()}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ fontSize: '14px' }}
            />
          </Card>
        </Col>
      </Row>

      {/* SIMPLIFIED: Only Start/Stop buttons - No Enable Toggle */}
      <Card style={{ marginBottom: '24px' }}>
        <Space>
          <Button
            type="primary"
            icon={status?.isRunning ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={status?.isRunning ? handleStop : handleStart}
            loading={loading}
            size="large"
          >
            {status?.isRunning ? 'Stop Heartbeat' : 'Start Heartbeat'}
          </Button>
          <Button
            icon={<SendOutlined />}
            onClick={handleTestHeartbeat}
            loading={loading}
            disabled={!config.emailGroupId}
            size="large"
          >
            Send Test Heartbeat
          </Button>
          <Button
            icon={<SettingOutlined />}
            onClick={loadData}
            loading={loading}
            size="large"
          >
            Refresh Status
          </Button>
        </Space>
      </Card>

      {/* Configuration Form */}
      <Card title="Heartbeat Configuration">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            // REMOVED: enabled field - heartbeat is controlled only by start/stop buttons
            intervalMinutes: 60,
            includeSystemStats: true,
            includeHealthSummary: true,
            customMessage: '',
            alertThresholds: {
              maxResponseTime: 5000,
              minUptimeMinutes: 5,
              criticalMemoryMB: 1000,
              maxErrorCount: 5
            }
          }}
        >
          <Row gutter={[24, 0]}>
            <Col span={12}>              
              <Form.Item
                name="intervalMinutes"
                label={
                  <Space>
                    Heartbeat Interval
                    <Tooltip title="How often to send heartbeat emails (minimum 5 minutes)">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                rules={[
                  { required: true, message: 'Please set an interval!' },
                  { type: 'number', min: 5, message: 'Minimum interval is 5 minutes' }
                ]}
              >
                <Select
                  style={{ width: '100%' }}
                  placeholder="Select interval"
                  suffixIcon={<SettingOutlined />}
                >
                  <Option value={5}>5 minutes</Option>
                  <Option value={15}>15 minutes</Option>
                  <Option value={30}>30 minutes</Option>
                  <Option value={60}>1 hour</Option>
                  <Option value={120}>2 hours</Option>
                  <Option value={240}>4 hours</Option>
                  <Option value={480}>8 hours</Option>
                  <Option value={720}>12 hours</Option>
                  <Option value={1440}>24 hours</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="emailGroupId"
                label="Email Group"
                rules={[{ required: true, message: 'Please select an email group!' }]}
              >
                <Select
                  placeholder="Select email group for heartbeat alerts"
                  allowClear
                >
                  {emailGroups.map(group => (
                    <Option key={group.id} value={group.id}>
                      <Space>
                        <Badge 
                          status={group.enabled ? 'success' : 'default'} 
                        />
                        {group.name} ({group.emails.length} recipients)
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="includeSystemStats"
                label="Include System Statistics"
                valuePropName="checked"
              >
                <Switch 
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                />
              </Form.Item>

              <Form.Item
                name="includeHealthSummary"
                label="Include Health Summary"
                valuePropName="checked"
              >
                <Switch 
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                />
              </Form.Item>

              <Form.Item
                name="customMessage"
                label="Custom Message (Optional)"
              >
                <TextArea
                  rows={3}
                  placeholder="Add a custom message to include in heartbeat emails..."
                  showCount
                  maxLength={500}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          
          
          

          <Alert
            message="Heartbeat Information"
            description={
              <div>
                <p><strong>Purpose:</strong> Sends regular emails to verify the system is running and healthy.</p>
                <p><strong>Content:</strong> System uptime, memory usage, service health, and any issues detected.</p>
                <p><strong>Threshold Alerts:</strong> Warnings are included if system metrics exceed configured thresholds.</p>
                <p><strong>Control:</strong> Use the Start/Stop Heartbeat buttons above to control monitoring. Configuration changes are applied immediately.</p>
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: '24px' }}
          />

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                icon={<HeartOutlined />}
                size="large"
              >
                Save Configuration
              </Button>
              <Button 
                onClick={() => form.resetFields()}
                disabled={loading}
                size="large"
              >
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* Current Configuration Display - SIMPLIFIED: No enabled status */}
      {config && (
        <Card title="Current Configuration" style={{ marginTop: '24px' }}>
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Text strong>Interval: </Text>
              <Text>{getIntervalText(config.intervalMinutes)}</Text>
            </Col>
            <Col span={8}>
              <Text strong>Email Group: </Text>
              <Text>
                {emailGroups.find(g => g.id == config.emailGroupId)?.name || 'Not configured'}
              </Text>
            </Col>
            <Col span={8}>
              <Text strong>System Stats: </Text>
              <Text>{config.includeSystemStats ? 'Included' : 'Excluded'}</Text>
            </Col>
          </Row>
          
          <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
            <Col span={8}>
              <Text strong>Health Summary: </Text>
              <Text>{config.includeHealthSummary ? 'Included' : 'Excluded'}</Text>
            </Col>
            <Col span={8}>
              <Text strong>Custom Message: </Text>
              <Text>{config.customMessage ? 'Set' : 'None'}</Text>
            </Col>
            <Col span={8}>
              {config.lastSent && (
                <>
                  <Text strong>Last Sent: </Text>
                  <Text>{new Date(config.lastSent).toLocaleString()}</Text>
                </>
              )}
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
};

export default SystemHeartbeatConfig;