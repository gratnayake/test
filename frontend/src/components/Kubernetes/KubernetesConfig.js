// Enhanced KubernetesConfig.js with threshold settings

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
  SettingOutlined, 
  FolderOpenOutlined, 
  ExperimentOutlined,
  SaveOutlined,
  ClearOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  BellOutlined
} from '@ant-design/icons';
import { kubernetesAPI, emailAPI } from '../../services/api';
import { useMode } from '../../contexts/ModeContext';

const { Text } = Typography;
const { Option } = Select;

const KubernetesConfig = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [config, setConfig] = useState({});
  const [alert, setAlert] = useState({ type: '', message: '', visible: false });
  const [emailGroups, setEmailGroups] = useState([]);
  const { refreshMode } = useMode();

  useEffect(() => {
    loadConfig();
    loadEmailGroups();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await kubernetesAPI.getConfig();
      if (response.success) {
        setConfig(response.config);
        form.setFieldsValue({
          kubeconfigPath: response.config.kubeconfigPath,
          emailGroupId: response.config.emailGroupId,
          // Threshold settings
          monitoringEnabled: response.config.thresholds?.monitoringEnabled ?? true,
          podFailureThreshold: response.config.thresholds?.podFailureThreshold ?? 3,
          nodeDownThreshold: response.config.thresholds?.nodeDownThreshold ?? 1,
          namespaceAlertThreshold: response.config.thresholds?.namespaceAlertThreshold ?? 5,
          checkIntervalMinutes: response.config.thresholds?.checkIntervalMinutes ?? 2,
          alertCooldownMinutes: response.config.thresholds?.alertCooldownMinutes ?? 30,
          alertOnPodStops: response.config.thresholds?.alertOnPodStops ?? true,
          alertOnPodFailures: response.config.thresholds?.alertOnPodFailures ?? true,
          alertOnNodeIssues: response.config.thresholds?.alertOnNodeIssues ?? true
        });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
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
        kubeconfigPath: values.kubeconfigPath,
        emailGroupId: values.emailGroupId,
        thresholds: {
          monitoringEnabled: values.monitoringEnabled,
          podFailureThreshold: values.podFailureThreshold,
          nodeDownThreshold: values.nodeDownThreshold,
          namespaceAlertThreshold: values.namespaceAlertThreshold,
          checkIntervalMinutes: values.checkIntervalMinutes,
          alertCooldownMinutes: values.alertCooldownMinutes,
          alertOnPodStops: values.alertOnPodStops,
          alertOnPodFailures: values.alertOnPodFailures,
          alertOnNodeIssues: values.alertOnNodeIssues
        }
      };
      
      const response = await fetch('/api/kubernetes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });

      const data = await response.json();
      
      if (data.success) {
        setConfig(data.config);
        showAlert('success', 'Kubernetes configuration and thresholds saved successfully!');
        message.success('Configuration saved!');
        await refreshMode();
        setTimeout(() => loadConfig(), 1000);
      } else {
        showAlert('error', data.error || 'Failed to save configuration');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please fill in all required fields');
        return;
      }
      
      console.error('Save Kubernetes config error:', error);
      showAlert('error', `Failed to save configuration: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConfig = async () => {
    try {
      const values = await form.validateFields(['kubeconfigPath']);
      setTestLoading(true);
      
      const response = await kubernetesAPI.testConfig(values);
      
      if (response.success) {
        showAlert('success', response.message || 'Kubernetes connection test successful!');
        message.success('Connection test successful!');
      } else {
        showAlert('error', response.error || 'Connection test failed');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please enter the kubeconfig path');
        return;
      }
      
      console.error('Test Kubernetes config error:', error);
      showAlert('error', 'Connection test failed: ' + error.message);
    } finally {
      setTestLoading(false);
    }
  };

  const handleClearConfig = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/kubernetes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          kubeconfigPath: '',
          emailGroupId: null,
          thresholds: null
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setConfig({ kubeconfigPath: '', emailGroupId: null, isConfigured: false });
        form.resetFields();
        showAlert('success', 'Kubernetes configuration cleared successfully!');
        message.success('Configuration cleared!');
        await refreshMode();
      }
    } catch (error) {
      console.error('Clear config error:', error);
      showAlert('error', 'Failed to clear configuration: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={16}>
        <Card
          title={
            <Space>
              <SettingOutlined />
              Kubernetes Configuration
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
            <Divider orientation="left">Cluster Connection</Divider>

            <Form.Item
              name="kubeconfigPath"
              label="Kubeconfig File Path"
              rules={[{ required: false }]}
            >
              <Input 
                placeholder="e.g., E:\ifsroot\config\kube or /home/user/.kube/config"
                prefix={<FolderOpenOutlined />}
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="emailGroupId"
              label="Alert Email Group"
            >
              <Select 
                placeholder="Select email group for Kubernetes alerts"
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
              <Text style={{ marginLeft: 8 }}>Enable Kubernetes monitoring and alerts</Text>
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="podFailureThreshold"
                  label={
                    <Space>
                      <Text>Pod Failure Threshold</Text>
                      <Tooltip title="Number of pod failures before sending alert">
                        <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Required!' }]}
                >
                  <InputNumber
                    min={1}
                    max={20}
                    style={{ width: '100%' }}
                    placeholder="e.g., 3"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="namespaceAlertThreshold"
                  label={
                    <Space>
                      <Text>Namespace Stop Threshold</Text>
                      <Tooltip title="Number of pods that must disappear from a namespace to trigger alert">
                        <ExclamationCircleOutlined style={{ color: '#1890ff' }} />
                      </Tooltip>
                    </Space>
                  }
                  rules={[{ required: true, message: 'Required!' }]}
                >
                  <InputNumber
                    min={2}
                    max={50}
                    style={{ width: '100%' }}
                    placeholder="e.g., 5"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="nodeDownThreshold"
                  label={
                    <Space>
                      <Text>Node Down Threshold</Text>
                      <Tooltip title="Number of nodes that must be down before alerting">
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
                    placeholder="e.g., 1"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="checkIntervalMinutes"
                  label={
                    <Space>
                      <Text>Check Interval (minutes)</Text>
                      <Tooltip title="How often to check Kubernetes cluster status">
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
                    placeholder="e.g., 2"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="alertCooldownMinutes"
              label={
                <Space>
                  <Text>Alert Cooldown (minutes)</Text>
                  <Tooltip title="Minimum time between duplicate alerts for the same issue">
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
                placeholder="e.g., 30"
              />
            </Form.Item>         

            

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
                onClick={handleTestConfig}
                loading={testLoading}
              >
                Test Connection
              </Button>
              
              <Button 
                danger
                icon={<ClearOutlined />}
                onClick={handleClearConfig}
                loading={loading}
              >
                Clear Config
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
              <Text strong>Pod Failure Threshold</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Alert when X pods fail within the check interval. Recommended: 3-5 for small clusters, 5-10 for large clusters.
              </Text>
            </div>

            <div>
              <Text strong>Namespace Stop Threshold</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Alert when X pods disappear from a namespace (indicates stop/scale operations). Recommended: 2-5.
              </Text>
            </div>

            <div>
              <Text strong>Node Down Threshold</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Alert when X nodes are unavailable. Recommended: 1 for critical clusters.
              </Text>
            </div>

            <div>
              <Text strong>Check Interval</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                How often to scan the cluster. Recommended: 2-5 minutes for active monitoring.
              </Text>
            </div>

            <div>
              <Text strong>Alert Cooldown</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Prevents spam alerts. Recommended: 30-60 minutes for most issues.
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
            </Space>
          </Card>
        )}
      </Col>
    </Row>
  );
};

export default KubernetesConfig;