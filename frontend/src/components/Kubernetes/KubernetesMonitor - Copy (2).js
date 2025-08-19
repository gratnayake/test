import React, { useState, useEffect } from 'react';
import { 
  Card, 
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
  Modal,
  Alert,
  message,
  Dropdown,
  Tooltip,
  Progress,
  Collapse,
  List,
  Avatar
} from 'antd';
import { 
  ReloadOutlined,
  HistoryOutlined,
  BarChartOutlined,
  EyeOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  DatabaseOutlined,
  NodeIndexOutlined,
  ClockCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

const EnhancedKubernetesMonitor = () => {
  const [pods, setPods] = useState([]);
  const [groupedPods, setGroupedPods] = useState({});
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [sortBy, setSortBy] = useState('lastSeen');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [namespaces, setNamespaces] = useState([]);
  const [expandedPanels, setExpandedPanels] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  const isPodPartiallyReady = (readinessRatio) => {
    if (!readinessRatio || typeof readinessRatio !== 'string') return false;
    
    const parts = readinessRatio.split('/');
    if (parts.length !== 2) return false;
    
    const ready = parseInt(parts[0]);
    const total = parseInt(parts[1]);
    
    return ready > 0 && ready < total;
  };

  const isPodNotReady = (readinessRatio) => {
    if (!readinessRatio || typeof readinessRatio !== 'string') return false;
    
    const parts = readinessRatio.split('/');
    if (parts.length !== 2) return false;
    
    const ready = parseInt(parts[0]);
    const total = parseInt(parts[1]);
    
    return ready === 0 && total > 0;
  };

  // Take snapshot of current pods
const takeSnapshot = async () => {
  try {
    const snapshotData = {
      name: snapshotName || `Snapshot ${new Date().toLocaleString()}`
    };
    
    const response = await fetch('/api/kubernetes/snapshot/take', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(snapshotData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      setSnapshot({
        name: result.snapshot.name,
        timestamp: result.snapshot.timestamp,
        original: result.snapshot.includedCount,
        excludedCount: result.snapshot.excludedCount
      });
      setSnapshotName('');
      
      if (result.snapshot.excludedCount > 0) {
        message.warning(`Snapshot taken! ${result.snapshot.excludedCount} partially ready pods were excluded.`);
      } else {
        message.success(`Snapshot taken: ${result.snapshot.name}`);
      }
      
      console.log('📸 Snapshot taken:', result);
    } else {
      message.error('Failed to take snapshot');
    }
  } catch (error) {
    console.error('Snapshot error:', error);
    message.error('Failed to take snapshot');
  }
};

// Clear snapshot
const clearSnapshot = async () => {
  try {
    const response = await fetch('/api/kubernetes/snapshot', {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      setSnapshot(null);
      setShowMissingOnly(false);
      message.info('Snapshot cleared');
    } else {
      message.error('Failed to clear snapshot');
    }
  } catch (error) {
    console.error('Clear snapshot error:', error);
    message.error('Failed to clear snapshot');
  }
};

// Get snapshot statistics
const getSnapshotStats = () => {
  if (!snapshot) return null;
  
  const missingPods = pods.filter(p => p.isMissing);
  const currentRunning = pods.filter(p => p.status === 'Running' && !p.isDeleted).length;
  
  return {
    original: snapshot.original,
    missing: missingPods.length,
    current: pods.length,
    recovered: currentRunning
  };
};
  // Auto refresh effect
  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadEnhancedPods();
      }, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedNamespace, includeDeleted, sortBy]);

  // Load data effects
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadEnhancedPods();
  }, [selectedNamespace, includeDeleted, sortBy]);

  // Load initial data (namespaces)
  const loadInitialData = async () => {
    try {
      const response = await fetch('/api/kubernetes/namespaces');
      const data = await response.json();
      if (data.success) {
        setNamespaces(data.data || []);
        // Expand all panels by default
        setExpandedPanels(data.data?.map(ns => ns.name) || []);
      }
    } catch (error) {
      console.error('Failed to load namespaces:', error);
      message.error('Failed to load namespaces');
    }
    
    loadEnhancedPods();
  };

  // Load enhanced pods data
  const loadEnhancedPods = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/kubernetes/pods/enhanced?namespace=${selectedNamespace}&includeDeleted=${includeDeleted}&sortBy=${sortBy}`);
      const data = await response.json();
      
      if (data.success) {
        setPods(data.data.pods);
        setStatistics(data.data.statistics);
        
        // Group pods by namespace
        const grouped = groupPodsByNamespace(data.data.pods);
        setGroupedPods(grouped);
        
        // Show notifications for important changes
        if (data.data.changes && data.data.changes.length > 0) {
          data.data.changes.forEach(change => {
            if (change.type === 'deleted') {
              message.warning(`Pod deleted: ${change.pod.namespace}/${change.pod.name}`, 3);
            } else if (change.type === 'created') {
              message.success(`New pod created: ${change.pod.namespace}/${change.pod.name}`, 3);
            } else if (change.type === 'status_change' && change.newStatus === 'Failed') {
              message.error(`Pod failed: ${change.pod.namespace}/${change.pod.name}`, 5);
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to load enhanced pods:', error);
      message.error('Failed to load pod data');
    } finally {
      setLoading(false);
    }
  };

  // Group pods by namespace
  const groupPodsByNamespace = (podList) => {
    const grouped = {};
    
    podList.forEach(pod => {
      if (!grouped[pod.namespace]) {
        grouped[pod.namespace] = [];
      }
      grouped[pod.namespace].push(pod);
    });

    // Sort pods within each namespace
    Object.keys(grouped).forEach(namespace => {
      grouped[namespace].sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'status':
            return a.status.localeCompare(b.status);
          case 'lastSeen':
            return new Date(b.lastSeen) - new Date(a.lastSeen);
          case 'firstSeen':
            return new Date(a.firstSeen) - new Date(b.firstSeen);
          default:
            return 0;
        }
      });
    });

    return grouped;
  };

  // Get status color for pods and namespaces
  const getStatusColor = (status, isDeleted = false) => {
    if (isDeleted) return '#ff4d4f';
    
    switch (status?.toLowerCase()) {
      case 'running': return '#52c41a';
      case 'pending': return '#faad14';
      case 'failed': return '#ff4d4f';
      case 'succeeded': return '#1890ff';
      default: return '#d9d9d9';
    }
  };

  // Get namespace statistics
  const getNamespaceStats = (namespaceName) => {
  const namespacePods = groupedPods[namespaceName] || [];
  const running = namespacePods.filter(p => p.status === 'Running' && !p.isDeleted && !p.isPartiallyReady && !p.isNotReady).length;
  const failed = namespacePods.filter(p => p.status === 'Failed' && !p.isDeleted).length;
  const pending = namespacePods.filter(p => p.status === 'Pending' && !p.isDeleted).length;
  const partiallyReady = namespacePods.filter(p => p.isPartiallyReady && !p.isDeleted).length;
  const notReady = namespacePods.filter(p => p.isNotReady && !p.isDeleted && !p.isMissing).length;
  const missing = namespacePods.filter(p => p.isMissing).length;
  const total = namespacePods.filter(p => !p.isDeleted).length;
  
  return { running, failed, pending, partiallyReady, notReady, missing, total, allPods: namespacePods.length };
};

  // Handle pod actions
  const handlePodAction = async (action, pod) => {
    try {
      let result;
      
      switch (action) {
        case 'restart':
          result = await fetch(`/api/kubernetes/pods/${pod.namespace}/${pod.name}/restart`, {
            method: 'POST'
          });
          break;
        case 'delete':
          result = await fetch(`/api/kubernetes/pods/${pod.namespace}/${pod.name}`, {
            method: 'DELETE'
          });
          break;
        case 'logs':
          // Open logs modal or new window
          message.info(`Opening logs for ${pod.name}`);
          return;
        case 'describe':
          message.info(`Describing ${pod.name}`);
          return;
        default:
          return;
      }

      const data = await result.json();
      if (data.success) {
        message.success(`${action} completed for ${pod.name}`);
        setTimeout(() => loadEnhancedPods(), 2000);
      } else {
        message.error(`Failed to ${action}: ${data.error}`);
      }
    } catch (error) {
      console.error(`Pod ${action} error:`, error);
      message.error(`Failed to ${action} pod: ${error.message}`);
    }
  };

  // Render pod item with actions
  const renderPodItem = (pod) => {
    
    const isPartiallyReady = isPodPartiallyReady(pod.readinessRatio || pod.ready);
    const isNotReady = isPodNotReady(pod.readinessRatio || pod.ready);
    
    const statusColor = getStatusColor(pod.status, pod.isDeleted);
    let backgroundColor = 'transparent';
    let borderLeft = 'none';
    let readinessColor = '#52c41a';

     if (pod.isMissing) {
      backgroundColor = '#fff2f0';
      borderLeft = '4px solid #ff4d4f';
      readinessColor = '#ff4d4f';
    } else if (isNotReady) {
      backgroundColor = '#fff2f0';
      borderLeft = '2px solid #ff4d4f';
      readinessColor = '#ff4d4f';
    } else if (isPartiallyReady) {
      backgroundColor = '#fff7e6';
      borderLeft = '3px solid #faad14';
      readinessColor = '#faad14'; // Orange for partially ready
    } else if (pod.isNewSinceSnapshot) {
      backgroundColor = '#f6ffed';
      borderLeft = '4px solid #52c41a';
    } else if (pod.isDeleted) {
      backgroundColor = '#fff2f0';
      borderLeft = '2px solid #ff4d4f';
      readinessColor = '#ff4d4f';
    }
    
    const actions = [
      <Button
        key="logs"
        type="text"
        size="small"
        icon={<FileTextOutlined />}
        onClick={() => handlePodAction('logs', pod)}
        disabled={pod.isDeleted}
        title="View Logs"
      />,
      <Button
        key="describe"
        type="text"
        size="small"
        icon={<InfoCircleOutlined />}
        onClick={() => handlePodAction('describe', pod)}
        disabled={pod.isDeleted}
        title="Describe Pod"
      />,
      <Dropdown
        key="more"
        menu={{
          items: [
            {
              key: 'restart',
              label: 'Restart Pod',
              icon: <ReloadOutlined />,
              disabled: pod.isDeleted,
              onClick: () => handlePodAction('restart', pod)
            },
            {
              key: 'delete',
              label: 'Delete Pod',
              icon: <StopOutlined />,
              disabled: pod.isDeleted,
              danger: true,
              onClick: () => handlePodAction('delete', pod)
            }
          ]
        }}
        trigger={['click']}
        disabled={pod.isDeleted}
      >
        <Button
          type="text"
          size="small"
          icon={<MoreOutlined />}
          title="More Actions"
        />
      </Dropdown>
    ];

    return (
    <List.Item
      actions={actions}
      style={{
        backgroundColor,
        borderLeft,
        opacity: pod.isDeleted || pod.isMissing ? 0.7 : 1,
        margin: '2px 0',
        borderRadius: '4px',
        padding: '8px 12px'
      }}
    >
      <List.Item.Meta
        avatar={
          <Badge dot color={pod.isMissing ? '#ff4d4f' : statusColor}>
            <Avatar 
              size="small" 
              style={{ 
                backgroundColor: pod.isMissing ? '#ff4d4f' : 
                                isPartiallyReady ? '#faad14' :
                                isNotReady ? '#ff4d4f' : statusColor, 
                fontSize: '10px' 
              }}
            >
              {pod.isMissing ? '❌' : 
               isPartiallyReady ? '⚠️' :
               isNotReady ? '🔴' :
               pod.name.charAt(0).toUpperCase()}
            </Avatar>
          </Badge>
        }
        title={
          <Space>
            <Text 
              strong={!pod.isDeleted && !pod.isMissing} 
              delete={pod.isDeleted}
              style={{ 
                color: pod.isMissing ? '#ff4d4f' : 
                       isPartiallyReady ? '#faad14' :
                       isNotReady ? '#ff4d4f' : undefined,
                fontWeight: pod.isMissing || isPartiallyReady || isNotReady ? 'bold' : undefined 
              }}
            >
              {pod.name}
            </Text>
            <Tag 
              color={pod.isMissing ? 'red' : 
                     isPartiallyReady ? 'orange' :
                     isNotReady ? 'red' : statusColor} 
              size="small"
            >
              {pod.isMissing ? `MISSING (${pod.missingReason})` : pod.status}
            </Tag>
            {pod.restarts > 0 && !pod.isMissing && (
              <Tag color="orange" size="small">
                {pod.restarts} restarts
              </Tag>
            )}
            {pod.isNewSinceSnapshot && (
              <Tag color="green" size="small">
                NEW
              </Tag>
            )}
            {isPartiallyReady && (
              <Tag color="orange" size="small">
                PARTIALLY READY
              </Tag>
            )}
            {isNotReady && !pod.isMissing && (
              <Tag color="red" size="small">
                NOT READY
              </Tag>
            )}
          </Space>
        }
        description={
          <Space size="large">
            <Text 
              type="secondary" 
              style={{ 
                fontSize: '12px',
                color: readinessColor,
                fontWeight: isPartiallyReady || isNotReady ? 'bold' : 'normal'
              }}
            >
              <DatabaseOutlined /> {pod.readinessRatio || pod.ready || '0/1'} Ready
            </Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <NodeIndexOutlined /> {pod.node || 'Unknown'}
            </Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <ClockCircleOutlined /> {pod.age || 'Unknown'}
            </Text>
            {pod.isMissing && (
              <Text type="danger" style={{ fontSize: '11px' }}>
                <WarningOutlined /> Missing from current state
              </Text>
            )}
            {isPartiallyReady && (
              <Text style={{ fontSize: '11px', color: '#faad14' }}>
                <WarningOutlined /> Some containers not ready
              </Text>
            )}
            {isNotReady && !pod.isMissing && (
              <Text type="danger" style={{ fontSize: '11px' }}>
                <WarningOutlined /> No containers ready
              </Text>
            )}
          </Space>
        }
      />
    </List.Item>
  );
  };

  // Render namespace panel
  const renderNamespacePanel = (namespaceName, pods) => {
    const stats = getNamespaceStats(namespaceName);
    
    const header = (
  <Row justify="space-between" align="middle" style={{ width: '100%' }}>
    <Col>
      <Space>
        <FolderOutlined style={{ color: '#1890ff' }} />
        <Text strong>{namespaceName}</Text>
        <Badge count={stats.running} color="#52c41a" />
        {stats.partiallyReady > 0 && (
          <Badge count={stats.partiallyReady} color="#faad14" />
        )}
        {stats.notReady > 0 && (
          <Badge count={stats.notReady} color="#ff4d4f" />
        )}
        {stats.failed > 0 && (
          <Badge count={stats.failed} color="#ff4d4f" />
        )}
        {stats.missing > 0 && (
          <Badge count={stats.missing} color="#ff4d4f" style={{ marginLeft: 4 }} />
        )}
      </Space>
    </Col>
    <Col>
      <Space>
        <Tag color="success" size="small">{stats.running} Ready</Tag>
        {stats.partiallyReady > 0 && <Tag color="warning" size="small">{stats.partiallyReady} Partial</Tag>}
        {stats.notReady > 0 && <Tag color="error" size="small">{stats.notReady} Not Ready</Tag>}
        {stats.failed > 0 && <Tag color="error" size="small">{stats.failed} Failed</Tag>}
        {stats.pending > 0 && <Tag color="warning" size="small">{stats.pending} Pending</Tag>}
        {stats.missing > 0 && <Tag color="error" size="small">{stats.missing} Missing</Tag>}
      </Space>
    </Col>
  </Row>
);

    return (
      <Panel
        key={namespaceName}
        header={header}
        style={{
          marginBottom: 8,
          border: `1px solid ${stats.failed > 0 ? '#ff4d4f' : '#d9d9d9'}`,
          borderRadius: 6
        }}
      >
        <List
          itemLayout="horizontal"
          dataSource={pods}
          renderItem={renderPodItem}
          size="small"
          style={{ backgroundColor: '#fafafa', padding: '8px', borderRadius: '4px' }}
        />
      </Panel>
    );
  };

  return (
    <div>
      {/* Statistics Cards */}
      {statistics && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Total Pods"
                value={statistics.total || 0}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Running"
                value={statistics.running || 0}
                valueStyle={{ color: '#52c41a' }}
                prefix={<PlayCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Failed"
                value={statistics.failed || 0}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Namespaces"
                value={Object.keys(groupedPods).length}
                prefix={<FolderOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Control Panel */}
      {snapshot && (
        <Card style={{ marginBottom: 16, backgroundColor: '#f0f8ff', border: '1px solid #1890ff' }}>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} md={8}>
              <Space>
                <Text strong style={{ color: '#1890ff' }}>📸 Snapshot Active:</Text>
                <Text>{snapshot.name}</Text>
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <Space size="large">
                {(() => {
                  const stats = getSnapshotStats();
                  return (
                    <>
                      <Text type="success">Included: {stats.original}</Text>
                      <Text type="danger">Missing: {stats.missing}</Text>
                      <Text type="secondary">Current: {stats.current}</Text>
                      {snapshot.excludedCount > 0 && (
                        <Text type="warning">Excluded: {snapshot.excludedCount}</Text>
                      )}
                    </>
                  );
                })()}
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <Space>
                <Switch
                  checked={showMissingOnly}
                  onChange={setShowMissingOnly}
                  checkedChildren="Missing Only"
                  unCheckedChildren="Show All"
                />
                <Button
                  size="small"
                  onClick={clearSnapshot}
                  icon={<StopOutlined />}
                >
                  Clear Snapshot
                </Button>
              </Space>
            </Col>
          </Row>
          {snapshot.excludedCount > 0 && (
            <Alert
              type="info"
              showIcon
              message={`${snapshot.excludedCount} pods were excluded from this snapshot`}
              description={
                <div>
                  Excluded pods: 
                  {snapshot.excludedReasons?.completed > 0 && ` ${snapshot.excludedReasons.completed} completed jobs,`}
                  {snapshot.excludedReasons?.failed > 0 && ` ${snapshot.excludedReasons.failed} failed pods,`}
                  {snapshot.excludedReasons?.partiallyReady > 0 && ` ${snapshot.excludedReasons.partiallyReady} partially ready pods.`}
                  <br />
                  Only running and fully ready pods are included in snapshots.
                </div>
              }
              style={{ marginTop: 12 }}
            />
          )}
        </Card>
      )}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={6}>
            <Space>
              <Text>Namespace:</Text>
              <Select
                value={selectedNamespace}
                onChange={setSelectedNamespace}
                style={{ width: 150 }}
                loading={namespaces.length === 0}
              >
                <Option value="all">All Namespaces</Option>
                {namespaces.map(ns => (
                  <Option key={ns.name} value={ns.name}>{ns.name}</Option>
                ))}
              </Select>
            </Space>
          </Col>

          <Col xs={24} md={4}>
            <Space>
              <Text>Include Deleted:</Text>
              <Switch
                checked={includeDeleted}
                onChange={setIncludeDeleted}
                size="small"
              />
            </Space>
          </Col>

          <Col xs={24} md={4}>
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

          <Col xs={24} md={6}>
            <Space>
              <input
                type="text"
                placeholder="Snapshot name..."
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                style={{ 
                  padding: '4px 8px', 
                  borderRadius: '4px', 
                  border: '1px solid #d9d9d9',
                  fontSize: '12px',
                  width: '120px'
                }}
              />
              <Button
                icon={<EyeOutlined />}
                onClick={takeSnapshot}
                type="primary"
                size="small"
              >
                Snapshot
              </Button>
            </Space>
          </Col>

          <Col xs={24} md={4}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Last updated: {new Date().toLocaleTimeString()}
              {snapshot && (
                <div>Snapshot: {snapshot.timestamp}</div>
              )}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Grouped Pods Display */}
      <Card 
        title={`Kubernetes Pods - Grouped by Namespace (${pods.length} total pods)`}
        loading={loading}
      >
        {Object.keys(groupedPods).length > 0 ? (
          <Collapse
            activeKey={expandedPanels}
            onChange={setExpandedPanels}
            expandIconPosition="right"
            ghost={false}
            size="small"
          >
            {Object.keys(groupedPods)
              .sort()
              .map(namespaceName => 
                renderNamespacePanel(namespaceName, groupedPods[namespaceName])
              )}
          </Collapse>
        ) : (
          <Alert
            message="No pods found"
            description="No Kubernetes pods were found with the current filters."
            type="info"
            showIcon
          />
        )}
      </Card>

      {/* Custom styles */}
      <style jsx>{`
        .ant-collapse-header {
          padding: 12px 16px !important;
        }
        
        .ant-list-item {
          padding: 8px 12px !important;
        }
        
        .ant-list-item-meta-title {
          margin-bottom: 4px !important;
        }
        
        .ant-badge-dot {
          box-shadow: 0 0 0 1px #fff;
        }
      `}</style>
    </div>
  );
};

export default EnhancedKubernetesMonitor;