// Enhanced DatabaseConfig.js with threshold settings - COMPLETE VERSION

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  Space, 
  Alert, 
  Select, 
  Typography,
  message,
  Divider,
  InputNumber,
  Switch,
  Row,
  Col,
  Tooltip
} from 'antd';
import { 
  DatabaseOutlined, 
  SaveOutlined, 
  ExperimentOutlined,
  BellOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  LockOutlined,
  UserOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import { databaseAPI, emailAPI } from '../../services/api';

const { Text } = Typography;
const { Option } = Select;
const { Password } = Input;

const DatabaseConfig = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [config, setConfig] = useState({});
  const [alert, setAlert] = useState({ type: '', message: '', visible: false });
  const [emailGroups, setEmailGroups] = useState([]);

  useEffect(() => {
    loadConfig();
    loadEmailGroups();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await databaseAPI.getConfig();
      if (response.success) {
        setConfig(response.config);
        form.setFieldsValue({
          host: response.config.host,
          port: response.config.port,
          serviceName: response.config.serviceName,
          username: response.config.username,
          password: response.config.password,
          emailGroupId: response.config.emailGroupId,
          // Threshold settings
          monitoringEnabled: response.config.thresholds?.monitoringEnabled ?? true,
          connectionTimeoutSeconds: response.config.thresholds?.connectionTimeoutSeconds ?? 30,
          checkIntervalMinutes: response.config.thresholds?.checkIntervalMinutes ?? 1,
          alertCooldownMinutes: response.config.thresholds?.alertCooldownMinutes ?? 15,
          retryAttempts: response.config.thresholds?.retryAttempts ?? 3,
          minDatabaseSizeGB: response.config.thresholds?.minDatabaseSizeGB ?? 5,
          maxTablespaceUsagePercent: response.config.thresholds?.maxTablespaceUsagePercent ?? 90,
          alertOnConnectionLoss: response.config.thresholds?.alertOnConnectionLoss ?? true,
          alertOnSizeThreshold: response.config.thresholds?.alertOnSizeThreshold ?? true,
          alertOnTablespaceUsage: response.config.thresholds?.alertOnTablespaceUsage ?? true,
          alertOnSlowQueries: response.config.thresholds?.alertOnSlowQueries ?? false,
          slowQueryThresholdSeconds: response.config.thresholds?.slowQueryThresholdSeconds ?? 10
        });
      }
    } catch (error) {
      console.error('Failed to load database config:', error);
    }
  };

  const loadEmailGroups = async () => {
    try {
      const response = await emailAPI.getEmailGroups();
      if (response.success) {
        setEmailGroups(response.data.filter(group => group.enabled));
      }
    } catch (error) {
      console.error('Failed to load email groups:', error);
    }
  };

  const showAlert = (type, message) => {
    setAlert({ type, message, visible: true });
    setTimeout(() => {
      setAlert({ ...alert, visible: false });
    }, 5000);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      // Prepare config data with thresholds
      const configData = {
        host: values.host,
        port: values.port,
        serviceName: values.serviceName,
        username: values.username,
        password: values.password,
        emailGroupId: values.emailGroupId,
        thresholds: {
          monitoringEnabled: values.monitoringEnabled,
          connectionTimeoutSeconds: values.connectionTimeoutSeconds,
          checkIntervalMinutes: values.checkIntervalMinutes,
          alertCooldownMinutes: values.alertCooldownMinutes,
          retryAttempts: values.retryAttempts,
          minDatabaseSizeGB: values.minDatabaseSizeGB,
          maxTablespaceUsagePercent: values.maxTablespaceUsagePercent,
          alertOnConnectionLoss: values.alertOnConnectionLoss,
          alertOnSizeThreshold: values.alertOnSizeThreshold,
          alertOnTablespaceUsage: values.alertOnTablespaceUsage,
          alertOnSlowQueries: values.alertOnSlowQueries,
          slowQueryThresholdSeconds: values.slowQueryThresholdSeconds
        }
      };
      
      const response = await databaseAPI.saveConfig(configData);
      
      if (response.success) {
        setConfig(response.config);
        showAlert('success', 'Database configuration and thresholds saved successfully!');
        message.success('Configuration saved!');
        setTimeout(() => loadConfig(), 1000);
      } else {
        showAlert('error', response.error || 'Failed to save configuration');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please fill in all required fields');
        return;
      }
      
      console.error('Save database config error:', error);
      showAlert('error', `Failed to save configuration: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields(['host', 'port', 'serviceName', 'username', 'password']);
      setTestLoading(true);
      
      const response = await databaseAPI.testConnection(values);
      
      if (response.success) {
        showAlert('success', 'Database connection test successful!');
        message.success('Connection test successful!');
      } else {
        showAlert('error', response.error || 'Connection test failed');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please fill in all connection fields');
        return;
      }
      
      console.error('Test database connection error:', error);
      showAlert('error', 'Connection test failed: ' + error.message);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={16}>
        <Card
          title={
            <Space>
              <DatabaseOutlined />
              Database Configuration
            </Space>
          }
          loading={loading}
        >
          {alert.visible && (
            <Alert
              message={alert.message}
              type={alert.type}
              style={{ marginBottom: 16 }}
              closable
              onClose={() => setAlert({ ...alert, visible: false })}
            />
          )}

          <Form
            form={form}
            layout="vertical"
          >
            <Divider orientation="left">Database Connection</Divider>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="host"
                  label="Database Host"
                  rules={[{ required: true, message: 'Host is required!' }]}
                >
                  <Input 
                    placeholder="e.g., localhost or 192.168.1.100"
                    prefix={<GlobalOutlined />}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="port"
                  label="Port"
                  rules={[{ required: true, message: 'Port is required!' }]}
                >
                  <InputNumber
                    min={1}
                    max={65535}
                    style={{ width: '100%' }}
                    placeholder="e.g., 1521"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="serviceName"
              label="Service Name / Database"
              rules={[{ required: true, message: 'Service name is required!' }]}
            >
              <Input 
                placeholder="e.g., ORCL or your database name"
                prefix={<DatabaseOutlined />}
              />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="username"
                  label="Username"
                  rules={[{ required: true, message: 'Username is required!' }]}
                >
                  <Input 
                    placeholder="Database username"
                    prefix={<UserOutlined />}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="password"
                  label="Password"
                  rules={[{ required: true, message: 'Password is required!' }]}
                >
                  <Password 
                    placeholder="Database password"
                    prefix={<LockOutlined />}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="emailGroupId"
              label="Alert Email Group"
            >
              <Select 
                placeholder="Select email group for database alerts"
                allowClear
              >
                {emailGroups.map(group => (
                  <Option key={group.id} value={group.id}>
                    {group.name} ({group.emails.length} recipients)
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Divider orientation="left">
              <Space>
                <BellOutlined />
                Monitoring Thresholds
              </Space>
            </Divider>

            <Form.Item
              name="monitoringEnabled"
              valuePropName="checked"
            >
              <Switch 
                checkedChildren="Enabled" 
                unCheckedChildren="Disabled"
              />
              <Text style={{ marginLeft: 8 }}>Enable database monitoring and alerts</Text>
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="connectionTimeoutSeconds"
                  label={
                    <Space>
                      <Text>Connection Timeout (seconds)</Text>
                      <Tooltip title="How long to wait for database connection before marking as failed">
                        <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Required!' }]}
                >
                  <InputNumber
                    min={5}
                    max={300}
                    style={{ width: '100%' }}
                    placeholder="e.g., 30"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="checkIntervalMinutes"
                  label={
                    <Space>
                      <Text>Check Interval (minutes)</Text>
                      <Tooltip title="How often to check database connectivity">
                        <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Required!' }]}
                >
                  <InputNumber
                    min={1}
                    max={60}
                    style={{ width: '100%' }}
                    placeholder="e.g., 1"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="retryAttempts"
                  label={
                    <Space>
                      <Text>Retry Attempts</Text>
                      <Tooltip title="Number of connection retries before alerting">
                        <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Required!' }]}
                >
                  <InputNumber
                    min={1}
                    max={10}
                    style={{ width: '100%' }}
                    placeholder="e.g., 3"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="alertCooldownMinutes"
                  label={
                    <Space>
                      <Text>Alert Cooldown (minutes)</Text>
                      <Tooltip title="Minimum time between duplicate alerts">
                        <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Required!' }]}
                >
                  <InputNumber
                    min={5}
                    max={1440}
                    style={{ width: '100%' }}
                    placeholder="e.g., 15"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="minDatabaseSizeGB"
                  label={
                    <Space>
                      <Text>Min Database Size (GB)</Text>
                      <Tooltip title="Alert when database size falls below this threshold">
                        <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Required!' }]}
                >
                  <InputNumber
                    min={0.1}
                    step={0.1}
                    style={{ width: '100%' }}
                    placeholder="e.g., 5.0"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="maxTablespaceUsagePercent"
                  label={
                    <Space>
                      <Text>Max Tablespace Usage (%)</Text>
                      <Tooltip title="Alert when any tablespace exceeds this usage percentage">
                        <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Required!' }]}
                >
                  <InputNumber
                    min={50}
                    max={99}
                    style={{ width: '100%' }}
                    placeholder="e.g., 90"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="slowQueryThresholdSeconds"
              label={
                <Space>
                  <Text>Slow Query Threshold (seconds)</Text>
                  <Tooltip title="Alert when queries take longer than this time">
                    <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                  </Tooltip>
                </Space>
              }
              rules={[{ required: true, message: 'Required!' }]}
            >
              <InputNumber
                min={1}
                max={300}
                style={{ width: '100%' }}
                placeholder="e.g., 10"
              />
            </Form.Item>

            <Divider orientation="left">Alert Types</Divider>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="alertOnConnectionLoss"
                  valuePropName="checked"
                >
                  <Switch size="small" />
                  <Text style={{ marginLeft: 8 }}>Connection Loss</Text>
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="alertOnSizeThreshold"
                  valuePropName="checked"
                >
                  <Switch size="small" />
                  <Text style={{ marginLeft: 8 }}>Size Threshold</Text>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="alertOnTablespaceUsage"
                  valuePropName="checked"
                >
                  <Switch size="small" />
                  <Text style={{ marginLeft: 8 }}>Tablespace Usage</Text>
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="alertOnSlowQueries"
                  valuePropName="checked"
                >
                  <Switch size="small" />
                  <Text style={{ marginLeft: 8 }}>Slow Queries</Text>
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            <Space>
              <Button 
                type="primary" 
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={loading}
              >
                Save Configuration
              </Button>
              
              <Button 
                icon={<ExperimentOutlined />}
                onClick={handleTestConnection}
                loading={testLoading}
              >
                Test Connection
              </Button>
            </Space>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        <Card
          title={
            <Space>
              <WarningOutlined />
              Threshold Guide
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>Connection Timeout</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                How long to wait for DB response. Recommended: 30 seconds for local, 60+ for remote databases.
              </Text>
            </div>

            <div>
              <Text strong>Check Interval</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                How often to ping the database. Recommended: 1-2 minutes for critical systems.
              </Text>
            </div>

            <div>
              <Text strong>Retry Attempts</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Number of retries before alerting. Recommended: 3 attempts to avoid false positives.
              </Text>
            </div>

            <div>
              <Text strong>Database Size</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Alert when database shrinks unexpectedly. Set based on your normal database size.
              </Text>
            </div>

            <div>
              <Text strong>Tablespace Usage</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Alert when tablespaces get full. Recommended: 85-90% to allow time for action.
              </Text>
            </div>

            <div>
              <Text strong>Alert Cooldown</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Prevents alert spam. Recommended: 15-30 minutes for most database issues.
              </Text>
            </div>
          </Space>
        </Card>

        {config.isConfigured && (
          <Card
            title="Current Status"
            style={{ marginTop: 16 }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>Connection: </Text>
                <Text type="success">Configured</Text>
              </div>
              <div>
                <Text strong>Monitoring: </Text>
                <Text type={config.thresholds?.monitoringEnabled ? "success" : "warning"}>
                  {config.thresholds?.monitoringEnabled ? "Enabled" : "Disabled"}
                </Text>
              </div>
              <div>
                <Text strong>Email Alerts: </Text>
                <Text type={config.emailGroupId ? "success" : "warning"}>
                  {config.emailGroupId ? "Configured" : "Not Set"}
                </Text>
              </div>
              <div>
                <Text strong>Check Interval: </Text>
                <Text>{config.thresholds?.checkIntervalMinutes || 1} minute(s)</Text>
              </div>
              <div>
                <Text strong>Size Threshold: </Text>
                <Text>{config.thresholds?.minDatabaseSizeGB || 5} GB</Text>
              </div>
            </Space>
          </Card>
        )}
      </Col>
    </Row>
  );
};

export default DatabaseConfig;