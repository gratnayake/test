import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Form, 
  Input, 
  Select, 
  InputNumber, 
  Button, 
  Space, 
  Alert,
  Typography,
  Divider,
  Row,
  Col
} from 'antd';
import { 
  LinkOutlined, 
  ClockCircleOutlined
} from '@ant-design/icons';
import { urlAPI, emailAPI } from '../../services/api';

const { Option } = Select;
const { Text } = Typography;

const UrlModal = ({ visible, editingUrl, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [emailGroups, setEmailGroups] = useState([]);

  useEffect(() => {
    const loadEmailGroups = async () => {
    try {
      const response = await emailAPI.getEmailGroups();
      if (response.success) {
        setEmailGroups(response.data.filter(g => g.enabled));
      }
    } catch (error) {
      console.error('Failed to load email groups:', error);
    }
  };
    if (visible) {
      loadEmailGroups();
      if (editingUrl) {
        form.setFieldsValue(editingUrl);
      } else {
        form.resetFields();
        form.setFieldsValue({
          method: 'GET',
          timeout: 5000,
          interval: 60,
          expectedStatus: 200,
          enabled: true
        });
      }
    }
  }, [visible, editingUrl, form]);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      let response;
      if (editingUrl) {
        response = await urlAPI.updateUrl(editingUrl.id, values);
      } else {
        response = await urlAPI.addUrl(values);
      }
      
      if (response.success) {
        onSaved();
      }
    } catch (error) {
      console.error('Failed to save URL:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <LinkOutlined />
          {editingUrl ? 'Edit URL Monitor' : 'Add URL Monitor'}
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
      >
        <Form.Item
          name="name"
          label="Display Name"
          rules={[{ required: true, message: 'Please enter a display name!' }]}
        >
          <Input 
            placeholder="e.g., Company Website, API Endpoint"
            prefix={<LinkOutlined />}
          />
        </Form.Item>

        <Form.Item
          name="url"
          label="URL"
          rules={[
            { required: true, message: 'Please enter URL!' },
            { type: 'url', message: 'Please enter a valid URL!' }
          ]}
        >
          <Input 
            placeholder="https://example.com or http://api.example.com/health"
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="method"
              label="HTTP Method"
              rules={[{ required: true, message: 'Please select method!' }]}
            >
              <Select placeholder="Select HTTP method">
                <Option value="GET">GET</Option>
                <Option value="POST">POST</Option>
                <Option value="PUT">PUT</Option>
                <Option value="HEAD">HEAD</Option>
                <Option value="OPTIONS">OPTIONS</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="expectedStatus"
              label="Expected Status Code"
              rules={[{ required: true, message: 'Please enter expected status!' }]}
            >
              <InputNumber 
                placeholder="200"
                min={100}
                max={599}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="timeout"
              label="Timeout (ms)"
              rules={[{ required: true, message: 'Please enter timeout!' }]}
            >
              <InputNumber 
                placeholder="5000"
                min={1000}
                max={30000}
                step={1000}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="interval"
              label="Check Interval (seconds)"
              rules={[{ required: true, message: 'Please enter interval!' }]}
            >
              <InputNumber 
                placeholder="60"
                min={30}
                max={3600}
                step={30}
                style={{ width: '100%' }}
                prefix={<ClockCircleOutlined />}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="enabled"
          label="Status"
          valuePropName="checked"
        >
          <Select placeholder="Select status">
            <Option value={true}>🟢 Enabled (start monitoring)</Option>
            <Option value={false}>🔴 Disabled (no monitoring)</Option>
          </Select>
        </Form.Item>

      <Form.Item
        name="emailGroupId"
        label="Email Alert Group"
      >
        <Select 
          placeholder="Select email group for alerts (optional)"
          allowClear
        >
          <Option value={null}>🔕 No email alerts</Option>
          {emailGroups.map(group => (
            <Option key={group.id} value={group.id}>
              📧 {group.name} ({group.emails.length} recipients)
            </Option>
          ))}
        </Select>
      </Form.Item>
        <Alert
          message="Monitoring Info"
          description={
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>The URL will be checked at the specified interval</li>
              <li>A request timeout will be treated as DOWN</li>
              <li>Only the expected status code will be treated as UP</li>
              <li>Response time will be measured for each check</li>
            </ul>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
          <Space>
            <Button onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
            >
              {editingUrl ? 'Update URL' : 'Add URL'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default UrlModal;