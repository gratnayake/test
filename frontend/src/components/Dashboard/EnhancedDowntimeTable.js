import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Alert, Typography, Tooltip } from 'antd';
import { ReloadOutlined, DownloadOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { logsAPI, databaseAPI} from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';


const { Text } = Typography;

const EnhancedDowntimeTable = () => {
  const [downtimeData, setDowntimeData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const { isDarkMode } = useTheme();
  const [realDbStatus, setRealDbStatus] = useState(null);


  useEffect(() => {
    loadDowntimeLogs();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDowntimeLogs, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDbStatus = async () => {
  try {
    const response = await databaseAPI.getStatus();
    if (response.success) {
      setRealDbStatus(response);
    }
  } catch (error) {
    console.error('Failed to load DB status:', error);
  }
};
loadDbStatus();

  const loadDowntimeLogs = async () => {
    try {
      setLoading(true);
      const response = await logsAPI.getDowntimeLogs();
      
      if (response.success) {
        // Process and format the logs
        const processedLogs = processLogData(response.data);
        setDowntimeData(processedLogs);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to load downtime logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const processLogData = (logs) => {
  const downtimeEvents = [];
  const eventMap = new Map();

  logs.forEach((log) => {
    if (log.type === 'DOWN') {
      // Start a new downtime event
      eventMap.set(log.id, {
        key: log.id,
        id: log.id,
        startTime: new Date(log.timestamp),
        status: 'ongoing',
        endTime: null,
        duration: null,
        error: log.error || null
      });
    } else if (log.type === 'UP' && eventMap.has(log.id)) {
      // End the downtime event
      const event = eventMap.get(log.id);
      event.endTime = new Date(log.timestamp);
      event.duration = log.duration;
      event.status = 'resolved';
      downtimeEvents.push(event);
      eventMap.delete(log.id);
    }
  });

  // Add any ongoing events
  eventMap.forEach((event) => {
    downtimeEvents.push(event);
  });

  return downtimeEvents.sort((a, b) => b.startTime - a.startTime);
};

  const calculateDuration = (start, end) => {
    if (!end) {
      // Ongoing downtime
      const now = new Date();
      const diff = now - start;
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      return `${minutes}m ${seconds}s (ongoing)`;
    }
    
    const diff = end - start;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'startTime',
      key: 'date',
      render: (startTime) => startTime.toLocaleDateString(),
      sorter: (a, b) => a.startTime - b.startTime,
    },
    {
      title: 'Start Time',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (startTime) => startTime.toLocaleTimeString(),
    },
    {
      title: 'End Time',
      dataIndex: 'endTime',
      key: 'endTime',
      render: (endTime) => endTime ? endTime.toLocaleTimeString() : '-',
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_, record) => {
        const duration = record.duration || calculateDuration(record.startTime, record.endTime);
        return (
          <Space>
            <ClockCircleOutlined />
            <Text strong={record.status === 'ongoing'}>{duration}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const color = status === 'resolved' ? 'green' : status === 'ongoing' ? 'red' : 'orange';
        return (
          <Tag color={color}>
            {status.toUpperCase()}
          </Tag>
        );
      },
      filters: [
        { text: 'Resolved', value: 'resolved' },
        { text: 'Ongoing', value: 'ongoing' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Error Details',
      dataIndex: 'error',
      key: 'error',
      render: (error) => error ? (
        <Tooltip title={error}>
          <Text type="danger" ellipsis style={{ maxWidth: 200 }}>
            {error}
          </Text>
        </Tooltip>
      ) : '-',
    },
  ];

  const ongoingDowntime = downtimeData.find(event => event.status === 'ongoing' && !event.endTime);

  const exportToCSV = () => {
    const csvContent = [
      ['Date', 'Start Time', 'End Time', 'Duration', 'Status', 'Error'],
      ...downtimeData.map(event => [
        event.startTime.toLocaleDateString(),
        event.startTime.toLocaleTimeString(),
        event.endTime ? event.endTime.toLocaleTimeString() : '-',
        event.duration || calculateDuration(event.startTime, event.endTime),
        event.status,
        event.error || '-'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `downtime-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Card 
      title={
        <Space>
          <ClockCircleOutlined />
          Downtime History
          {lastUpdate && (
            <Text type="secondary" style={{ fontSize: '12px', fontWeight: 'normal' }}>
              (Last updated: {lastUpdate.toLocaleTimeString()})
            </Text>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadDowntimeLogs}
            loading={loading}
            size="small"
          >
            Refresh
          </Button>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={exportToCSV}
            size="small"
            disabled={downtimeData.length === 0}
          >
            Export CSV
          </Button>
        </Space>
      }
    >
      {/* Current Downtime Alert - Only show if database is actually down */}
        {ongoingDowntime && realDbStatus?.status === 'DOWN' && (
        <Alert
            message="Database is Currently Down"
            description={
            <div>
                <p><strong>Started:</strong> {ongoingDowntime.startTime.toLocaleString()}</p>
                <p><strong>Duration:</strong> {calculateDuration(ongoingDowntime.startTime, null)}</p>
                {ongoingDowntime.error && (
                <p><strong>Error:</strong> {ongoingDowntime.error}</p>
                )}
            </div>
            }
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
        />
        )}

      {/* Summary Statistics */}
      {downtimeData.length > 0 && (
        <div style={{ 
  marginBottom: 16, 
  padding: 12, 
  background: isDarkMode ? '#262626' : '#f5f5f5', 
  borderRadius: 6 
}}>
          <Space size="large">
            <Text>
              <strong>Total Events:</strong> {downtimeData.length}
            </Text>
            <Text>
              <strong>Resolved:</strong> {downtimeData.filter(e => e.status === 'resolved').length}
            </Text>
            <Text>
              <strong>Ongoing:</strong> {downtimeData.filter(e => e.status === 'ongoing').length}
            </Text>
          </Space>
        </div>
      )}

      {/* Table */}
      <Table
        columns={columns}
        dataSource={downtimeData}
        loading={loading}
        pagination={{ 
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} events`
        }}
        size="middle"
        locale={{
          emptyText: 'No downtime events recorded'
        }}
        scroll={{ x: 800 }}
      />
    </Card>
  );
};

export default EnhancedDowntimeTable;