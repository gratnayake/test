import React, { useState, useEffect } from 'react';
import { Card, Button, Space, Typography, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import UserTable from './UserTable';
import UserModal from './UserModal';
import { userAPI } from '../../services/api';

const { Title } = Typography;

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      console.log('Loading users from backend...');
      const response = await userAPI.getAll();
      console.log('Users response:', response);
      
      if (response.success) {
        setUsers(response.users);
        console.log(`Loaded ${response.users.length} users`);
      } else {
        message.error('Failed to load users');
      }
    } catch (error) {
      console.error('Load users error:', error);
      message.error('Failed to load users: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setIsModalVisible(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setIsModalVisible(true);
  };

  const handleDeleteUser = async (userId) => {
    try {
      setLoading(true);
      console.log('Deleting user:', userId);
      
      const response = await userAPI.delete(userId);
      console.log('Delete response:', response);
      
      if (response.success) {
        setUsers(users.filter(user => user.id !== userId));
        message.success('User deleted successfully!');
      } else {
        message.error('Failed to delete user');
      }
    } catch (error) {
      console.error('Delete user error:', error);
      message.error('Failed to delete user: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    setIsModalVisible(false);
    setEditingUser(null);
  };

  const handleUserSaved = () => {
    setIsModalVisible(false);
    setEditingUser(null);
    loadUsers(); // Reload users after save
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>User Management</Title>
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadUsers}
            loading={loading}
          >
            Refresh
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAddUser}
          >
            Add User
          </Button>
        </Space>
      </div>

      <Card>
        <UserTable
          users={users}
          loading={loading}
          onEdit={handleEditUser}
          onDelete={handleDeleteUser}
        />
      </Card>

      <UserModal
        visible={isModalVisible}
        editingUser={editingUser}
        onClose={handleModalClose}
        onSaved={handleUserSaved}
      />
    </div>
  );
};

export default UserManagement;