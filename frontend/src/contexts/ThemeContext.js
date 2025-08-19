import React, { createContext, useContext, useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Load theme preference from localStorage on app start
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme-mode');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    } else {
      // Check system preference
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(prefersDark);
    }
  }, []);

  // Save theme preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('theme-mode', isDarkMode ? 'dark' : 'light');
    
    // Update document class for custom CSS
    if (isDarkMode) {
      document.documentElement.classList.add('dark-theme');
      document.documentElement.classList.remove('light-theme');
    } else {
      document.documentElement.classList.add('light-theme');
      document.documentElement.classList.remove('dark-theme');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const antdTheme = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#1677ff',
      borderRadius: 8,
      // Modern dark theme tokens (similar to Ant Design Pro)
      ...(isDarkMode && {
        colorBgContainer: '#141414',
        colorBgElevated: '#1f1f1f',
        colorBgLayout: '#000000',
        colorBgBase: '#000000',
        colorText: '#ffffff',
        colorTextSecondary: '#a6a6a6',
        colorTextTertiary: '#595959',
        colorBorder: '#303030',
        colorBorderSecondary: '#262626',
        colorSplit: '#262626',
        colorFill: '#262626',
        colorFillSecondary: '#1f1f1f',
        colorFillTertiary: '#141414',
        colorBgMask: 'rgba(0, 0, 0, 0.45)',
        boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
        boxShadowSecondary: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
      })
    },
    components: {
      Layout: isDarkMode ? {
        colorBgHeader: '#141414',
        colorBgBody: '#000000',
        colorBgTrigger: '#262626',
        colorText: '#ffffff',
      } : {},
      Menu: isDarkMode ? {
        colorBgContainer: '#141414',
        colorItemBg: '#141414',
        colorText: '#ffffff',
        colorTextSelected: '#ffffff',
        colorItemBgSelected: '#1677ff',
        colorItemBgHover: '#262626',
        colorBorderSecondary: '#303030',
      } : {},
      Card: isDarkMode ? {
        colorBgContainer: '#141414',
        colorBorderSecondary: '#303030',
        colorText: '#ffffff',
        colorTextHeading: '#ffffff',
      } : {},
      Table: isDarkMode ? {
  colorBgContainer: '#141414',
  colorText: '#ffffff',
  colorTextHeading: '#ffffff',
  colorBgElevated: '#1f1f1f',
  colorBorderSecondary: '#303030',
  // Add these lines:
  colorFillAlter: '#262626',
  colorBgHead: '#262626',
} : {},
      Input: isDarkMode ? {
        colorBgContainer: '#1f1f1f',
        colorText: '#ffffff',
        colorBorder: '#434343',
        colorBgElevated: '#262626',
      } : {},
      Select: isDarkMode ? {
        colorBgContainer: '#1f1f1f',
        colorText: '#ffffff',
        colorBorder: '#434343',
        colorBgElevated: '#262626',
      } : {},
      Button: isDarkMode ? {
        colorText: '#ffffff',
        colorBgContainer: '#262626',
        colorBorder: '#434343',
      } : {},
      Alert: isDarkMode ? {
        colorText: '#ffffff',
        colorInfoBg: '#111b26',
        colorSuccessBg: '#162312',
        colorWarningBg: '#2b2611',
        colorErrorBg: '#2a1215',
      } : {},
      Modal: isDarkMode ? {
        colorBgElevated: '#1f1f1f',
        colorText: '#ffffff',
        colorTextHeading: '#ffffff',
      } : {},
      Statistic: isDarkMode ? {
        colorText: '#ffffff',
        colorTextHeading: '#ffffff',
      } : {},
    }
  };

  const value = {
    isDarkMode,
    toggleTheme,
    themeName: isDarkMode ? 'dark' : 'light'
  };

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={antdTheme}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};