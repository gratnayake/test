import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, Space, Alert, Row, Col, Divider } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, IdcardOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { userAPI } from '../../services/api';

const { Option } = Select;

const UserModal = ({ visible, editingUser, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');

  useEffect(() => {
    if (visible) {
      // Clear alerts when modal opens
      setModalError('');
      setModalSuccess('');
      
      if (editingUser) {
        // Editing existing user
        form.setFieldsValue({
          ...editingUser,
          password: '' // Don't show existing password
        });
      } else {
        // Adding new user
        form.resetFields();
        form.setFieldsValue({
          role: 'user',
          status: 'active'
        });
      }
    }
  }, [visible, editingUser, form]);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      setModalError('');
      setModalSuccess('');
      
      console.log('Submitting user:', values);
      
      let response;
      if (editingUser) {
        // Update user
        console.log('Updating user:', editingUser.id);
        response = await userAPI.update(editingUser.id, values);
        console.log('Update response:', response);
      } else {
        // Create new user
        console.log('Creating new user...');
        response = await userAPI.create(values);
        console.log('Create response:', response);
      }
      
      if (response.success) {
        const successMessage = editingUser ? 'User updated successfully!' : 'User created successfully!';
        setModalSuccess(successMessage);
        
        // Close modal after short delay and trigger refresh
        setTimeout(() => {
          onSaved();
          form.resetFields();
          setModalSuccess('');
        }, 1500);
      } else {
        setModalError('Failed to save user');
      }
    } catch (error) {
      console.error('User submit error:', error);
      let errorMessage = 'Failed to save user';
      
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setModalError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setModalError('');
    setModalSuccess('');
    onClose();
  };

  return (
    <Modal
      title={editingUser ? 'Edit User' : 'Add New User'}
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={600}
    >
      {/* Success Alert */}
      {modalSuccess && (
        <Alert
          message="Success"
          description={modalSuccess}
          type="success"
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* Error Alert */}
      {modalError && (
        <Alert
          message="Error"
          description={modalError}
          type="error"
          style={{ marginBottom: 16 }}
          showIcon
          closable
          onClose={() => setModalError('')}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="firstName"
              label="First Name"
              rules={[{ required: true, message: 'Please enter first name!' }]}
            >
              <Input prefix={<IdcardOutlined />} placeholder="First Name" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="lastName"
              label="Last Name"
              rules={[{ required: true, message: 'Please enter last name!' }]}
            >
              <Input prefix={<IdcardOutlined />} placeholder="Last Name" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="username"
          label="Username"
          rules={[{ required: true, message: 'Please enter username!' }]}
        >
          <Input prefix={<UserOutlined />} placeholder="Username" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Please enter email!' },
            { type: 'email', message: 'Please enter valid email!' }
          ]}
        >
          <Input prefix={<MailOutlined />} placeholder="Email" />
        </Form.Item>

        <Form.Item
          name="password"
          label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
          rules={editingUser ? [] : [{ required: true, message: 'Please enter password!' }]}
        >
          <Input.Password 
            prefix={<LockOutlined />} 
            placeholder="Password"
            iconRender={visible => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="role"
              label="Role"
              rules={[{ required: true, message: 'Please select role!' }]}
            >
              <Select placeholder="Select Role">
                <Option value="user">User</Option>
                <Option value="admin">Admin</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="status"
              label="Status"
              rules={[{ required: true, message: 'Please select status!' }]}
            >
              <Select placeholder="Select Status">
                <Option value="active">Active</Option>
                <Option value="inactive">Inactive</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Space>
            <Button onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              {editingUser ? 'Update User' : 'Create User'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default UserModal;