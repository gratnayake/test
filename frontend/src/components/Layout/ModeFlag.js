import React from 'react';
import { Tag, Tooltip } from 'antd';
import { CloudOutlined, DesktopOutlined } from '@ant-design/icons';
import { useMode } from '../../contexts/ModeContext';
import { useTheme } from '../../contexts/ThemeContext';

const ModeFlag = () => {
  const { mode, isServerMode, loading } = useMode();
  const { isDarkMode } = useTheme();

  if (loading) {
    return (
      <Tag color="default" size="small">
        Loading...
      </Tag>
    );
  }

  const flagStyle = {
    fontSize: '12px',
    fontWeight: 'bold',
    padding: '4px 8px',
    border: 'none',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  };

  return (
    <Tooltip 
      title={isServerMode ? 
        'Server Mode: Kubernetes monitoring enabled' : 
        'Client Mode: Running without Kubernetes'
      }
    >
      <Tag 
        color={isServerMode ? 'green' : 'blue'}
        style={flagStyle}
        icon={isServerMode ? <CloudOutlined /> : <DesktopOutlined />}
      >
        {isServerMode ? 'SERVER MODE' : 'CLIENT MODE'}
      </Tag>
    </Tooltip>
  );
};

export default ModeFlag;