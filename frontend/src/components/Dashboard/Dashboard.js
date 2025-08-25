import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Progress, Typography, Tag } from 'antd';
import { Line } from '@ant-design/plots';
import { useAuth } from '../../contexts/AuthContext';
import { databaseAPI } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';

const { Text } = Typography;

const Dashboard = () => {
  const { isAdmin } = useAuth();
  const [tablespaceData, setTablespaceData] = useState([]);
  const { isDarkMode } = useTheme();
  const loadTablespaceData = async () => {
  try {
    const response = await databaseAPI.getTablespace();
    if (response.success) {
      setTablespaceData(response.data);
    }
  } catch (error) {
    console.error('Failed to load tablespace data:', error);
  }
};

  useEffect(() => {
    if (isAdmin) {
      loadTablespaceData(); 
    }
    
  }, [isAdmin]);



  const getTablespaceChart = () => {
  if (!tablespaceData.length) return null;

  const chartData = tablespaceData.map(ts => ({
    name: ts.name,
    usage: ts.usagePercent,
    type: 'Used Space %'
  }));

  const config = {
    data: chartData,
    xField: 'name',
    yField: 'usage',
    seriesField: 'type',
    color: ({ usage }) => {
      if (usage > 90) return '#ff4d4f';
      if (usage > 75) return '#fa8c16';
      return '#52c41a';
    },
    point: {
      size: 5,
      shape: 'diamond',
    },
    // Add theme configuration for dark mode
    theme: isDarkMode ? 'dark' : 'light',
    // Add axis styling for dark mode
    xAxis: {
      label: {
        style: {
          fill: isDarkMode ? '#ffffff' : '#000000',
        },
      },
    },
    yAxis: {
      label: {
        style: {
          fill: isDarkMode ? '#ffffff' : '#000000',
        },
      },
    },
  };

  return <Line {...config} />;
};

  return (
    <div>
      
{/* Tablespace Usage Chart */}
<Card title="Tablespace Usage" style={{ marginBottom: 24 }}>
  {tablespaceData.length > 0 ? (
    <div>
      <div style={{ height: 300, marginBottom: 16 }}>
        {getTablespaceChart()}
      </div>
      <Row gutter={[8, 8]}>
        {tablespaceData.map((ts, index) => (
          <Col xs={24} sm={12} md={8} lg={6} key={index}>
            <Card size="small">
              <div style={{ marginBottom: 8 }}>
                <Text strong>{ts.name}</Text>
                <Tag 
                  color={ts.status === 'critical' ? 'red' : ts.status === 'warning' ? 'orange' : 'green'}
                  style={{ float: 'right' }}
                >
                  {ts.usagePercent}%
                </Tag>
              </div>
              <Progress 
                percent={ts.usagePercent} 
                status={ts.status === 'critical' ? 'exception' : 'normal'}
                strokeColor={ts.status === 'critical' ? '#ff4d4f' : ts.status === 'warning' ? '#fa8c16' : '#52c41a'}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {ts.usedMB}MB / {ts.totalMB}MB
              </Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  ) : (
    <Text type="secondary">No tablespace data available</Text>
  )}
</Card>

    </div>
  );
};

export default Dashboard;