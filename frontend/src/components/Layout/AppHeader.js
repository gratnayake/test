import React from 'react';
import { Layout, Typography, Space, Avatar, Button } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';

const { Header } = Layout;
const { Title } = Typography;

const AppHeader = ({ title }) => {
  const { currentUser, logout } = useAuth();
  const { isDarkMode } = useTheme();

  const headerStyle = {
    background: isDarkMode ? '#141414' : '#ffffff',
    padding: '0 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: isDarkMode 
      ? '0 2px 8px 0 rgba(0, 0, 0, 0.15)' 
      : '0 1px 4px rgba(0,21,41,.08)',
    borderBottom: isDarkMode ? '1px solid #303030' : '1px solid #f0f0f0',
    transition: 'all 0.3s ease'
  };

  const titleStyle = {
    margin: 0,
    color: isDarkMode ? '#ffffff' : '#262626',
    fontWeight: 600,
    fontSize: '18px'
  };

  const userNameStyle = {
    color: isDarkMode ? '#ffffff' : '#262626',
    fontSize: '14px',
    fontWeight: 500
  };

  return (
    <Header style={headerStyle}>
      <Title level={4} style={titleStyle}>
        {title}
      </Title>
      
      <Space size="middle">
        <ThemeToggle />
        <Avatar 
          icon={<UserOutlined />} 
          style={{ 
            backgroundColor: '#1677ff',
            color: '#ffffff'
          }}
        />
        <span style={userNameStyle}>
          {currentUser?.firstName} {currentUser?.lastName}
        </span>
        <Button 
          type="text" 
          icon={<LogoutOutlined />} 
          onClick={logout}
          style={{
            color: isDarkMode ? '#ffffff' : '#262626',
            borderRadius: '6px'
          }}
        >
          Logout
        </Button>
      </Space>
    </Header>
  );
};

export default AppHeader;