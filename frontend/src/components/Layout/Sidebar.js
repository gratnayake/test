import React from 'react';
import { Layout, Menu } from 'antd';
import { 
  DashboardOutlined, 
  DatabaseOutlined, 
  UserOutlined, 
  SettingOutlined,
  LineChartOutlined,
  ClockCircleOutlined,
  MailOutlined,
  MonitorOutlined,
  DesktopOutlined,
  CloudOutlined,
  GlobalOutlined,
  AlertOutlined,
  CodeOutlined,
  HeartOutlined
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import ModeFlag from './ModeFlag';
import { useMode } from '../../contexts/ModeContext';

const { Sider } = Layout;

const Sidebar = ({ currentPage, onPageChange }) => {
  const { isAdmin } = useAuth();
  const { isDarkMode } = useTheme();
  const { isServerMode } = useMode();

  // CLIENT MODE MENU ITEMS - Only URL monitoring
  const clientModeItems = [
    {
      key: 'url-monitoring',
      icon: <GlobalOutlined />,
      label: 'URL Monitoring',
    },
  ];

  // SERVER MODE ITEMS - Full feature set
  const serverModeItems = [
    {
      key: 'realtime-dashboard',
      icon: <MonitorOutlined />,
      label: 'Real-time Monitor',
    },
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard Details',
    },   
    {
      key: 'system-metrics',
      icon: <DesktopOutlined />,
      label: 'System Performance',
    },
    {
      key: 'kubernetes',
      icon: <CloudOutlined />,
      label: 'Kubernetes Pods',
    },
    {
      key: 'url-monitoring',
      icon: <GlobalOutlined />,
      label: 'URL Monitoring',
    },
    {
      key: 'script-manager',
      icon: <CodeOutlined />,
      label: 'Cluster & DB Control',
    },
  ];

  // BUILD MENU BASED ON MODE
  const menuItems = isServerMode 
    ? serverModeItems 
    : clientModeItems;

  // ADMIN SECTIONS - Available in both modes but with different options
  if (isAdmin) {
    menuItems.push(
      {
        type: 'divider',
      },
      {
        key: 'admin-section',
        label: 'Administration',
        type: 'group',
      }
    );

    // SERVER MODE ADMIN OPTIONS
    if (isServerMode) {
      menuItems.push(
        {
          key: 'database-config',
          icon: <SettingOutlined />,
          label: 'Database Config',
        }
      );
    }

    // ADMIN OPTIONS AVAILABLE IN BOTH MODES
    menuItems.push(
      {
        key: 'email-config',
        icon: <MailOutlined />,
        label: 'Email Config',
      },
      {
        key: 'users',
        icon: <UserOutlined />,
        label: 'User Management',
      },      
      {
        key: 'system-heartbeat',
        icon: <HeartOutlined />,
        label: 'System Heartbeat',
      },
      {
        key: 'kubernetes-config',
        icon: <SettingOutlined />,
        label: 'Kubernetes Config',
      }
    );
  }

  // STYLING
  const siderStyle = {
    background: isDarkMode ? '#141414' : '#f0f2f5',
    boxShadow: isDarkMode 
      ? '2px 0 8px 0 rgba(29, 35, 41, 0.05)' 
      : '2px 0 6px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.3s ease',
    borderRight: isDarkMode ? '1px solid #303030' : '1px solid #e8e8e8'
  };

  const logoStyle = {
    color: isDarkMode ? 'white' : '#262626',
    padding: '20px 16px',
    textAlign: 'center',
    borderBottom: isDarkMode ? '1px solid #303030' : '1px solid #e8e8e8',
    background: isDarkMode ? '#141414' : '#ffffff',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  };

  return (
    <Sider width={250} style={siderStyle}>
      <div style={logoStyle}>
        <div style={{ 
          fontWeight: 600, 
          color: isDarkMode ? '#ffffff' : '#262626',
          fontSize: '16px',
          transition: 'color 0.3s ease',
          letterSpacing: '0.02em'
        }}>
          Uptime WatchDog
        </div>
        <div style={{
          fontSize: '12px',
          color: isDarkMode ? '#8c8c8c' : '#8c8c8c'          
        }}>
          {isServerMode ? 'Database Monitoring System' : 'URL & Script Monitoring'}
        </div>
        <ModeFlag />
      </div>
      
      <Menu
        theme={isDarkMode ? 'dark' : 'light'}
        mode="inline"
        selectedKeys={[currentPage]}
        onClick={({ key }) => onPageChange(key)}
        items={menuItems}
        style={{
          marginTop: 8,
          background: isDarkMode ? '#141414' : '#f0f2f5',
          border: 'none',
          transition: 'all 0.3s ease',
          fontSize: '14px'
        }}
      />
    </Sider>
  );
};

export default Sidebar;