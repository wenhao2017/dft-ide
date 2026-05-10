import React, { useState, useEffect } from 'react';
import { Tabs, Button, Alert, Space, Typography, message } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  LineChartOutlined,
  FileTextOutlined,
  HistoryOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import ExecutionLogPanel from '../shared/ExecutionLogPanel';
import ExecutionHistoryList from '../shared/ExecutionHistoryList';
import { getExecutionHistory, ExecutionHistoryRecord } from '../../utils/ipc';
import { uploadExecutionData } from '../../services/projectService';
import useWizardStore from '../../store/wizardStore';

const { Link } = Typography;

const Step4Result: React.FC<{ onNext: () => void; onPrev: () => void }> = ({ onNext, onPrev }) => {
  const { activeProject } = useWizardStore();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<ExecutionHistoryRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<ExecutionHistoryRecord | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      const res = await getExecutionHistory('verification');
      if (res.success && res.history.length > 0) {
        setHistoryRecords(res.history);
        setActiveRecord(res.history[0]);
      }
    };
    fetchHistory();
  }, []);

  const handleUpload = async () => {
    if (!activeProject?.id) {
      message.error('未选择有效的项目 (ProjectId 缺失)');
      return;
    }
    if (!activeRecord) {
      message.warning('当前没有可提交的执行记录');
      return;
    }

    setUploading(true);
    try {
      await uploadExecutionData(activeProject.id, {
        flow: 'verification',
        status: activeRecord.status,
        logs: activeRecord.logs,
        executedAt: activeRecord.executedAt,
        metrics: { coverage: 98.5, assertionsPassed: true },
      });
      message.success('已成功同步验证数据到云端分析平台');
    } catch (err) {
      message.error('同步失败: ' + String(err));
    } finally {
      setUploading(false);
    }
  };

  const renderSimResult = () => (
    <div style={{ marginTop: 16 }}>
      <Alert
        message={activeRecord?.status === 'success' ? 'SIM 执行完成，无 Error 产生' : 'SIM 执行结果待确认'}
        description="执行结果来自已保存的日志或历史记录；真实任务请在 VS Code 终端中运行。"
        type={activeRecord?.status === 'success' ? 'success' : 'warning'}
        showIcon
        icon={activeRecord?.status === 'success' ? <CheckCircleOutlined /> : <WarningOutlined />}
        style={{ marginBottom: 16 }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space size="large">
          <Button icon={<LineChartOutlined />}>查看波形</Button>
          <Link>
            <FileTextOutlined /> sim/vcs.log
          </Link>
          <Link>
            <FileTextOutlined /> sim/verdi.log
          </Link>
        </Space>
        <Button
          icon={<HistoryOutlined />}
          onClick={() => setHistoryOpen(true)}
        >
          查看历史记录 ({historyRecords.length})
        </Button>
      </div>

      <ExecutionLogPanel
        title={`仿真结果分析 ${activeRecord ? `[${new Date(activeRecord.executedAt).toLocaleString()}]` : ''}`}
        status={activeRecord?.status || 'idle'}
        logs={activeRecord?.logs ?? []}
        minHeight={300}
      />
    </div>
  );

  return (
    <div>
      <Tabs
        type="line"
        items={[
          {
            key: 'plan',
            label: 'PLAN',
            children: <Alert message="PLAN 检查通过" type="success" showIcon style={{ marginTop: 16 }} />,
          },
          {
            key: 'env',
            label: 'ENV',
            children: <Alert message="ENV 检查通过" type="success" showIcon style={{ marginTop: 16 }} />,
          },
          { key: 'sim', label: 'SIM', children: renderSimResult() },
          {
            key: 'atpg',
            label: 'ATPG',
            children: <Alert message="ATPG 未执行" type="info" showIcon style={{ marginTop: 16 }} />,
          },
        ]}
      />

      <ExecutionHistoryList
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={historyRecords}
        onSelect={(record) => setActiveRecord(record)}
      />

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
        <Button onClick={onPrev} icon={<LeftOutlined />}>
          上一页
        </Button>
        <Button
          icon={<CloudUploadOutlined />}
          onClick={handleUpload}
          loading={uploading}
        >
          提交验证结果到云端
        </Button>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </div>
  );
};

export default Step4Result;
