import React from 'react';
import { Card, Table, Tag } from 'antd';

const DowntimeTable = () => {
  // Mock downtime data
  const downtimeData = [
    { 
      key: '1',
      date: '2024-01-15', 
      startTime: '09:30:15', 
      endTime: '09:45:30', 
      duration: '15m 15s', 
      status: 'Resolved' 
    },
    { 
      key: '2',
      date: '2024-01-14', 
      startTime: '14:22:10', 
      endTime: '14:22:45', 
      duration: '35s', 
      status: 'Resolved' 
    },
    { 
      key: '3',
      date: '2024-01-12', 
      startTime: '16:15:20', 
      endTime: '16:18:45', 
      duration: '3m 25s', 
      status: 'Resolved' 
    }
  ];

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Start Time', dataIndex: 'startTime', key: 'startTime' },
    { title: 'End Time', dataIndex: 'endTime', key: 'endTime' },
    { title: 'Duration', dataIndex: 'duration', key: 'duration' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color="green">{status}</Tag>
      ),
    },
  ];

  return (
    <Card title="Recent Downtime Events" style={{ marginBottom: 24 }}>
      <Table
        columns={columns}
        dataSource={downtimeData}
        pagination={{ pageSize: 5 }}
        size="small"
      />
    </Card>
  );
};

export default DowntimeTable;