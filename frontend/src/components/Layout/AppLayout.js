// Update your frontend/src/components/Layout/AppLayout.js
// Replace the problematic useEffect and CLIENT MODE ROUTING section:

import React, { useState, useEffect  } from 'react';
import { Layout } from 'antd';
import Sidebar from './Sidebar';
import AppHeader from './AppHeader';
import Dashboard from '../Dashboard/Dashboard';
import DatabaseStatus from '../Dashboard/DatabaseStatus';
import RealtimeDashboard from '../Dashboard/RealtimeDashboard';
import EnhancedDowntimeTable from '../Dashboard/EnhancedDowntimeTable';
import DatabaseConfig from '../Database/DatabaseConfig';
import EmailManagement from '../Email/EmailManagement';
import UserManagement from '../Users/UserManagement';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import SystemMetrics from '../System/SystemMetrics';
import KubernetesMonitor from '../Kubernetes/KubernetesMonitor';
import UrlMonitoring from '../Urls/UrlMonitoring';
import KubernetesConfig from '../Kubernetes/KubernetesConfig';
import { useMode } from '../../contexts/ModeContext'; 
import DbSizeThreshold from '../Thresholds/DbSizeThreshold';
import SimpleScriptManager from '../Scripts/SimpleScriptManager';
import SystemHeartbeatConfig from '../System/SystemHeartbeatConfig';

const { Content, Footer } = Layout;

const AppLayout = () => {
  const { isServerMode } = useMode();
  const [currentPage, setCurrentPage] = useState(isServerMode ? 'realtime-dashboard' : 'url-monitoring');
  const { isAdmin } = useAuth();
  const { isDarkMode } = useTheme();  
  const { loading: modeLoading } = useMode();

  // FIXED: Better logic for page validation that doesn't force redirects
  useEffect(() => {
    if (!modeLoading && !isServerMode) {
      // Define allowed pages for client mode
      const allowedClientPages = [
        'url-monitoring',
        'kubernetes-config',
        'email-config',    // ✅ Allow email config in client mode
        'users'            // ✅ Allow user management in client mode
      ];
      
      // Only redirect if current page is not allowed AND user is not admin
      // OR if page is not allowed at all
      if (!allowedClientPages.includes(currentPage)) {
        console.log(`Page ${currentPage} not allowed in client mode, redirecting to url-monitoring`);
        setCurrentPage('url-monitoring');
      }
    }
  }, [isServerMode, modeLoading]); // Removed currentPage dependency to prevent loops

  const renderContent = () => {
    if (modeLoading) {
      return <div>Loading...</div>;
    }

    // CLIENT MODE ROUTING - FIXED: Allow admin pages for admins
    if (!isServerMode) {
      switch (currentPage) {
        case 'url-monitoring':
          return <UrlMonitoring />;
        case 'kubernetes-config':
          return isAdmin ? <KubernetesConfig /> : <UrlMonitoring />;
        case 'email-config':
          // ✅ FIXED: Always show EmailManagement for admins in client mode
          return isAdmin ? <EmailManagement /> : <UrlMonitoring />;
        case 'users':
          // ✅ FIXED: Always show UserManagement for admins in client mode  
          return isAdmin ? <UserManagement /> : <UrlMonitoring />;
        default:
          return <UrlMonitoring />;
      }
    }
    
    // SERVER MODE ROUTING - Full options (unchanged)
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'realtime-dashboard':
        return <RealtimeDashboard />;
      case 'database':
        return <DatabaseStatus />;
      case 'downtime-logs':
        return <EnhancedDowntimeTable />;
      case 'database-config':
        return isAdmin ? <DatabaseConfig /> : <RealtimeDashboard />;
      case 'email-config':
         return isAdmin ? <EmailManagement /> : <RealtimeDashboard />;
      case 'users':
        return isAdmin ? <UserManagement /> : <RealtimeDashboard />;
      case 'system-metrics':
        return <SystemMetrics />;
      case 'kubernetes':
        return <KubernetesMonitor />;
      case 'url-monitoring':
        return <UrlMonitoring />;      
      case 'kubernetes-config':
        return isAdmin ? <KubernetesConfig /> : <RealtimeDashboard />;
      case 'threshold-config':
        return isAdmin ? <DbSizeThreshold /> : <RealtimeDashboard />;
      case 'script-manager':
        return <SimpleScriptManager />;
      case 'system-heartbeat':
        return <SystemHeartbeatConfig />;
      default:
        return <RealtimeDashboard />;
    }
  };

  const getPageTitle = () => {
    switch (currentPage) {
      case 'dashboard':
        return 'Dashboard Overview';
      case 'realtime-dashboard':
        return 'Real-time Monitoring';
      case 'database':
        return 'Database Status';
      case 'downtime-logs':
        return 'Downtime Logs';
      case 'database-config':
        return 'Database Configuration';
      case 'email-config':
        return 'Email Configuration';
      case 'users':
        return 'User Management';
      case 'system-metrics':
        return 'System Performance';  
      case 'kubernetes':
        return 'Kubernetes Monitoring';
      case 'url-monitoring':
        return 'URL Monitoring';      
      case 'kubernetes-config':
        return 'Kubernetes Configuration';
      case 'script-manager':
        return 'Script Manager';
      case 'threshold-config':
        return 'Alert Thresholds';
      default:
        return isServerMode ? 'Real-time Monitoring' : 'URL Monitoring';
    }
  };

  const layoutStyle = {
    minHeight: '100vh',
    background: isDarkMode ? '#141414' : '#f0f2f5'
  };

  const contentStyle = {
    margin: '24px',
    background: isDarkMode ? '#141414' : '#f0f2f5'
  };

  return (
    <Layout style={layoutStyle}>
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      
      <Layout>
        <AppHeader title={getPageTitle()} />
        
        <Content style={contentStyle}>
          {renderContent()}
        </Content>
        <Layout.Footer style={{
          textAlign: 'center',
          background: isDarkMode ? '#1f1f1f' : '#f0f2f5',
          color: isDarkMode ? '#ffffff' : '#000000'
        }}>
          <div style={{ fontSize: '12px' }}>
            🔷 Uptime WatchDog by <strong>Tsunami Solutions</strong> - Enterprise Monitoring Platform
          </div>
        </Layout.Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;