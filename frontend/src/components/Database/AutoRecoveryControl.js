// frontend/src/components/Database/AutoRecoveryControl.js
import React, { useState, useEffect } from 'react';
import {
  Card,
  Switch,
  Button,
  Space,
  Typography,
  Alert,
  Badge,
  Tooltip,
  Row,
  Col,
  Timeline,
  Divider,
  message,
  Popconfirm
} from 'antd';
import {
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  BugOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

const AutoRecoveryControl = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadStatus();
    // Refresh status every 10 seconds
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/auto-recovery/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data.data);
      } else {
        console.error('Failed to load auto-recovery status');
      }
    } catch (error) {
      console.error('Error loading auto-recovery status:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutoRecovery = async (enabled) => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/auto-recovery/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ enabled })
      });

      if (response.ok) {
        const data = await response.json();
        message.success(data.message);
        await loadStatus();
      } else {
        const error = await response.json();
        message.error(error.message || 'Failed to toggle auto-recovery');
      }
    } catch (error) {
      console.error('Error toggling auto-recovery:', error);
      message.error('Failed to toggle auto-recovery');
    } finally {
      setActionLoading(false);
    }
  };

  const resetAttempts = async () => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/auto-recovery/reset', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        message.success(data.message);
        await loadStatus();
      } else {
        const error = await response.json();
        message.error(error.message || 'Failed to reset attempts');
      }
    } catch (error) {
      console.error('Error resetting attempts:', error);
      message.error('Failed to reset attempts');
    } finally {
      setActionLoading(false);
    }
  };

  const testRecovery = async () => {
    setActionLoading(true);
    try {
      const response = await fetch('/api/auto-recovery/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        message.success('Recovery test completed');
        await loadStatus();
      } else {
        const error = await response.json();
        message.error(error.message || 'Recovery test failed');
      }
    } catch (error) {
      console.error('Error testing recovery:', error);
      message.error('Recovery test failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Card title="Database Auto-Recovery" loading={true}>
        Loading auto-recovery status...
      </Card>
    );
  }

  const getStatusBadge = () => {
    if (status?.inProgress) {
      return <Badge status="processing" text="Recovery In Progress" />;
    }
    if (status?.enabled) {
      return <Badge status="success" text="Enabled" />;
    }
    return <Badge status="default" text="Disabled" />;
  };

  const getAttemptsColor = () => {
    if (status?.attempts >= status?.maxAttempts) return '#ff4d4f';
    if (status?.attempts > 0) return '#faad14';
    return '#52c41a';
  };

  return (
    <Card
      title={
        <Space>
          <ReloadOutlined />
          <span>Database Auto-Recovery</span>
          {getStatusBadge()}
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={loadStatus}
          loading={loading}
          size="small"
        >
          Refresh
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      {/* Script Status Summary */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Space direction="vertical" size="small">
            <Text strong>Stop Script:</Text>
            <Space>
              {status?.config?.stopScriptFound ? (
                <Text style={{ color: '#52c41a' }}>✅ "Stop Pods" found</Text>
              ) : (
                <Text style={{ color: '#ff4d4f' }}>❌ "Stop Pods" not found</Text>
              )}
            </Space>
          </Space>
        </Col>
        <Col xs={24} md={12}>
          <Space direction="vertical" size="small">
            <Text strong>Start Script:</Text>
            <Space>
              {status?.config?.startScriptFound ? (
                <Text style={{ color: '#52c41a' }}>✅ "Start Pods" found</Text>
              ) : (
                <Text style={{ color: '#ff4d4f' }}>❌ "Start Pods" not found</Text>
              )}
            </Space>
          </Space>
        </Col>
      </Row>

      {/* Main Controls */}
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} sm={12}>
          <Space direction="vertical" size="small">
            <Text strong>Auto-Recovery Status:</Text>
            <Space>
              <Switch
                checked={status?.enabled || false}
                onChange={toggleAutoRecovery}
                loading={actionLoading}
                checkedChildren="ON"
                unCheckedChildren="OFF"
              />
              <Text style={{ color: status?.enabled ? '#52c41a' : '#8c8c8c' }}>
                {status?.enabled ? 'Enabled' : 'Disabled'}
              </Text>
            </Space>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Automatically runs "Stop Pods" → restart DB → "Start Pods"
            </Text>
          </Space>
        </Col>

        <Col xs={24} sm={12}>
          <Space direction="vertical" size="small">
            <Text strong>Recovery Attempts:</Text>
            <Space>
              <Text style={{ color: getAttemptsColor() }}>
                {status?.attempts || 0} / {status?.maxAttempts || 3}
              </Text>
              {(status?.attempts || 0) > 0 && (
                <Tooltip title="Reset recovery attempts counter">
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={resetAttempts}
                    loading={actionLoading}
                  >
                    Reset
                  </Button>
                </Tooltip>
              )}
            </Space>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Current attempt count (resets on successful recovery)
            </Text>
          </Space>
        </Col>
      </Row>

      <Divider />

      {/* Status Alerts */}
      {(!status?.config?.stopScriptFound || !status?.config?.startScriptFound) && (
        <Alert
          message="Scripts Missing"
          description={
            <div>
              Please create scripts in your Script Manager named exactly:
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                {!status?.config?.stopScriptFound && <li><strong>"Stop Pods"</strong> - for stopping services when DB goes down</li>}
                {!status?.config?.startScriptFound && <li><strong>"Start Pods"</strong> - for starting services when DB comes back up</li>}
              </ul>
            </div>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {status?.inProgress && (
        <Alert
          message="Recovery In Progress"
          description="Auto-recovery is currently attempting to restart the database. Please wait..."
          type="info"
          icon={<ClockCircleOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {(status?.attempts || 0) >= (status?.maxAttempts || 3) && (
        <Alert
          message="Maximum Attempts Reached"
          description={`Auto-recovery has reached the maximum number of attempts (${status?.maxAttempts || 3}). Manual intervention may be required.`}
          type="error"
          icon={<WarningOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={resetAttempts} loading={actionLoading}>
              Reset Attempts
            </Button>
          }
        />
      )}

      {/* Action Buttons */}
      <Row gutter={16}>
        <Col>
          <Popconfirm
            title="Test Auto-Recovery"
            description="This will run Stop Pods → restart database → Start Pods. Are you sure?"
            onConfirm={testRecovery}
            okText="Yes, Test It"
            cancelText="Cancel"
          >
            <Button
              icon={<BugOutlined />}
              loading={actionLoading}
              disabled={status?.inProgress || !status?.config?.stopScriptFound || !status?.config?.startScriptFound}
            >
              Test Recovery
            </Button>
          </Popconfirm>
        </Col>
      </Row>

      {/* Recovery Log */}
      {status?.log && status.log.length > 0 && (
        <>
          <Divider />
          <Title level={5}>Recent Recovery Activity</Title>
          <Timeline size="small">
            {status.log.slice(-5).reverse().map((entry, index) => {
              const getIcon = () => {
                switch (entry.status) {
                  case 'SUCCESS':
                    return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
                  case 'PARTIAL_SUCCESS':
                    return <WarningOutlined style={{ color: '#faad14' }} />;
                  case 'FAILED':
                  case 'ERROR':
                  case 'RESTART_FAILED':
                    return <StopOutlined style={{ color: '#ff4d4f' }} />;
                  case 'MAX_ATTEMPTS_REACHED':
                    return <WarningOutlined style={{ color: '#faad14' }} />;
                  default:
                    return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
                }
              };

              return (
                <Timeline.Item key={index} dot={getIcon()}>
                  <Text strong>{entry.status}</Text>
                  <br />
                  <Text type="secondary">{entry.message}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    {new Date(entry.timestamp).toLocaleString()} (Attempt #{entry.attempt})
                  </Text>
                </Timeline.Item>
              );
            })}
          </Timeline>
        </>
      )}

      {/* How It Works */}
      <Divider />
      <Title level={5}>How Auto-Recovery Works</Title>
      <Timeline size="small">
        <Timeline.Item dot={<PlayCircleOutlined />}>
          <Text>Runs your "Stop Pods" script</Text>
        </Timeline.Item>
        <Timeline.Item dot={<ReloadOutlined />}>
          <Text>Attempts to restart the Oracle database service</Text>
        </Timeline.Item>
        <Timeline.Item dot={<ClockCircleOutlined />}>
          <Text>Waits for database to come back online</Text>
        </Timeline.Item>
        <Timeline.Item dot={<CheckCircleOutlined />}>
          <Text>Runs your "Start Pods" script</Text>
        </Timeline.Item>
      </Timeline>

      <Alert
        message="Required Scripts"
        description={
          <div>
            <strong>Create these scripts in your Script Manager:</strong>
            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
              <li><strong>"Stop Pods"</strong> - Script to run when database goes down (e.g., your mtctl.cmd stop command)</li>
              <li><strong>"Start Pods"</strong> - Script to run when database comes back up (e.g., your mtctl.cmd start command)</li>
            </ul>
            <em>Script names must match exactly (case-sensitive).</em>
          </div>
        }
        type="info"
        showIcon
        style={{ marginTop: 16 }}
      />
    </Card>
  );
};

export default AutoRecoveryControl;