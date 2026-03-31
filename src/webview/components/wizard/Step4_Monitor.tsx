import React, { useEffect, useState, useRef } from 'react';
import { Card, Progress, Result, Typography, Space, Button } from 'antd';
import { LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import useWizardStore from '../../store/wizardStore';
import vscode from '../../utils/vscode';

const { Text } = Typography;

const Step4Monitor: React.FC = () => {
  const { taskPayload, updatePayload, reset } = useWizardStore();
  const [jobId, setJobId] = useState<string | null>(taskPayload.jobId || null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'>('PENDING');
  const timerRef = useRef<number | null>(null);

  // 监听宿主发来的 taskSubmitted 消息
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.command === 'taskSubmitted' && msg.jobId) {
        setJobId(msg.jobId);
        updatePayload({ jobId: msg.jobId });
      }
      if (msg.command === 'jobStatus') {
        setProgress(msg.progress ?? 0);
        setStatus(msg.status ?? 'RUNNING');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [updatePayload]);

  // 拿到 jobId 后，模拟每 2 秒轮询一次
  useEffect(() => {
    if (!jobId) {
      return;
    }
    setStatus('RUNNING');

    // 使用本地模拟递增进度（因 queryJobStatus 在宿主侧，实际可通过 postMessage 轮询）
    let mockProgress = 0;
    timerRef.current = window.setInterval(() => {
      mockProgress += Math.floor(Math.random() * 15) + 5;
      if (mockProgress >= 100) {
        mockProgress = 100;
        setStatus('SUCCESS');
        if (timerRef.current !== null) {
          clearInterval(timerRef.current);
        }
      }
      setProgress(mockProgress);
    }, 2000);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    };
  }, [jobId]);

  const handleReset = () => {
    reset();
  };

  if (status === 'SUCCESS') {
    return (
      <Card bordered={false}>
        <Result
          status="success"
          title="任务执行完成！"
          subTitle={`Job ID: ${jobId}`}
          extra={[
            <Button type="primary" key="new" onClick={handleReset}>
              发起新任务
            </Button>,
          ]}
        />
      </Card>
    );
  }

  return (
    <Card title="步骤 4：任务执行监控" bordered={false}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {!jobId ? (
          <Space>
            <LoadingOutlined spin />
            <Text>等待任务提交结果...</Text>
          </Space>
        ) : (
          <>
            <Text>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              Job ID: <Text strong>{jobId}</Text>
            </Text>
            <Text type="secondary">状态: {status}</Text>
            <Progress
              percent={progress}
              status={status === 'RUNNING' ? 'active' : 'success'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            <Text type="secondary">每 2 秒自动刷新进度...</Text>
          </>
        )}
      </Space>
    </Card>
  );
};

export default Step4Monitor;
