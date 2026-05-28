import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Col, Empty, Input, List, Modal, Row, Space, Spin, Tag, Typography, message } from 'antd';
import { CloudServerOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { DonauAccount, DonauQueue, getDonauResources } from '../../utils/ipc';

const { Text } = Typography;

interface Props {
  account?: string;
  queue?: string;
  onChange: (value: { account: string; queue: string }) => void;
}

const defaultAccount = 'ug_dft.HIS-HIS-ASIC-HISC-DFT-PLAT-WS';
const defaultQueue = 'normal';

const DonauResourcePicker: React.FC<Props> = ({ account, queue, onChange }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<DonauAccount[]>([]);
  const [queues, setQueues] = useState<DonauQueue[]>([]);
  const [selectedAccount, setSelectedAccount] = useState(account || defaultAccount);
  const [selectedQueue, setSelectedQueue] = useState(queue || defaultQueue);
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState<'mock' | 'real'>('mock');
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (account) {
      setSelectedAccount(account);
    }
  }, [account]);

  useEffect(() => {
    if (queue) {
      setSelectedQueue(queue);
    }
  }, [queue]);

  const loadResources = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await getDonauResources();
      setSource(result.source);
      setAccounts(result.accounts);
      setQueues(result.queues);
      setNotice(result.fallbackReason);
      if (!result.success) {
        setError(result.error ?? 'Donau resource loading failed.');
      }
      const nextAccount = account || selectedAccount || defaultAccount;
      const nextQueue = queue || selectedQueue || defaultQueue;
      setSelectedAccount(result.accounts.some((item) => item.submitName === nextAccount) ? nextAccount : result.accounts[0]?.submitName ?? nextAccount);
      setSelectedQueue(result.queues.some((item) => item.submitName === nextQueue) ? nextQueue : result.queues[0]?.submitName ?? nextQueue);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const filteredAccounts = useMemo(
    () => accounts.filter((item) => matchResource(item, keyword)),
    [accounts, keyword]
  );
  const filteredQueues = useMemo(
    () => queues.filter((item) => matchResource(item, keyword)),
    [queues, keyword]
  );

  const confirm = () => {
    onChange({ account: selectedAccount, queue: selectedQueue });
    message.success('Donau Account / Queue 已回填');
    setOpen(false);
  };

  const openPicker = () => {
    setOpen(true);
    if (accounts.length === 0 && queues.length === 0) {
      void loadResources();
    }
  };

  return (
    <>
      <Button icon={<CloudServerOutlined />} onClick={openPicker} style={{ width: '100%' }}>
        选择 Donau 资源
      </Button>
      <Modal
        title="选择 Donau 资源"
        open={open}
        width={980}
        onCancel={() => setOpen(false)}
        onOk={confirm}
        okText="确认"
        cancelText="取消"
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索 Account / Queue，例如 ug_dft、normal、debug"
              />
            </Col>
            <Col>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={loadResources}>
                刷新
              </Button>
            </Col>
            <Col>
              <Text type="secondary">{source === 'mock' ? 'Mock 数据' : 'Real Donau'}</Text>
            </Col>
          </Row>

          {notice ? <Alert type="warning" showIcon message="已 fallback 到 mock 数据" description={notice} /> : null}
          {error ? <Alert type="error" showIcon message="Donau 资源获取失败" description={error} /> : null}

          <Row gutter={16} style={{ padding: '2px 0 4px' }}>
            <Col span={12}>
              <Text strong>当前 Account: </Text>
              <Text>{selectedAccount}</Text>
            </Col>
            <Col span={12}>
              <Text strong>当前 Queue: </Text>
              <Text>{selectedQueue}</Text>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <ListTitle title="Account / 群组" />
              <ResourceList
                loading={loading}
                items={filteredAccounts}
                selected={selectedAccount}
                onSelect={setSelectedAccount}
                getDescription={(item) => `submit: ${item.submitName}`}
                getMeta={(item) => <LoadMeta running={item.runningJobsCount} pending={item.pendingJobsCount} />}
              />
            </Col>
            <Col span={12}>
              <ListTitle title="Queue / 队列" />
              <ResourceList
                loading={loading}
                items={filteredQueues}
                selected={selectedQueue}
                onSelect={setSelectedQueue}
                getDescription={(item) => getQueueUsage(item)}
                getMeta={(item) => (
                  <>
                    <Text type="secondary">{item.status} · </Text>
                    <LoadMeta running={item.runningJobsCount} pending={item.pendingJobsCount} />
                  </>
                )}
              />
            </Col>
          </Row>
        </Space>
      </Modal>
    </>
  );
};

interface ResourceListProps<T extends { name: string; submitName: string; pendingJobsCount: number; description?: string }> {
  loading: boolean;
  items: T[];
  selected: string;
  onSelect: (submitName: string) => void;
  getDescription: (item: T) => string;
  getMeta: (item: T) => React.ReactNode;
}

function ResourceList<T extends { name: string; submitName: string; pendingJobsCount: number; description?: string }>(
  props: ResourceListProps<T>
) {
  const { loading, items, selected, onSelect, getDescription, getMeta } = props;
  return (
    <Spin spinning={loading}>
      <List
        size="small"
        bordered
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配资源" /> }}
        dataSource={items}
        style={{ height: 430, overflow: 'auto' }}
        renderItem={(item) => {
          const active = item.submitName === selected;
          return (
            <List.Item
              onClick={() => onSelect(item.submitName)}
              style={{
                cursor: 'pointer',
                background: active ? 'rgba(22, 119, 255, 0.12)' : undefined,
                borderInlineStart: active ? '3px solid #1677ff' : '3px solid transparent',
              }}
            >
              <Space direction="vertical" size={3} style={{ width: '100%' }}>
                <Text strong={active} ellipsis={{ tooltip: item.name }}>
                  {item.name}
                </Text>
                <Text type="secondary" ellipsis={{ tooltip: getDescription(item) }}>
                  {getDescription(item)}
                </Text>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getMeta(item)}
                </div>
              </Space>
            </List.Item>
          );
        }}
      />
    </Spin>
  );
}

function ListTitle(props: { title: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Text strong>{props.title}</Text>
    </div>
  );
}

function LoadMeta(props: { running: number; pending: number }) {
  return (
    <Space size={4} wrap={false}>
      <Tag color={getLoadColor(props.running)} style={{ marginInlineEnd: 0 }}>
        运行 {props.running}
      </Tag>
      <Tag color={getLoadColor(props.pending)} style={{ marginInlineEnd: 0 }}>
        等待 {props.pending}
      </Tag>
    </Space>
  );
}

function getLoadColor(value: number): string {
  if (value >= 10000) {
    return 'orange';
  }
  if (value >= 1000) {
    return 'blue';
  }
  return 'green';
}

function getQueueUsage(queue: DonauQueue): string {
  const descriptions: Record<string, string> = {
    short: '短任务队列，适合快速作业',
    normal: '普通任务队列，适合常规作业',
    middle: '中等时长队列，适合较长作业',
    long: '长任务队列，适合超长作业',
    bigmem: '大内存队列',
    hugemem: '超大内存队列',
    debug: '调试队列',
    formal: '正式运行队列',
    gpu: 'GPU 计算队列',
    nile: 'Nile 专用队列',
    normal_send: '普通发送队列',
    short_kill: '短任务可抢占队列',
  };
  return descriptions[queue.submitName] ?? '自定义队列';
}

function matchResource(item: { name: string; submitName: string; status?: string; description?: string }, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [item.name, item.submitName, item.status, item.description]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

export default DonauResourcePicker;
