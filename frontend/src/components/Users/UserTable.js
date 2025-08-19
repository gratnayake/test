import React from 'react';
import { Table, Button, Space, Avatar, Tag, Badge, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';

const UserTable = ({ users, loading, onEdit, onDelete }) => {
  const columns = [
    {
      title: 'Avatar',
      dataIndex: 'firstName',
      key: 'avatar',
      render: (firstName, record) => (
        <Avatar style={{ backgroundColor: '#1890ff' }}>
          {firstName ? firstName.charAt(0).toUpperCase() : '?'}
        </Avatar>
      ),
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: 'Full Name',
      key: 'fullName',
      render: (_, record) => `${record.firstName || ''} ${record.lastName || ''}`,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => (
        <Tag color={role === 'admin' ? 'red' : 'blue'}>
          {role ? role.toUpperCase() : 'USER'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Badge 
          status={status === 'active' ? 'success' : 'default'} 
          text={status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active'} 
        />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={() => onEdit(record)}
            size="small"
          >
            Edit
          </Button>
          {record.username !== 'admin' && (
            <Popconfirm
              title="Are you sure you want to delete this user?"
              onConfirm={() => onDelete(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button 
                icon={<DeleteOutlined />} 
                danger 
                size="small"
              >
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={users}
      loading={loading}
      pagination={{ pageSize: 10 }}
      rowKey="id"
    />
  );
};

export default UserTable;