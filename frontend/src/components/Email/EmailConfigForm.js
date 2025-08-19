import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  Space, 
  Alert, 
  Row, 
  Col, 
  Typography,
  message,
  Divider
} from 'antd';
import { 
  MailOutlined, 
  SaveOutlined, 
  CheckCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { emailAPI } from '../../services/api';

const { Title, Text } = Typography;

const EmailConfigForm = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [alert, setAlert] = useState({ type: '', message: '', visible: false });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await emailAPI.getEmailConfig();
      
      if (response.success) {
        setConfig(response.config);
        form.setFieldsValue({
          host: response.config.host,
          port: response.config.port,
          user: response.config.user,
          password: '' // Don't show existing password
        });
      }
    } catch (error) {
      console.error('Failed to load email config:', error);
      showAlert('error', 'Failed to load email configuration');
    } finally {
      setLoading(false);
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
      
      const response = await emailAPI.saveEmailConfig(values);
      
      if (response.success) {
        setConfig(response.config);
        showAlert('success', 'Email configuration saved successfully!');
        message.success('Email configuration saved!');
        
        setTimeout(() => {
          loadConfig();
        }, 1000);
      } else {
        showAlert('error', 'Failed to save email configuration');
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('Please fill in all required fields');
        return;
      }
      
      console.error('Save email config error:', error);
      const errorMessage = error.response?.data?.error || error.message;
      showAlert('error', `Failed to save configuration: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConfig = async () => {
    try {
      setTestLoading(true);
      const response = await emailAPI.testConfiguration();
      
      if (response.success) {
        showAlert('success', 'Email configuration test successful!');
        message.success('Email configuration is valid!');
      } else {
        showAlert('error', `Configuration test failed: ${response.error}`);
      }
    } catch (error) {
      console.error('Test email config error:', error);
      showAlert('error', 'Configuration test failed: ' + error.message);
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
              <SettingOutlined />
              Email Server Configuration
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
            initialValues={{
              port: 587
            }}
          >
            <Row gutter={16}>
              <Col span={16}>
                <Form.Item
                  name="host"
                  label="SMTP Host"
                  rules={[{ required: true, message: 'Please enter SMTP host!' }]}
                >
                  <Input 
                    placeholder="e.g., smtp.gmail.com, smtp.office365.com"
                    prefix={<MailOutlined />}
                    size="large"
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="port"
                  label="Port"
                  rules={[{ required: true, message: 'Please enter port!' }]}
                >
                  <Input 
                    type="number"
                    placeholder="587"
                    size="large"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="user"
              label="Email Address"
              rules={[
                { required: true, message: 'Please enter email address!' },
                { type: 'email', message: 'Please enter valid email address!' }
              ]}
            >
              <Input 
                placeholder="your-email@company.com"
                prefix={<MailOutlined />}
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Email Password / App Password"
              rules={[{ required: true, message: 'Please enter password!' }]}
            >
              <Input.Password 
                placeholder="Email password or app-specific password"
                size="large"
                iconRender={visible => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
              />
            </Form.Item>

            <Divider />

            <Form.Item style={{ marginBottom: 0 }}>
              <Space size="large">
                <Button 
                  type="default"
                  icon={<CheckCircleOutlined />}
                  onClick={handleTestConfig}
                  loading={testLoading}
                  size="large"
                >
                  Test Configuration
                </Button>
                <Button 
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  loading={loading}
                  size="large"
                >
                  Save Configuration
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={8}>
        <Card title="Configuration Status">
          {config ? (
            <div>
              <Alert
                message={config.isConfigured ? "✅ Email Configured" : "⚠️ Email Not Configured"}
                type={config.isConfigured ? "success" : "warning"}
                showIcon
                style={{ marginBottom: 16 }}
              />

              {config.isConfigured && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <Text strong>SMTP Host:</Text>
                    <br />
                    <Text>{config.host}:{config.port}</Text>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <Text strong>Email Address:</Text>
                    <br />
                    <Text>{config.user}</Text>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <Text strong>Config File:</Text>
                    <br />
                    <Text code style={{ fontSize: '11px' }}>
                      backend/data/email-config.json
                    </Text>
                  </div>

                  <div>
                    <Text strong>Last Updated:</Text>
                    <br />
                    <Text style={{ fontSize: '12px' }}>
                      {new Date(config.lastUpdated).toLocaleString()}
                    </Text>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <MailOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
              <Text type="secondary">No configuration found</Text>
            </div>
          )}
        </Card>

        <Card title="SMTP Examples" style={{ marginTop: 16 }}>
          <div style={{ fontSize: '12px' }}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Gmail:</Text>
              <br />
              <Text code>smtp.gmail.com:587</Text>
            </div>

            <div style={{ marginBottom: 8 }}>
              <Text strong>Outlook:</Text>
              <br />
              <Text code>smtp.office365.com:587</Text>
            </div>

            <div style={{ marginBottom: 8 }}>
              <Text strong>Yahoo:</Text>
              <br />
              <Text code>smtp.mail.yahoo.com:587</Text>
            </div>
          </div>
        </Card>
      </Col>
    </Row>
  );
};

export default EmailConfigForm;