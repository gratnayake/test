import React, { useState } from 'react';
import { 
  Button, 
  Dropdown, 
  Space, 
  Modal, 
  message, 
  Tooltip,
  Popconfirm,
  InputNumber
} from 'antd';
import { 
  ReloadOutlined,
  PoweroffOutlined,
  PlayCircleOutlined,
  MoreOutlined,
  ExclamationCircleOutlined,
  ScissorOutlined
} from '@ant-design/icons';
import { kubernetesAPI } from '../../services/api';

const PodActions = ({ pod, onPodAction }) => {
  const [loading, setLoading] = useState(false);
  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [newReplicaCount, setNewReplicaCount] = useState(1);
  const [deploymentInfo, setDeploymentInfo] = useState(null);

  // Extract deployment name from pod name
  const getDeploymentName = (podName) => {
    // Remove ReplicaSet hash and pod hash (last 2 parts)
    const parts = podName.split('-');
    if (parts.length >= 3) {
      return parts.slice(0, -2).join('-');
    }
    return podName;
  };

  const handleRestartPod = async () => {
    try {
      setLoading(true);
      const result = await kubernetesAPI.restartPod(pod.namespace, pod.name);
      
      if (result.success) {
        message.success(`Pod ${pod.name} restart initiated`);
        if (onPodAction) onPodAction('restart', pod);
      } else {
        message.error(`Failed to restart pod: ${result.error}`);
      }
    } catch (error) {
      console.error('Restart pod error:', error);
      message.error(`Failed to restart pod: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleScaleDeployment = async (replicas) => {
    try {
      setLoading(true);
      const deploymentName = getDeploymentName(pod.name);
      
      const result = await kubernetesAPI.scaleDeployment(pod.namespace, deploymentName, replicas);
      
      if (result.success) {
        message.success(`Deployment scaled to ${replicas} replicas`);
        if (onPodAction) onPodAction('scale', pod, { replicas });
        setScaleModalVisible(false);
      } else {
        message.error(`Failed to scale deployment: ${result.error}`);
      }
    } catch (error) {
      console.error('Scale deployment error:', error);
      message.error(`Failed to scale deployment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleShowScaleModal = async () => {
    try {
      // Get deployment info to show current replica count
      const result = await kubernetesAPI.getDeploymentInfo(pod.namespace, pod.name);
      if (result.success) {
        setDeploymentInfo(result.data);
        setNewReplicaCount(result.data.currentReplicas || 1);
      }
      setScaleModalVisible(true);
    } catch (error) {
      console.error('Get deployment info error:', error);
      // Still show modal with default values
      setScaleModalVisible(true);
    }
  };

  const handleStopPod = () => {
    handleScaleDeployment(0);
  };

  const menuItems = [
    {
      key: 'restart',
      icon: <ReloadOutlined />,
      label: 'Restart Pod',
      onClick: handleRestartPod
    },
    {
      key: 'scale',
      icon: <ScissorOutlined />,
      label: 'Scale Deployment',
      onClick: handleShowScaleModal
    },
    {
      type: 'divider'
    },
    {
      key: 'stop',
      icon: <PoweroffOutlined />,
      label: 'Stop Deployment',
      onClick: handleStopPod,
      danger: true
    }
  ];

  return (
    <>
      <Space size="small">
        {/* Quick Restart Button */}
        <Tooltip title="Restart Pod">
          <Button
            type="primary"
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={handleRestartPod}
          />
        </Tooltip>

        {/* More Actions Dropdown */}
        <Dropdown
          menu={{ items: menuItems }}
          trigger={['click']}
          disabled={loading}
        >
          <Button 
            size="small" 
            icon={<MoreOutlined />}
            loading={loading}
          />
        </Dropdown>
      </Space>

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
        onOk={() => handleScaleDeployment(newReplicaCount)}
        confirmLoading={loading}
        okText="Scale"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <p><strong>Pod:</strong> {pod.name}</p>
            <p><strong>Namespace:</strong> {pod.namespace}</p>
            <p><strong>Deployment:</strong> {getDeploymentName(pod.name)}</p>
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
      </Modal>
    </>
  );
};

export default PodActions;