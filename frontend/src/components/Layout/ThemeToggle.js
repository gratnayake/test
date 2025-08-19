import React from 'react';
import { Button, Tooltip } from 'antd';
import { BulbOutlined, BulbFilled } from '@ant-design/icons';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeToggle = ({ size = 'middle', type = 'text' }) => {
  const { isDarkMode, toggleTheme } = useTheme();

  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
    color: isDarkMode ? '#ffffff' : 'inherit',
    borderColor: isDarkMode && type === 'default' ? '#303030' : undefined,
    background: isDarkMode && type === 'default' ? '#262626' : undefined
  };

  return (
    <Tooltip title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
      <Button
        type={type}
        size={size}
        icon={isDarkMode ? <BulbFilled style={{ color: '#ffd700' }} /> : <BulbOutlined />}
        onClick={toggleTheme}
        style={buttonStyle}
      >
        {size === 'large' && (isDarkMode ? 'Light Mode' : 'Dark Mode')}
      </Button>
    </Tooltip>
  );
};

export default ThemeToggle;