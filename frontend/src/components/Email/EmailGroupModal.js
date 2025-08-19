import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Form, 
  Input, 
  Select, 
  Button, 
  Space, 
  Alert, 
  Tag,
  Typography,
  Divider,
  AutoComplete,
  message
} from 'antd';
import { 
  TeamOutlined, 
  MailOutlined, 
  PlusOutlined,
  DeleteOutlined
  
} from '@ant-design/icons';
import { emailAPI } from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

const EmailGroupModal = ({ visible, editingGroup, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [existingEmails, setExistingEmails] = useState([]);
  const [emailSuggestions, setEmailSuggestions] = useState([]);

  useEffect(() => {
  if (visible) {
        loadExistingEmails();
    }
    }, [visible]);

    const loadExistingEmails = async () => {
    try {
        const response = await emailAPI.getEmailGroups();
        if (response.success) {
        const allEmails = [...new Set(response.data.flatMap(group => group.emails))];
        setExistingEmails(allEmails);
        
        // Filter out already added emails for suggestions
        const suggestions = allEmails.filter(email => !emails.includes(email));
        setEmailSuggestions(suggestions);
        }
    } catch (error) {
        console.error('Failed to load existing emails:', error);
    }
    };

    // Update emails when they change
    useEffect(() => {
        const suggestions = existingEmails.filter(email => !emails.includes(email));
        setEmailSuggestions(suggestions);
    }, [emails, existingEmails]);
  useEffect(() => {
    if (visible) {
      if (editingGroup) {
        form.setFieldsValue({
          name: editingGroup.name,
          description: editingGroup.description,
          alertTypes: editingGroup.alertTypes,
          enabled: editingGroup.enabled
        });
        setEmails(editingGroup.emails || []);
      } else {
        form.resetFields();
        form.setFieldsValue({
          alertTypes: ['down', 'up'],
          enabled: true
        });
        setEmails([]);
      }
      setNewEmail('');
    }
  }, [visible, editingGroup, form]);


  const handleAddFromSuggestions = (email) => {
  setEmails([...emails, email]);
};
  const handleAddEmail = () => {
    if (!newEmail.trim()) return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      alert('Please enter a valid email address');
      return;
    }
    
    if (emails.includes(newEmail)) {
      alert('Email already exists in this group');
      return;
    }
    
    setEmails([...emails, newEmail]);
    setNewEmail('');
  };

  const handleRemoveEmail = (emailToRemove) => {
    setEmails(emails.filter(email => email !== emailToRemove));
  };


const handleSubmit = async (values) => {
  try {
    setLoading(true);
    
    console.log('🔍 Form submission started');
    console.log('📝 Form values:', values);
    console.log('📧 Current emails:', emails);
    console.log('✏️ Editing group:', editingGroup);
    
    if (emails.length === 0) {
      message.error('Please add at least one email address');
      return;
    }
    
    const groupData = {
      ...values,
      emails
    };
    
    console.log('📦 Final group data:', groupData);
    
    let response;
    if (editingGroup) {
      console.log(`🔧 Updating group ID: ${editingGroup.id}`);
      response = await emailAPI.updateEmailGroup(editingGroup.id, groupData);
    } else {
      console.log('➕ Creating new group');
      response = await emailAPI.createEmailGroup(groupData);
    }
    
    console.log('📡 API Response:', response);
    
    if (response.success) {
      message.success(editingGroup ? 'Group updated successfully!' : 'Group created successfully!');
      onSaved();
    } else {
      console.error('❌ API Error:', response.error);
      message.error(`Failed to save group: ${response.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('❌ Submit error:', error);
    message.error(`Failed to save group: ${error.message}`);
  } finally {
    setLoading(false);
  }
};

  return (
    <Modal
      title={
        <Space>
          <TeamOutlined />
          {editingGroup ? 'Edit Email Group' : 'Create Email Group'}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          alertTypes: ['down', 'up'],
          enabled: true
        }}
      >
        <Form.Item
          name="name"
          label="Group Name"
          rules={[{ required: true, message: 'Please enter group name!' }]}
        >
          <Input 
            placeholder="e.g., Database Administrators, Operations Team"
            prefix={<TeamOutlined />}
          />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
        >
          <TextArea 
            placeholder="Brief description of this group's purpose"
            rows={2}
          />
        </Form.Item>

        <Form.Item
          name="alertTypes"
          label="Alert Types"
          rules={[{ required: true, message: 'Please select alert types!' }]}
        >
          <Select mode="multiple" placeholder="Select alert types">
            <Option value="down">🚨 Database Down Alerts</Option>
            <Option value="up">✅ Database Recovery Alerts</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="enabled"
          label="Group Status"
          valuePropName="checked"
        >
          <Select placeholder="Select status">
            <Option value={true}>🟢 Enabled (will receive alerts)</Option>
            <Option value={false}>🔴 Disabled (no alerts)</Option>
          </Select>
        </Form.Item>
<Divider orientation="left">Email Recipients</Divider>

{/* Quick Add from Existing */}
{emailSuggestions.length > 0 && (
  <div style={{ marginBottom: 16 }}>
    <Text strong>Quick Add (from other groups):</Text>
    <div style={{ marginTop: 8 }}>
      <Space wrap>
        {emailSuggestions.slice(0, 6).map((email, index) => (
          <Button 
            key={index}
            size="small"
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => handleAddFromSuggestions(email)}
          >
            {email}
          </Button>
        ))}
        {emailSuggestions.length > 6 && (
          <Text type="secondary">+{emailSuggestions.length - 6} more</Text>
        )}
      </Space>
    </div>
  </div>
)}

{/* Bulk Add All Suggestions */}
{emailSuggestions.length > 1 && (
  <div style={{ marginBottom: 12 }}>
    <Button 
      type="dashed" 
      icon={<PlusOutlined />}
      onClick={() => setEmails([...emails, ...emailSuggestions])}
      size="small"
    >
      Add All Existing ({emailSuggestions.length})
    </Button>
  </div>
)}

{/* Add New Email */}
{/* Add New Email */}
<div style={{ marginBottom: 16 }}>
  <Text strong>Add New Email:</Text>
  <div style={{ marginTop: 8 }}>
    <Space.Compact style={{ display: 'flex' }}>
      <AutoComplete
        style={{ flex: 1 }}
        placeholder="Enter or search email address"
        value={newEmail}
        onChange={setNewEmail}
        onSelect={setNewEmail}
        options={existingEmails
          .filter(email => !emails.includes(email) && email.toLowerCase().includes(newEmail.toLowerCase()))
          .map(email => ({ value: email, label: email }))
        }
        onPressEnter={handleAddEmail}
      >
        <Input prefix={<MailOutlined />} />
      </AutoComplete>
      <Button 
        type="primary" 
        icon={<PlusOutlined />}
        onClick={handleAddEmail}
      >
        Add New
      </Button>
    </Space.Compact>
  </div>
</div>
{/* Email List with better organization */}
<div style={{ marginBottom: 16 }}>
  <Text strong>Selected Recipients ({emails.length}):</Text>
  <div style={{ 
    marginTop: 8, 
    minHeight: 80, 
    border: '1px dashed #d9d9d9', 
    padding: 12, 
    borderRadius: 6,
    backgroundColor: '#fafafa'
  }}>
    {emails.length > 0 ? (
      <Space wrap>
        {emails.map((email, index) => (
          <Tag 
            key={index} 
            closable 
            onClose={() => handleRemoveEmail(email)}
            icon={<MailOutlined />}
            color={existingEmails.includes(email) ? 'blue' : 'green'}
          >
            {email}
            {existingEmails.includes(email) && (
              <span style={{ fontSize: '10px', marginLeft: 4 }}>(existing)</span>
            )}
          </Tag>
        ))}
      </Space>
    ) : (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <MailOutlined style={{ fontSize: 32, color: '#d9d9d9', marginBottom: 8 }} />
        <br />
        <Text type="secondary">No recipients selected</Text>
        <br />
        <Text type="secondary" style={{ fontSize: '12px' }}>
          Use quick add buttons above or enter new email addresses
        </Text>
      </div>
    )}
  </div>
</div>

{/* Legend */}
<div style={{ marginBottom: 16 }}>
  <Space>
    <Tag color="blue" size="small">Existing Email</Tag>
    <Tag color="green" size="small">New Email</Tag>
  </Space>
</div>
      
       <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              disabled={emails.length === 0}
            >
              {editingGroup ? 'Update Group' : 'Create Group'}
            </Button>
          </Space>
        </Form.Item>

      </Form>    
    </Modal>
  );
};

export default EmailGroupModal;