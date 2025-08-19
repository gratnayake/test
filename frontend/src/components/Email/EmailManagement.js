import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  Space, 
  List, 
  Tag, 
  Typography, 
  Alert,
  Row,
  Col,
  Divider,
  message,
  Popconfirm,
  Modal,
  Tabs 
} from 'antd';
import { 
  MailOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  SendOutlined,
  CheckCircleOutlined,
  UserOutlined
} from '@ant-design/icons';
import { emailAPI } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import EmailConfigForm from './EmailConfigForm';
import EmailGroupManagement from './EmailGroupManagement';




const { Title, Text } = Typography;

const EmailManagement = () => {
  const [form] = Form.useForm();
  const [emailList, setEmailList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [alert, setAlert] = useState({ type: '', message: '', visible: false });
  const { isDarkMode } = useTheme();

  useEffect(() => {
    loadEmailList();
  }, []);

  const loadEmailList = async () => {
    try {
      setLoading(true);
      const response = await emailAPI.getEmailList();
      
      if (response.success) {
        setEmailList(response.data.emails || []);
      }
    } catch (error) {
      console.error('Failed to load email list:', error);
      showAlert('error', 'Failed to load email list');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (type, message) => {
    setAlert({ type, message, visible: true });
    setTimeout(() => {
      setAlert({ ...alert, visible: false });
    }, 5000);
  };

  const handleAddEmail = () => {
    if (!newEmail) {
      message.error('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      message.error('Please enter a valid email address');
      return;
    }

    if (emailList.includes(newEmail)) {
      message.error('Email already exists in the list');
      return;
    }

    const updatedList = [...emailList, newEmail];
    updateEmailList(updatedList);
    setNewEmail('');
  };

  const handleRemoveEmail = (emailToRemove) => {
    const updatedList = emailList.filter(email => email !== emailToRemove);
    updateEmailList(updatedList);
  };

  const updateEmailList = async (emails) => {
    try {
      setLoading(true);
      const response = await emailAPI.updateEmailList(emails);
      
      if (response.success) {
        setEmailList(emails);
        showAlert('success', 'Email list updated successfully!');
        message.success('Email list updated!');
      } else {
        showAlert('error', 'Failed to update email list');
      }
    } catch (error) {
      console.error('Failed to update email list:', error);
      showAlert('error', 'Failed to update email list: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (emailList.length === 0) {
      message.error('Please add at least one email address before testing');
      return;
    }

    Modal.confirm({
      title: 'Send Test Email',
      content: `Send a test email to all ${emailList.length} email address(es)?`,
      icon: <SendOutlined />,
      onOk: async () => {
        try {
          setTestLoading(true);
          const response = await emailAPI.sendTestEmail();
          
          if (response.success) {
            showAlert('success', 'Test email sent successfully!');
            message.success('Test email sent to all addresses!');
          } else {
            showAlert('error', response.error || 'Failed to send test email');
          }
        } catch (error) {
          console.error('Failed to send test email:', error);
          showAlert('error', 'Failed to send test email: ' + error.message);
        } finally {
          setTestLoading(false);
        }
      }
    });
  };

  const handleTestConfiguration = async () => {
    try {
      setTestLoading(true);
      const response = await emailAPI.testConfiguration();
      
      if (response.success) {
        showAlert('success', 'Email configuration is valid!');
        message.success('Email configuration test passed!');
      } else {
        showAlert('error', 'Email configuration test failed: ' + response.error);
      }
    } catch (error) {
      console.error('Failed to test email configuration:', error);
      showAlert('error', 'Configuration test failed: ' + error.message);
    } finally {
      setTestLoading(false);
    }
  };

  return (  
   <Tabs defaultActiveKey="groups">
    <Tabs.TabPane tab="📧 Alert Groups" key="groups">
      <EmailGroupManagement />
    </Tabs.TabPane>
    <Tabs.TabPane tab="⚙️ SMTP Configuration" key="config">
      <EmailConfigForm />
    </Tabs.TabPane>
  </Tabs>
  );
};

export default EmailManagement;