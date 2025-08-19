import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Button, 
  Space, 
  Typography, 
  message,
  Modal,
  Input,
  Alert,
  Table,
  Tag,
  Row,
  Col,
  Select,
  Tooltip,
  Divider,
  Popconfirm
} from 'antd';
import { 
  PlayCircleOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  ReloadOutlined,
  FileTextOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  DatabaseOutlined,
  PoweroffOutlined,
  ThunderboltOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { scriptAPI, simpleScriptAPI, databaseOperationsAPI } from '../../services/api';
import AutoRecoveryControl from '../Database/AutoRecoveryControl';

const { Title, Text } = Typography;
const { Option } = Select;

const SimpleScriptManager = () => {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingScript, setEditingScript] = useState(null);
  const [outputModal, setOutputModal] = useState({ visible: false, script: null, output: '', loading: false });
  const [kubeStatus, setKubeStatus] = useState(null);
  
  // Database Operations State
  const [dbOperationsStatus, setDbOperationsStatus] = useState(null);
  const [dbOperationLoading, setDbOperationLoading] = useState(false);
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    scriptPath: '',
    arguments: ''
  });

  // Predefined common arguments for MTCTL
  const commonArguments = [
    { label: 'Help', value: '--help', description: 'Show help information' },
    { label: 'Version', value: '--version', description: 'Show version information' },
    { label: 'Stop Namespace', value: 'stop --namespace "tsutst"', description: 'Stop deployments in namespace' },
    { label: 'Start Namespace', value: 'start --namespace "tsutst"', description: 'Start deployments in namespace' },
    { label: 'Status Check', value: 'status --namespace "tsutst"', description: 'Check status of namespace' },
    { label: 'List Deployments', value: 'list --namespace "tsutst"', description: 'List all deployments' },
    { label: 'Deploy', value: 'deploy --namespace "tsutst"', description: 'Deploy to namespace' }
  ];

  useEffect(() => {
    loadScripts();
    checkKubernetesConfig();
    loadDatabaseOperationsStatus();
  }, []);

  // FIXED: Load database operations status
  const loadDatabaseOperationsStatus = async () => {
    try {
      const { databaseOperationsAPI } = await import('../../services/api');
      const response = await databaseOperationsAPI.getStatus();
      console.log('🔍 Database operations API response:', response); // Debug log
      
      if (response.success) {
        // FIXED: Set the entire response object instead of response.status
        setDbOperationsStatus(response);
      }
    } catch (error) {
      console.error('Failed to load database operations status:', error);
      setDbOperationsStatus(null);
    }
  };

  // Database shutdown operation
  const handleDatabaseShutdown = async () => {
    setDbOperationLoading(true);
    setOutputModal({ 
      visible: true, 
      script: { name: 'Database Shutdown', scriptPath: 'SHUTDOWN IMMEDIATE' }, 
      output: 'Initiating database shutdown...\n', 
      loading: true 
    });
    
    try {
      const { databaseOperationsAPI } = await import('../../services/api');
      const result = await databaseOperationsAPI.shutdownImmediate();
      
      setOutputModal(prev => ({
        ...prev,
        output: prev.output + `\n${result.output}\n\n--- Operation completed ---`,
        loading: false
      }));
      
      if (result.success) {
        message.success('Database shutdown completed successfully!');
      } else {
        message.error('Database shutdown failed!');
      }
      
      // Refresh status
      await loadDatabaseOperationsStatus();
      
    } catch (error) {
      setOutputModal(prev => ({
        ...prev,
        output: prev.output + `\nError: ${error.message}`,
        loading: false
      }));
      message.error(`Database shutdown failed: ${error.message}`);
    } finally {
      setDbOperationLoading(false);
    }
  };

  // Database startup operation
  const handleDatabaseStartup = async () => {
    setDbOperationLoading(true);
    setOutputModal({ 
      visible: true, 
      script: { name: 'Database Startup', scriptPath: 'STARTUP' }, 
      output: 'Initiating database startup...\n', 
      loading: true 
    });
    
    try {
      const { databaseOperationsAPI } = await import('../../services/api');
      const result = await databaseOperationsAPI.startup();
      
      setOutputModal(prev => ({
        ...prev,
        output: prev.output + `\n${result.output}\n\n--- Operation completed ---`,
        loading: false
      }));
      
      if (result.success) {
        message.success('Database startup completed successfully!');
      } else {
        message.error('Database startup failed!');
      }
      
      // Refresh status
      await loadDatabaseOperationsStatus();
      
    } catch (error) {
      setOutputModal(prev => ({
        ...prev,
        output: prev.output + `\nError: ${error.message}`,
        loading: false
      }));
      message.error(`Database startup failed: ${error.message}`);
    } finally {
      setDbOperationLoading(false);
    }
  };

  // Check Kubernetes configuration status
  const checkKubernetesConfig = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/kubernetes-script-config');
      const data = await response.json();
      setKubeStatus(data);
    } catch (error) {
      console.error('Failed to check Kubernetes config:', error);
      setKubeStatus({
        configured: false,
        message: 'Unable to check Kubernetes configuration'
      });
    }
  };

  // COMPLETELY FIXED: Render Database Operations Panel
  const renderDatabaseOperations = () => {
    console.log('🔍 Current dbOperationsStatus:', dbOperationsStatus); // Debug log
    
    // FIXED: Check the correct path for configuration status
    if (!dbOperationsStatus?.configInfo?.isConfigured) {
      return (
        <Alert
          message="Database Not Configured"
          description="Please configure database connection in Database Config to enable database operations."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      );
    }

    const getStatusColor = () => {
      // FIXED: Check the correct configuration path
      if (dbOperationsStatus?.configInfo?.isConfigured) return 'success';
      return 'error';
    };

    const getStatusText = () => {
      // FIXED: Check the correct configuration path  
      if (dbOperationsStatus?.configInfo?.isConfigured) return 'CONFIGURED';
      return 'NOT CONFIGURED';
    };

    return (
      <Card 
        title={
          <Space>
            <DatabaseOutlined />
            <span>Database Operations</span>
            <Tag color={getStatusColor()}>
              {getStatusText()}
            </Tag>
          </Space>
        }
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Button size="small" onClick={loadDatabaseOperationsStatus}>
            <ReloadOutlined />
          </Button>
        }
      >
        <Row gutter={16} align="middle">
          <Col span={12}>
            <Space direction="vertical" size="small">
              <Text strong>Connection:</Text>
              <Text code style={{ fontSize: '12px' }}>
                {/* FIXED: Use the correct data structure */}
                {dbOperationsStatus?.configInfo?.host}:{dbOperationsStatus?.configInfo?.port}/{dbOperationsStatus?.configInfo?.serviceName}
              </Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {/* FIXED: Show proper status information */}
                SYS User: {dbOperationsStatus?.configInfo?.sysUsername} | Password: {dbOperationsStatus?.configInfo?.sysPasswordConfigured ? 'Configured' : 'Not Set'}
              </Text>
            </Space>
          </Col>
          <Col span={12}>
            <Space>
              <Popconfirm
                title="Shutdown Database"
                description="This will perform SHUTDOWN IMMEDIATE. Are you sure?"
                onConfirm={handleDatabaseShutdown}
                okText="Shutdown"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
                disabled={dbOperationLoading}
              >
                <Button 
                  danger
                  icon={<PoweroffOutlined />}
                  loading={dbOperationLoading}
                  disabled={dbOperationLoading}
                >
                  Shutdown
                </Button>
              </Popconfirm>
              
              <Button 
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handleDatabaseStartup}
                loading={dbOperationLoading}
                disabled={dbOperationLoading}
              >
                Startup
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>
    );
  };
 
  // Render Kubernetes status indicator
  const renderKubernetesStatus = () => {
    if (!kubeStatus) return null;

    const getStatusProps = () => {
      if (kubeStatus.configured && kubeStatus.kubeconfigExists) {
        return {
          type: "success",
          icon: <CheckCircleOutlined />,
          message: "Kubernetes Configuration Ready",
          description: `KUBECONFIG will be automatically used from: ${kubeStatus.kubeconfigPath}`
        };
      } else if (kubeStatus.configured && !kubeStatus.kubeconfigExists) {
        return {
          type: "warning", 
          icon: <ExclamationCircleOutlined />,
          message: "Kubernetes Configuration Issue",
          description: `KUBECONFIG file not found: ${kubeStatus.kubeconfigPath}`
        };
      } else {
        return {
          type: "info",
          icon: <InfoCircleOutlined />,
          message: "Kubernetes Not Configured",
          description: "Scripts will run without KUBECONFIG. Configure in Kubernetes settings if needed."
        };
      }
    };

    const statusProps = getStatusProps();

    return (
      <Alert
        {...statusProps}
        showIcon
        style={{ marginBottom: 16 }}
        action={
          <Button size="small" onClick={checkKubernetesConfig}>
            Refresh
          </Button>
        }
      />
    );
  };

  const loadScripts = async () => {
    try {
      setLoading(true);
      const response = await scriptAPI.getAllScripts();
      if (response.success) {
        setScripts(response.data);
      }
    } catch (error) {
      console.error('Failed to load scripts:', error);
      message.error('Failed to load scripts from server');
    } finally {
      setLoading(false);
    }
  };

  // Remove the old saveScripts function entirely and replace handleSaveScript with:
  const handleSaveScript = async () => {
    if (!form.name || !form.scriptPath) {
      message.error('Please fill in script name and path');
      return;
    }

    try {
      setLoading(true);

      const scriptData = {
        name: form.name,
        description: form.description,
        scriptPath: form.scriptPath,
        arguments: form.arguments
      };

      let response;
      if (editingScript) {
        // Update existing script
        response = await scriptAPI.updateScript(editingScript.id, scriptData);
      } else {
        // Add new script
        response = await scriptAPI.addScript(scriptData);
      }

      if (response.success) {
        message.success(editingScript ? 'Script updated successfully' : 'Script added successfully');
        setModalVisible(false);
        await loadScripts(); // Reload scripts from backend
      } else {
        message.error('Failed to save script');
      }
    } catch (error) {
      console.error('Save script error:', error);
      message.error(`Failed to save script: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const executeScript = async (script) => {
    setOutputModal({ visible: true, script, output: '', loading: true });
    
    try {
      const result = await simpleScriptAPI.executeScript({
        name: script.name,
        scriptPath: script.scriptPath,
        arguments: script.arguments
      });
      
      setOutputModal(prev => ({
        ...prev,
        output: result.output,
        loading: false
      }));
      
      // Reload scripts to get updated lastRunAt from backend
      await loadScripts();
      
      if (result.kubeconfigUsed) {
        message.success('Script executed successfully with KUBECONFIG');
      } else {
        message.success('Script executed successfully');
      }
    } catch (error) {
      setOutputModal(prev => ({
        ...prev,
        output: `Error executing script: ${error.message}`,
        loading: false
      }));
      message.error(`Script execution failed: ${error.message}`);
    }
  };

  const handleAddScript = () => {
    setEditingScript(null);
    setForm({
      name: '',
      description: '',
      scriptPath: '',
      arguments: ''
    });
    setModalVisible(true);
  };

  const handleEditScript = (script) => {
    setEditingScript(script);
    setForm({
      name: script.name,
      description: script.description,
      scriptPath: script.scriptPath,
      arguments: script.arguments
    });
    setModalVisible(true);
  };

  const handleDeleteScript = async (scriptId) => {
    try {
      const response = await scriptAPI.deleteScript(scriptId);
      if (response.success) {
        message.success('Script deleted successfully');
        await loadScripts(); // Reload scripts from backend
      } else {
        message.error('Failed to delete script');
      }
    } catch (error) {
      console.error('Delete script error:', error);
      message.error(`Failed to delete script: ${error.message}`);
    }
  };

  const handleQuickArgument = (value) => {
    setForm(prev => ({ ...prev, arguments: value }));
  };

  const columns = [
    {
      title: 'Script Details',
      key: 'details',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            <Text strong>{record.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <FileTextOutlined /> {record.scriptPath}
            </Text>
          </div>
          {record.description && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Arguments',
      dataIndex: 'arguments',
      key: 'arguments',
      render: (args) => (
        args ? (
          <Tooltip title={args}>
            <Text code style={{ fontSize: '12px' }}>
              {args.length > 40 ? `${args.substring(0, 40)}...` : args}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary" style={{ fontSize: '12px' }}>No arguments</Text>
        )
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Execute Script">
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              size="small"
              onClick={() => executeScript(record)}
            />
          </Tooltip>
          <Tooltip title="Edit Script">
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEditScript(record)}
            />
          </Tooltip>
          <Tooltip title="Delete Script">
            <Popconfirm
              title="Delete Script"
              description="Are you sure you want to delete this script?"
              onConfirm={() => handleDeleteScript(record.id)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                size="small"
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <Space>
          <FileTextOutlined />
          Script Manager
        </Space>
      </Title>

      {/* Database Operations Section */}
      {renderDatabaseOperations()}
      <AutoRecoveryControl />
      {/* Kubernetes Status */}
      {renderKubernetesStatus()}

      {/* Scripts Table */}
      <Card
        title={
          <Space>
            <CodeOutlined />
            Custom Scripts
            <Tag color="blue">{scripts.length}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddScript}
            >
              Add Script
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadScripts}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={scripts}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} scripts`,
          }}
          locale={{
            emptyText: 'No scripts found. Click "Add Script" to get started!'
          }}
        />
      </Card>

      {/* Add/Edit Script Modal */}
      <Modal
        title={
          <Space>
            {editingScript ? <EditOutlined /> : <PlusOutlined />}
            {editingScript ? 'Edit Script' : 'Add New Script'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSaveScript}
        width={700}
        okText={editingScript ? 'Update Script' : 'Add Script'}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Text strong>Script Name *</Text>
            <Input
              placeholder="Enter script name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              style={{ marginTop: 8 }}
            />
          </div>

          <div>
            <Text strong>Description</Text>
            <Input.TextArea
              placeholder="Enter script description (optional)"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              style={{ marginTop: 8 }}
              rows={3}
            />
          </div>

          <div>
            <Text strong>Script Path *</Text>
            <Input
              placeholder="e.g., C:\scripts\myscript.bat or /usr/local/bin/myscript.sh"
              value={form.scriptPath}
              onChange={(e) => setForm(prev => ({ ...prev, scriptPath: e.target.value }))}
              style={{ marginTop: 8 }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Full path to your script file or system command
            </Text>
          </div>

          <div>
            <Text strong>Arguments</Text>
            <div style={{ marginTop: 8 }}>
              <Input.TextArea
                placeholder="Enter command line arguments"
                value={form.arguments}
                onChange={(e) => setForm(prev => ({ ...prev, arguments: e.target.value }))}
                rows={2}
                style={{ marginBottom: 8 }}
              />
              <Text strong style={{ fontSize: '12px' }}>Quick Arguments:</Text>
              <div style={{ marginTop: 4 }}>
                <Space wrap>
                  {commonArguments.map((arg, index) => (
                    <Button
                      key={index}
                      size="small"
                      onClick={() => handleQuickArgument(arg.value)}
                      title={arg.description}
                    >
                      {arg.label}
                    </Button>
                  ))}
                </Space>
              </div>
            </div>
          </div>

          <Alert
            message="Kubernetes Scripts"
            description="No need to set environment variables manually."
            type="info"
            showIcon
          />
        </Space>
      </Modal>

      {/* Script Output Modal */}
      <Modal
        title={
          <Space>
            <CodeOutlined />
            Script Output: {outputModal.script?.name}
            <Tag color={outputModal.loading ? 'blue' : 'green'}>
              {outputModal.loading ? 'Running...' : 'Completed'}
            </Tag>
          </Space>
        }
        open={outputModal.visible}
        onCancel={() => setOutputModal({ visible: false, script: null, output: '', loading: false })}
        footer={[
          <Button 
            key="close" 
            type="primary"
            onClick={() => setOutputModal({ visible: false, script: null, output: '', loading: false })}
          >
            Close
          </Button>
        ]}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Text strong>Script:</Text>
              <br />
              <Text code style={{ fontSize: '12px' }}>{outputModal.script?.scriptPath}</Text>
            </Col>
            <Col span={12}>
              <Text strong>Arguments:</Text>
              <br />
              <Text code style={{ fontSize: '12px' }}>{outputModal.script?.arguments || 'None'}</Text>
            </Col>
          </Row>
        </div>

        <div>
          <Text strong>Output:</Text>
          <div style={{
            background: '#000',
            color: '#00ff00',
            padding: '16px',
            borderRadius: '6px',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '13px',
            maxHeight: '400px',
            overflow: 'auto',
            marginTop: '8px',
            whiteSpace: 'pre-wrap',
            border: '1px solid #333'
          }}>
            {outputModal.loading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <Text style={{ color: '#00ff00' }}>
                  ⏳ Executing operation... Please wait...
                </Text>
              </div>
            ) : (
              outputModal.output || 'No output generated'
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SimpleScriptManager;