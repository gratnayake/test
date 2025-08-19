// Modified KubernetesMonitor.js - Remove namespace filtering

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  Tag, 
  Typography, 
  Row, 
  Col,
  Switch,
  Select,
  Statistic,
  Badge,
  Timeline,
  Modal,
  Alert,
  message,
  Dropdown,
  Tooltip,
  Progress,
  PoweroffOutlined,  
  InputNumber,
  Popconfirm 
} from 'antd';
import { 
  ScissorOutlined,
  ReloadOutlined,
  DeleteOutlined,
  HistoryOutlined,
  BarChartOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  ExpandOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';

import { kubernetesAPI } from '../../services/api';
import PodActions from './PodActions';

const { Text, Title } = Typography;
const { Option } = Select;

const EnhancedKubernetesMonitor = () => {
  const [pods, setPods] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  // REMOVED: const [selectedNamespace, setSelectedNamespace] = useState('all');
  // REMOVED: const [includeDeleted, setIncludeDeleted] = useState(true);
  const [sortBy, setSortBy] = useState('lastSeen');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [historyModal, setHistoryModal] = useState({ visible: false, pod: null });
  const [changes, setChanges] = useState([]);
  // REMOVED: const [namespaces, setNamespaces] = useState([]);
  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [selectedPod, setSelectedPod] = useState(null);
  const [newReplicaCount, setNewReplicaCount] = useState(1);
  const [deploymentInfo, setDeploymentInfo] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadEnhancedPods();
  }, [sortBy]); // REMOVED: selectedNamespace, includeDeleted from dependencies

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadEnhancedPods();
      }, 10000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, sortBy]); // REMOVED: selectedNamespace, includeDeleted

  const loadInitialData = async () => {
    // REMOVED: namespace loading code since we don't need it
    loadEnhancedPods();
  };

const loadEnhancedPods = async () => {
  try {
    setLoading(true);
    
    const apiUrl = `/api/kubernetes/pods/enhanced?namespace=all&includeDeleted=false&sortBy=${sortBy}`;
    console.log('🔍 Making API call to:', apiUrl);
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    console.log('📡 API Response:', data);
    console.log('📦 Pods data:', data.data?.pods);
    console.log('📊 Statistics:', data.data?.statistics);
    console.log('🔔 Changes/Alerts:', data.data?.changes);
    
    if (data.success) {
      const podsData = data.data.pods || [];
      console.log(`✅ Setting ${podsData.length} active pods to state`);
      
      setPods(podsData);
      setStatistics(data.data.statistics);
      setChanges(data.data.changes || []);
      
      // ENHANCED: Handle different types of alerts
      if (data.data.changes && data.data.changes.length > 0) {
        data.data.changes.forEach(change => {
          if (change.type === 'created') {
            message.success(`New pod created: ${change.pod.namespace}/${change.pod.name}`, 3);
          } else if (change.type === 'status_change' && change.newStatus === 'Failed') {
            message.error(`Pod failed: ${change.pod.namespace}/${change.pod.name}`, 5);
          } else if (change.type === 'namespace_stopped') {
            // SPECIAL ALERT for stop operations
            message.warning({
              content: (
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    🛑 Namespace Stopped: {change.namespace}
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    {change.podCount} pods have been stopped/scaled down
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                    {change.pods.slice(0, 3).map(p => p.name).join(', ')}
                    {change.pods.length > 3 && ` and ${change.pods.length - 3} more...`}
                  </div>
                </div>
              ),
              duration: 8, // Show longer for stop alerts
              key: `stop-${change.namespace}` // Prevent duplicates
            });
            
            console.log(`🛑 Stop alert: ${change.podCount} pods stopped in ${change.namespace}`);
          }
        });
      }
      
      console.log('📋 Active pods being displayed:', podsData.slice(0, 5).map(p => ({
        name: p.name,
        namespace: p.namespace,
        status: p.status
      })));
      
    } else {
      console.error('❌ API returned success: false', data);
      message.error(`Failed to load pods: ${data.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('❌ API call failed:', error);
    message.error('Failed to load pod data');
  } finally {
    setLoading(false);
  }
};

  const handleViewHistory = async (pod) => {
    try {
      const response = await fetch(`/api/kubernetes/pods/${pod.namespace}/${pod.name}/history`);
      const data = await response.json();
      
      if (data.success) {
        setHistoryModal({
          visible: true,
          pod: data.data
        });
      }
    } catch (error) {
      console.error('Failed to load pod history:', error);
      message.error('Failed to load pod history');
    }
  };

  const handleViewLogs = (pod) => {
    message.info(`Viewing logs for ${pod.namespace}/${pod.name}`);
  };

  // Helper function to extract deployment name
  const getDeploymentName = (podName) => {
    const parts = podName.split('-');
    if (parts.length >= 3) {
      return parts.slice(0, -2).join('-');
    }
    return podName;
  };

  // Rest of your action handlers remain the same...
  const handleRestartPod = async (pod) => {
    try {
      setActionLoading(true);
      message.loading('Restarting pod...', 0);
      
      const result = await kubernetesAPI.restartPod(pod.namespace, pod.name);
      
      message.destroy();
      if (result.success) {
        message.success(`Pod ${pod.name} restart initiated`);
        setTimeout(loadEnhancedPods, 2000);
      } else {
        message.error(`Failed to restart pod: ${result.error}`);
      }
    } catch (error) {
      message.destroy();
      console.error('Restart pod error:', error);
      message.error(`Failed to restart pod: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleShowScaleModal = async (pod) => {
    try {
      setSelectedPod(pod);
      
      const result = await kubernetesAPI.getDeploymentInfo(pod.namespace, pod.name);
      if (result.success) {
        setDeploymentInfo(result.data);
        setNewReplicaCount(result.data.currentReplicas || 1);
      }
      
      setScaleModalVisible(true);
    } catch (error) {
      console.error('Get deployment info error:', error);
      setScaleModalVisible(true);
    }
  };

  const handleScaleDeployment = async () => {
    try {
      setActionLoading(true);
      const deploymentName = getDeploymentName(selectedPod.name);
      
      const result = await kubernetesAPI.scaleDeployment(
        selectedPod.namespace, 
        deploymentName, 
        newReplicaCount
      );
      
      if (result.success) {
        message.success(`Deployment scaled to ${newReplicaCount} replicas`);
        setScaleModalVisible(false);
        setTimeout(loadEnhancedPods, 2000);
      } else {
        message.error(`Failed to scale deployment: ${result.error}`);
      }
    } catch (error) {
      console.error('Scale deployment error:', error);
      message.error(`Failed to scale deployment: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopDeployment = async (pod) => {
    try {
      setActionLoading(true);
      message.loading('Stopping deployment...', 0);
      
      const deploymentName = getDeploymentName(pod.name);
      const result = await kubernetesAPI.scaleDeployment(pod.namespace, deploymentName, 0);
      
      message.destroy();
      if (result.success) {
        message.success(`Deployment ${deploymentName} stopped`);
        setTimeout(loadEnhancedPods, 2000);
      } else {
        message.error(`Failed to stop deployment: ${result.error}`);
      }
    } catch (error) {
      message.destroy();
      console.error('Stop deployment error:', error);
      message.error(`Failed to stop deployment: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDescribePod = (pod) => {
    message.info(`Describing pod ${pod.namespace}/${pod.name}`);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'running': return 'green';
      case 'pending': return 'orange';
      case 'failed': return 'red';
      case 'succeeded': return 'blue';
      default: return 'default';
    }
  };

  const getLifecycleStageIcon = (stage) => {
    switch (stage) {
      case 'stable': return '🟢';
      case 'starting': return '🟡';
      case 'failed': return '🔴';
      case 'completed': return '🔵';
      default: return '❓';
    }
  };

  const getPodActionsMenu = (pod) => {
    const items = [
      {
        key: 'restart',
        icon: <ReloadOutlined />,
        label: 'Restart Pod',
        onClick: () => handleRestartPod(pod)
      },
      {
        key: 'scale',
        icon: <ScissorOutlined />,
        label: 'Scale Deployment',
        onClick: () => handleShowScaleModal(pod)
      },
      {
        type: 'divider'
      },
      {
        key: 'logs',
        icon: <FileTextOutlined />,
        label: 'View Logs',
        onClick: () => handleViewLogs(pod)
      },
      {
        key: 'describe',
        icon: <InfoCircleOutlined />,
        label: 'Describe Pod',
        onClick: () => handleDescribePod(pod)
      },
      {
        type: 'divider'
      },
      {
        key: 'stop',
        label: (
          <Popconfirm
            title="Stop Deployment"
            description="Are you sure you want to stop this deployment? All pods will be terminated."
            onConfirm={() => handleStopDeployment(pod)}
            okText="Yes, Stop"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <span style={{ color: '#ff4d4f' }}>Stop Deployment</span>
          </Popconfirm>
        ),
        danger: true
      }
    ];   

    return { items };
  };

  const enhancedColumns = [
    {
      title: 'Pod Details',
      key: 'details',
      width: 250,
      render: (_, pod) => (
        <Space direction="vertical" size="small">
          <div>
            <Text strong>{pod.name}</Text>
          </div>
          <div>
            <Tag color="blue" style={{ fontSize: '11px' }}>
              {pod.namespace}
            </Tag>
          </div>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, pod) => (
        <Space direction="vertical" size="small">
          <Tag color={getStatusColor(pod.status)}>
            {pod.status}
          </Tag>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {pod.readinessRatio || '0/1'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Age',
      key: 'age',
      width: 100,
      render: (_, pod) => (
        <Space direction="vertical" size="small">
          <Text style={{ fontSize: '12px' }}>
            {pod.age || 'Unknown'}
          </Text>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {pod.lastSeen ? new Date(pod.lastSeen).toLocaleTimeString() : 'N/A'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Restarts',
      key: 'restarts',
      width: 80,
      render: (_, pod) => {
        const restarts = pod.restarts || 0;
        return (
          <Tooltip title={`${restarts} restart${restarts !== 1 ? 's' : ''}`}>
            <Badge 
              count={restarts} 
              showZero 
              style={{ 
                backgroundColor: restarts > 5 ? '#ff4d4f' : 
                                restarts > 0 ? '#fa8c16' : '#52c41a' 
              }}
            />
          </Tooltip>
        );
      },
    },
    {
      title: 'Node',
      dataIndex: 'node',
      key: 'node',
      width: 120,
      ellipsis: true,
      render: (node) => (
        <Tooltip title={node}>
          <Text style={{ fontSize: '12px' }}>{node || 'Unknown'}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, pod) => (
        <Space size="small">
          <Tooltip title="View History">
            <Button
              type="text"
              icon={<HistoryOutlined />}
              size="small"
              onClick={() => handleViewHistory(pod)}
            />
          </Tooltip>
          <Dropdown
            menu={getPodActionsMenu(pod)}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button
              type="text"
              icon={<MoreOutlined />}
              size="small"
            />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Statistics Cards */}
      {statistics && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Total Pods"
                value={statistics.total}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Running"
                value={statistics.running}
                prefix={<PlayCircleOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Pending"
                value={statistics.pending}
                prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Failed"
                value={statistics.failed}
                prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Recent Changes Alert */}
      {changes.length > 0 && (
        <Alert
          message="Recent Pod Changes"
          description={
            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {changes.slice(0, 3).map((change, index) => (
                <div key={index} style={{ marginBottom: 4 }}>
                  {change.type === 'created' && (
                    <Text>
                      <Badge status="success" style={{ marginRight: 8 }} />
                      New pod: <Text strong>{change.pod.namespace}/{change.pod.name}</Text>
                    </Text>
                  )}
                  {change.type === 'status_change' && (
                    <Text>
                      <Badge status="warning" style={{ marginRight: 8 }} />
                      Status change: <Text strong>{change.pod.namespace}/{change.pod.name}</Text>
                      <span> ({change.oldStatus} → {change.newStatus})</span>
                    </Text>
                  )}
                  {/* NEW: Handle stop operations */}
                  {change.type === 'namespace_stopped' && (
                    <Text>
                      <Badge status="error" style={{ marginRight: 8 }} />
                      <Text strong style={{ color: '#ff4d4f' }}>
                        🛑 {change.podCount} pods stopped in '{change.namespace}'
                      </Text>
                      <div style={{ fontSize: '11px', marginLeft: 16, opacity: 0.8 }}>
                        {change.pods.slice(0, 3).map(p => p.name).join(', ')}
                        {change.pods.length > 3 && ` and ${change.pods.length - 3} more...`}
                      </div>
                    </Text>
                  )}
                </div>
              ))}
              {changes.length > 3 && (
                <Text type="secondary">... and {changes.length - 3} more changes</Text>
              )}
            </div>
          }
          type={changes.some(c => c.type === 'namespace_stopped') ? "warning" : "info"}
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      {/* SIMPLIFIED Control Panel - Removed namespace dropdown and include deleted toggle */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={6}>
            <Space>
              <Text>Sort by:</Text>
              <Select
                value={sortBy}
                onChange={setSortBy}
                style={{ width: 120 }}
              >
                <Option value="lastSeen">Last Seen</Option>
                <Option value="name">Name</Option>
                <Option value="status">Status</Option>
                <Option value="firstSeen">Created</Option>
              </Select>
            </Space>
          </Col>

          <Col xs={24} md={6}>
            <Space>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={loadEnhancedPods}
                loading={loading}
              >
                Refresh
              </Button>
              <Switch
                checked={autoRefresh}
                onChange={setAutoRefresh}
                checkedChildren="Auto"
                unCheckedChildren="Manual"
              />
            </Space>
          </Col>

          <Col xs={24} md={4}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Last updated: {new Date().toLocaleTimeString()}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Enhanced Pod Table */}
      <Card title={`Pod Monitor - All Namespaces (${pods.length} pods)`}>
        <Table
          columns={enhancedColumns}
          dataSource={pods}
          rowKey={(pod) => `${pod.namespace}-${pod.name}-${pod.firstSeen || Date.now()}`}
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} pods`,
          }}
          scroll={{ x: 1200 }}
          locale={{
            emptyText: (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', marginBottom: '8px' }}>
                  No pods found
                </div>
                <div style={{ color: '#666', fontSize: '14px' }}>
                  No pods are currently running in any namespace
                </div>
                <div style={{ marginTop: '12px' }}>
                  <Button 
                    icon={<ReloadOutlined />} 
                    onClick={loadEnhancedPods}
                    type="primary"
                    size="small"
                  >
                    Refresh
                  </Button>
                </div>
              </div>
            )
          }}
        />
      </Card>

      {/* Pod History Modal */}
      <Modal
        title={
          <Space>
            <HistoryOutlined />
            Pod Lifecycle History
          </Space>
        }
        open={historyModal.visible}
        onCancel={() => setHistoryModal({ visible: false, pod: null })}
        footer={null}
        width={800}
      >
        {historyModal.pod && (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Space direction="vertical" size="small">
                    <div>
                      <Text strong>Pod Name:</Text> {historyModal.pod.pod.name}
                    </div>
                    <div>
                      <Text strong>Namespace:</Text> {historyModal.pod.pod.namespace}
                    </div>
                    <div>
                      <Text strong>Current Status:</Text> 
                      <Tag 
                        color={getStatusColor(historyModal.pod.pod.status)}
                        style={{ marginLeft: 8 }}
                      >
                        {historyModal.pod.pod.status}
                      </Tag>
                    </div>
                  </Space>
                </Col>
                <Col span={12}>
                  <Space direction="vertical" size="small">
                    <div>
                      <Text strong>First Seen:</Text> {new Date(historyModal.pod.pod.firstSeen).toLocaleString()}
                    </div>
                    <div>
                      <Text strong>Last Seen:</Text> {new Date(historyModal.pod.pod.lastSeen).toLocaleString()}
                    </div>
                    <div>
                      <Text strong>Age:</Text> {historyModal.pod.pod.age}
                    </div>
                  </Space>
                </Col>
              </Row>
            </Card>

            <Card title="Status History" size="small">
              <Timeline
                items={historyModal.pod.statusHistory?.map((event, index) => ({
                  color: event.event === 'created' ? 'green' : 
                         event.event === 'status_change' ? 'blue' : 
                         event.event === 'restart' ? 'orange' : 'default',
                  children: (
                    <div key={index}>
                      <div style={{ marginBottom: 4 }}>
                        <Text strong>{event.status}</Text>
                        <Text type="secondary" style={{ marginLeft: 8, fontSize: '12px' }}>
                          {new Date(event.timestamp).toLocaleString()}
                        </Text>
                      </div>
                      {event.previousStatus && (
                        <div>
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            Changed from {event.previousStatus}
                          </Text>
                        </div>
                      )}
                      {event.event === 'restart' && (
                        <div>
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            Restart #{event.restartCount}
                          </Text>
                        </div>
                      )}
                    </div>
                  )
                }))}
              />
            </Card>
          </div>
        )}
      </Modal>

      {/* Scale Deployment Modal */}
      <Modal
        title={
          <Space>
            <ScissorOutlined />
            Scale Deployment
          </Space>
        }
        open={scaleModalVisible}
        onCancel={() => setScaleModalVisible(false)}
        onOk={handleScaleDeployment}
        confirmLoading={actionLoading}
        okText="Scale"
      >
        {selectedPod && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <p><strong>Pod:</strong> {selectedPod.name}</p>
              <p><strong>Namespace:</strong> {selectedPod.namespace}</p>
              <p><strong>Deployment:</strong> {getDeploymentName(selectedPod.name)}</p>
              {deploymentInfo && (
                <p><strong>Current Replicas:</strong> {deploymentInfo.currentReplicas}</p>
              )}
            </div>

            <div>
              <p><strong>New Replica Count:</strong></p>
              <InputNumber
                min={0}
                max={20}
                value={newReplicaCount}
                onChange={setNewReplicaCount}
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Set to 0 to stop all pods, or increase to scale up
              </p>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default EnhancedKubernetesMonitor;