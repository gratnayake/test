import React, { useState, useEffect } from 'react';
import { 
  Row, 
  Col, 
  Card, 
  Table, 
  Button, 
  Space, 
  Tag, 
  Typography, 
  message,
  Popconfirm,
  Switch,
  Statistic,
  Tooltip,
  Badge,
  Progress,
  Input,
  Select,
  Alert
} from 'antd';
import { 
  LinkOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  SearchOutlined,
  FilterOutlined,
  EyeOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { urlAPI } from '../../services/api';
import UrlModal from './UrlModal';

const { Title, Text } = Typography;
const { Option } = Select;

const UrlMonitoring = () => {
  const [urls, setUrls] = useState([]);
  const [urlStatuses, setUrlStatuses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUrl, setEditingUrl] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');

  useEffect(() => {
    loadInitialData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadUrlStatuses();
      loadStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadUrls(),
        loadUrlStatuses(),
        loadStats()
      ]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUrls = async () => {
    try {
      const response = await urlAPI.getAllUrls();
      if (response.success) {
        setUrls(response.data);
      }
    } catch (error) {
      console.error('Failed to load URLs:', error);
      message.error('Failed to load URLs');
    }
  };

  const loadUrlStatuses = async () => {
    try {
      const response = await urlAPI.getUrlStatuses();
      if (response.success) {
        setUrlStatuses(response.data);
      }
    } catch (error) {
      console.error('Failed to load URL statuses:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await urlAPI.getUrlStats();
      if (response.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleAddUrl = () => {
    setEditingUrl(null);
    setModalVisible(true);
  };

  const handleEditUrl = (url) => {
    setEditingUrl(url);
    setModalVisible(true);
  };

  const handleDeleteUrl = async (urlId) => {
    try {
      const response = await urlAPI.deleteUrl(urlId);
      if (response.success) {
        message.success('URL deleted successfully');
        loadInitialData();
      }
    } catch (error) {
      message.error('Failed to delete URL');
    }
  };

  const handleToggleUrl = async (urlId, enabled) => {
    try {
      const response = await urlAPI.updateUrl(urlId, { enabled });
      if (response.success) {
        message.success(`URL ${enabled ? 'enabled' : 'disabled'} successfully`);
        loadUrls();
      }
    } catch (error) {
      message.error('Failed to update URL status');
    }
  };

  const handleCheckUrl = async (urlId) => {
    try {
      setLoading(true);
      const response = await urlAPI.checkUrl(urlId);
      if (response.success) {
        message.success('URL checked successfully');
        loadUrlStatuses();
      }
    } catch (error) {
      message.error('Failed to check URL');
    } finally {
      setLoading(false);
    }
  };

  const getUrlStatus = (urlId) => {
    return urlStatuses.find(status => status.urlId === urlId);
  };

  const getStatusColor = (isUp) => {
    return isUp ? 'success' : 'error';
  };

  const getResponseTimeColor = (responseTime) => {
    if (responseTime < 500) return '#52c41a';
    if (responseTime < 1000) return '#faad14';
    if (responseTime < 3000) return '#fa8c16';
    return '#ff4d4f';
  };

  // Filter URLs based on search and filters
  const filteredUrls = urls.filter(url => {
    const status = getUrlStatus(url.id);
    
    // Search filter
    const matchesSearch = url.name.toLowerCase().includes(searchText.toLowerCase()) ||
                         url.url.toLowerCase().includes(searchText.toLowerCase());
    
    // Status filter
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'up' && status?.isUp) ||
                         (statusFilter === 'down' && status && !status.isUp) ||
                         (statusFilter === 'enabled' && url.enabled) ||
                         (statusFilter === 'disabled' && !url.enabled);
    
    // Method filter
    const matchesMethod = methodFilter === 'all' || url.method === methodFilter;
    
    return matchesSearch && matchesStatus && matchesMethod;
  });

  const columns = [
    {
      title: 'Status',
      key: 'status',
      width: 70,
      render: (_, record) => {
        const status = getUrlStatus(record.id);
        if (!status) {
          return <Badge status="default" />;
        }
        
        return (
          <Tooltip title={status.isUp ? 'UP' : 'DOWN'}>
            <Badge 
              status={status.isUp ? 'success' : 'error'}
              text={<Text style={{ fontSize: '11px' }}>{status.isUp ? 'UP' : 'DOWN'}</Text>}
            />
          </Tooltip>
        );
      },
    },
    {
      title: 'URL Details',
      key: 'details',
      render: (_, record) => {
        return (
          <div style={{ lineHeight: '1.3' }}>
            <div style={{ marginBottom: '2px' }}>
              <Text strong style={{ fontSize: '13px' }}>{record.name}</Text>
              {!record.enabled && (
                <Tag color="default" size="small" style={{ marginLeft: 4, fontSize: '10px', padding: '0 4px' }}>
                  OFF
                </Tag>
              )}
            </div>
            <div style={{ marginBottom: '1px' }}>
              <Text 
                type="secondary" 
                style={{ fontSize: '11px' }}
                copyable={{ text: record.url, tooltips: ['Copy URL', 'Copied!'] }}
              >
                {record.url.length > 50 ? `${record.url.substring(0, 50)}...` : record.url}
              </Text>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Method',
      key: 'method',
      width: 60,
      render: (_, record) => (
        <Tag color="blue" size="small" style={{ fontSize: '10px', margin: 0 }}>
          {record.method}
        </Tag>
      ),
    },
    {
      title: 'Performance',
      key: 'performance',
      width: 110,
      render: (_, record) => {
        const status = getUrlStatus(record.id);
        if (!status) {
          return <Text type="secondary" style={{ fontSize: '11px' }}>No data</Text>;
        }
        
        return (
          <div style={{ lineHeight: '1.2' }}>
            <div style={{ marginBottom: '2px' }}>
              <Tag 
                color={status.responseTime < 1000 ? 'green' : 
                       status.responseTime < 3000 ? 'orange' : 'red'}
                size="small"
                style={{ fontSize: '10px', margin: 0 }}
              >
                {status.responseTime}ms
              </Tag>
            </div>
            <div>
              <Tag 
                color={status.status >= 200 && status.status < 300 ? 'green' :
                       status.status >= 400 ? 'red' : 'orange'}
                size="small"
                style={{ fontSize: '10px', margin: 0 }}
              >
                {status.status || 'ERR'}
              </Tag>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Interval',
      key: 'interval',
      width: 60,
      render: (_, record) => (
        <Text style={{ fontSize: '11px' }}>{record.interval}s</Text>
      ),
    },
    {
      title: 'Last Check',
      key: 'lastCheck',
      width: 80,
      render: (_, record) => {
        const status = getUrlStatus(record.id);
        if (!status) return <Text type="secondary" style={{ fontSize: '10px' }}>Never</Text>;
        
        const lastCheck = new Date(status.lastChecked);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastCheck) / 60000);
        
        return (
          <Tooltip title={lastCheck.toLocaleString()}>
            <Text style={{ fontSize: '10px' }}>
              {diffMinutes < 1 ? 'Now' :
               diffMinutes < 60 ? `${diffMinutes}m` :
               `${Math.floor(diffMinutes / 60)}h`}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Monitor',
      key: 'monitoring',
      width: 60,
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          onChange={(checked) => handleToggleUrl(record.id, checked)}
          size="small"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="Check Now">
            <Button 
              icon={<ReloadOutlined />} 
              onClick={() => handleCheckUrl(record.id)}
              size="small"
              type="text"
              style={{ padding: '2px 4px' }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button 
              icon={<EditOutlined />} 
              onClick={() => handleEditUrl(record)}
              size="small"
              type="text"
              style={{ padding: '2px 4px' }}
            />
          </Tooltip>
          <Popconfirm
            title="Delete URL?"
            onConfirm={() => handleDeleteUrl(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button 
                icon={<DeleteOutlined />} 
                danger 
                size="small"
                type="text"
                style={{ padding: '2px 4px' }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Total URLs"
              value={stats?.totalUrls || 0}
              prefix={<GlobalOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="URLs Up"
              value={stats?.upUrls || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="URLs Down"
              value={stats?.downUrls || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Monitoring"
              value={stats?.monitoringActive || 0}
              suffix={`/ ${stats?.enabledUrls || 0}`}
              prefix={<LinkOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* URL Table with Filters */}
      <Card
        title={
          <Space>
            <LinkOutlined />
            URL Monitoring
            {stats?.lastUpdated && (
              <Text type="secondary" style={{ fontSize: '12px', fontWeight: 'normal' }}>
                (Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()})
              </Text>
            )}
          </Space>
        }
        extra={
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={loadInitialData}
              loading={loading}
            >
              Refresh
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddUrl}
            >
              Add URL
            </Button>
          </Space>
        }
      >
        {/* Filters */}
        <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
          <Col xs={24} sm={10}>
            <Input
              placeholder="Search URLs..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              size="small"
            />
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: '100%' }}
              size="small"
            >
              <Option value="all">All</Option>
              <Option value="up">Up</Option>
              <Option value="down">Down</Option>
              <Option value="enabled">Enabled</Option>
              <Option value="disabled">Disabled</Option>
            </Select>
          </Col>
          <Col xs={12} sm={4}>
            <Select
              placeholder="Method"
              value={methodFilter}
              onChange={setMethodFilter}
              style={{ width: '100%' }}
              size="small"
            >
              <Option value="all">All</Option>
              <Option value="GET">GET</Option>
              <Option value="POST">POST</Option>
              <Option value="PUT">PUT</Option>
              <Option value="DELETE">DELETE</Option>
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {filteredUrls.length} of {urls.length} URLs
            </Text>
          </Col>
        </Row>

        {/* Alert for down URLs */}
        {stats?.downUrls > 0 && (
          <Alert
            message={`${stats.downUrls} URL${stats.downUrls > 1 ? 's' : ''} down`}
            type="warning"
            showIcon
            closable
            style={{ marginBottom: 12, padding: '4px 12px', fontSize: '12px' }}
            icon={<WarningOutlined />}
          />
        )}

        <Table
          columns={columns}
          dataSource={filteredUrls}
          loading={loading}
          pagination={{
            pageSize: 20,
            size: 'small',
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total}`,
            pageSizeOptions: ['10', '20', '50', '100']
          }}
          rowKey="id"
          locale={{
            emptyText: urls.length === 0 ? 
              'No URLs configured' : 
              'No URLs match filters'
          }}
          scroll={{ x: 600 }}
          size="small"
          style={{
            '& .ant-table-tbody > tr > td': {
              padding: '4px 8px',
              fontSize: '12px'
            },
            '& .ant-table-thead > tr > th': {
              padding: '6px 8px',
              fontSize: '12px',
              fontWeight: 'bold'
            }
          }}
        />
      </Card>

      <UrlModal
        visible={modalVisible}
        editingUrl={editingUrl}
        onClose={() => setModalVisible(false)}
        onSaved={() => {
          setModalVisible(false);
          loadInitialData();
        }}
      />
    </div>
  );
};

export default UrlMonitoring;