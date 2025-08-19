import React from 'react';
import { Card, Form, Input, Button, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeToggle from '../Layout/ThemeToggle';

const { Title } = Typography;

const LoginForm = () => {
  const { login, loading, backendStatus, checkBackendConnection } = useAuth();
  const { isDarkMode } = useTheme();
  const [form] = Form.useForm();

  const handleSubmit = async (values) => {
    const result = await login(values);
    if (result.success) {
      form.resetFields();
    }
  };

  const containerStyle = {
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: isDarkMode 
      ? 'linear-gradient(135deg, #000000 0%, #141414 100%)'
      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    position: 'relative',
    transition: 'background 0.3s ease'
  };

  const cardStyle = {
    width: 420,
    boxShadow: isDarkMode 
      ? '0 8px 32px rgba(0,0,0,0.6)'
      : '0 8px 32px rgba(0,0,0,0.1)',
    background: isDarkMode ? '#141414' : '#ffffff',
    border: isDarkMode ? '1px solid #303030' : 'none',
    borderRadius: '12px'
  };

  const titleStyle = {
    margin: 0,
    color: isDarkMode ? '#ffffff' : '#262626'
  };

  const subtitleStyle = {
    color: isDarkMode ? '#a6a6a6' : '#666',
    marginTop: 8
  };

  return (
    <div style={containerStyle}>
      {/* Theme Toggle in top-right corner */}
      <div style={{ 
        position: 'absolute', 
        top: 20, 
        right: 20 
      }}>
        <ThemeToggle size="large" type="default" />
      </div>

      <Card style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <DatabaseOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 16 }} />
          <Title level={2} style={titleStyle}>Uptime WatchDog</Title>
          <p style={subtitleStyle}>Database Monitoring System</p>
        </div>
        
        {/* Backend Status */}
        {/*<Alert
          message={`Backend Status: ${backendStatus}`}
          type={backendStatus === 'connected' ? 'success' : 'warning'}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={checkBackendConnection}>
              Test
            </Button>
          }
        />
        
        <Alert
          message="Demo Credentials"
          description={
            <div>
              <div><strong>Admin:</strong> admin / admin123</div>
              <div><strong>Note:</strong> Real user management with JSON storage</div>
            </div>
          }
          type="info"
          style={{ marginBottom: 24 }}
        />*/}
        
        <Form
          form={form}
          name="login"
          onFinish={handleSubmit}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Please enter your username!' }]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="Username" 
            />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password!' }]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="Password" 
            />
          </Form.Item>
          
          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              style={{ width: '100%' }}
              loading={loading}
              disabled={backendStatus !== 'connected'}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: isDarkMode ? '#8c8c8c' : '#666',
        fontSize: '12px'
        }}>
  © 2025 Tsunami Solutions. All rights reserved.
</div>
    </div>
  );
};

export default LoginForm;