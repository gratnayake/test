import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  Tag, 
  Typography, 
  message,
  Popconfirm,
  Switch,
  Badge
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  UserOutlined,
  TeamOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { emailAPI } from '../../services/api';
import EmailGroupModal from './EmailGroupModal';

const { Title, Text } = Typography;

const EmailGroupManagement = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const response = await emailAPI.getEmailGroups();
      if (response.success) {
        setGroups(response.data);
      }
    } catch (error) {
      console.error('Failed to load email groups:', error);
      message.error('Failed to load email groups');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleGroup = async (groupId, enabled) => {
    try {
      const response = await emailAPI.updateEmailGroup(groupId, { enabled });
      if (response.success) {
        message.success(`Group ${enabled ? 'enabled' : 'disabled'} successfully`);
        loadGroups();
      }
    } catch (error) {
      message.error('Failed to update group status');
    }
  };

  const handleDeleteGroup = async (groupId) => {
    try {
      const response = await emailAPI.deleteEmailGroup(groupId);
      if (response.success) {
        message.success('Group deleted successfully');
        loadGroups();
      }
    } catch (error) {
      message.error('Failed to delete group');
    }
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    setModalVisible(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setEditingGroup(null);
  };

  const handleGroupSaved = () => {
    setModalVisible(false);
    setEditingGroup(null);
    loadGroups();
  };

  const columns = [
    {
      title: 'Group Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <TeamOutlined style={{ color: record.enabled ? '#52c41a' : '#d9d9d9' }} />
          <div>
            <Text strong={record.enabled}>{text}</Text>
            {record.description && (
              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {record.description}
                </Text>
              </div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Recipients',
      dataIndex: 'emails',
      key: 'emails',
      render: (emails) => (
        <Space direction="vertical" size="small">
          <Badge count={emails.length} showZero>
            <UserOutlined /> Recipients
          </Badge>
          {emails.slice(0, 2).map((email, index) => (
            <Tag key={index} size="small">{email}</Tag>
          ))}
          {emails.length > 2 && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              +{emails.length - 2} more
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Alert Types',
      dataIndex: 'alertTypes',
      key: 'alertTypes',
      render: (alertTypes) => (
        <Space>
          {alertTypes.includes('down') && <Tag color="red">DOWN</Tag>}
          {alertTypes.includes('up') && <Tag color="green">UP</Tag>}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled, record) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleToggleGroup(record.id, checked)}
          checkedChildren="ON"
          unCheckedChildren="OFF"
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
            onClick={() => handleEditGroup(record)}
            size="small"
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this email group?"
            description="This action cannot be undone."
            onConfirm={() => handleDeleteGroup(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okType="danger"
          >
            <Button 
              icon={<DeleteOutlined />} 
              danger 
              size="small"
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const enabledGroups = groups.filter(g => g.enabled);
  const totalRecipients = [...new Set(enabledGroups.flatMap(g => g.emails))].length;

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ marginBottom: 24 }}>
        <Space size="large">
          <Card size="small" style={{ textAlign: 'center' }}>
            <Text strong style={{ fontSize: '24px', color: '#1890ff' }}>
              {groups.length}
            </Text>
            <br />
            <Text type="secondary">Total Groups</Text>
          </Card>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Text strong style={{ fontSize: '24px', color: '#52c41a' }}>
              {enabledGroups.length}
            </Text>
            <br />
            <Text type="secondary">Active Groups</Text>
          </Card>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Text strong style={{ fontSize: '24px', color: '#722ed1' }}>
              {totalRecipients}
            </Text>
            <br />
            <Text type="secondary">Unique Recipients</Text>
          </Card>
        </Space>
      </div>

      {/* Main Table */}
      <Card
        title={
          <Space>
            <TeamOutlined />
            Email Alert Groups
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadGroups}
              loading={loading}
            >
              Refresh
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddGroup}
            >
              Add Group
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={groups}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
          locale={{
            emptyText: 'No email groups configured'
          }}
        />
      </Card>

      <EmailGroupModal
        visible={modalVisible}
        editingGroup={editingGroup}
        onClose={handleModalClose}
        onSaved={handleGroupSaved}
      />
    </div>
  );
};

export default EmailGroupManagement;