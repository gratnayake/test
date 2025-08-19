import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  InputNumber, 
  Select, 
  Switch, 
  Button, 
  Space, 
  Alert,
  Typography,
  message  
} from 'antd';
import { DatabaseOutlined, SaveOutlined } from '@ant-design/icons';
import { thresholdAPI, emailAPI } from '../../services/api';

const { Text } = Typography;
const { Option } = Select;

const DbSizeThreshold = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [emailGroups, setEmailGroups] = useState([]);
  const [threshold, setThreshold] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [thresholdRes, groupsRes] = await Promise.all([
        thresholdAPI.getDbSizeThreshold(),
        emailAPI.getEmailGroups()
      ]);

      if (thresholdRes.success) {
        setThreshold(thresholdRes.data);
        form.setFieldsValue(thresholdRes.data);
      }

      if (groupsRes.success) {
        setEmailGroups(groupsRes.data.filter(g => g.enabled));
      }
    } catch (error) {
      console.error('Failed to load threshold data:', error);
    }
  };

  const handleSave = async (values) => {
    try {
      setLoading(true);
      const response = await thresholdAPI.saveDbSizeThreshold(values);
      
      if (response.success) {
        message.success('Threshold settings saved!');
        loadData();
      }
    } catch (error) {
      message.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <DatabaseOutlined />
          Database Size Threshold
        </Space>
      }
    >
      <Alert
        message="Database Size Monitoring"
        description="Get notified when your database size drops below a specified threshold. This can help detect unexpected data loss or compression issues."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          enabled: false,
          minSizeGB: 10
        }}
      >
        <Form.Item
          name="enabled"
          valuePropName="checked"
        >
          <Switch 
            checkedChildren="Enabled" 
            unCheckedChildren="Disabled"
          />
          <Text style={{ marginLeft: 8 }}>Enable database size monitoring</Text>
        </Form.Item>

        <Form.Item
          name="minSizeGB"
          label="Minimum Database Size (GB)"
          rules={[{ required: true, message: 'Please enter minimum size!' }]}
        >
          <InputNumber
            min={0.1}
            step={0.1}
            style={{ width: '100%' }}
            placeholder="e.g., 10.5"
          />
        </Form.Item>

        <Form.Item
          name="emailGroupId"
          label="Email Alert Group"
          rules={[{ required: true, message: 'Please select an email group!' }]}
        >
          <Select placeholder="Select email group for alerts">
            {emailGroups.map(group => (
              <Option key={group.id} value={group.id}>
                {group.name} ({group.emails.length} recipients)
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item>
          <Button 
            type="primary" 
            htmlType="submit" 
            icon={<SaveOutlined />}
            loading={loading}
          >
            Save Threshold Settings
          </Button>
        </Form.Item>
      </Form>

      {threshold?.lastAlertSent && (
        <Alert
          message={`Last alert sent: ${new Date(threshold.lastAlertSent).toLocaleString()}`}
          type="warning"
          style={{ marginTop: 16 }}
        />
      )}
    </Card>
  );
};

export default DbSizeThreshold;