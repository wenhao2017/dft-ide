import React, { useState, useEffect } from 'react';
import { Button, Alert, Space, Typography, message } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  FileTextOutlined,
  HistoryOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import ExecutionLogPanel from '../shared/ExecutionLogPanel';
import ExecutionHistoryList from '../shared/ExecutionHistoryList';
import { getExecutionHistory, ExecutionHistoryRecord } from '../../utils/ipc';
import { uploadExecutionData } from '../../services/projectService';
import useWizardStore from '../../store/wizardStore';
import PipelineRuntimeView from '../shared/PipelineRuntimeView';
import { PipelineRuntimeSnapshot } from '../../store/pipelineRuntimeStore';

const { Link } = Typography;

interface Props {
  onNext: () => void;
  onPrev: () => void;
}

const Step4Result: React.FC<Props> = ({ onNext, onPrev }) => {
  const activeProject = useWizardStore((s) => s.activeProject);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<ExecutionHistoryRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<ExecutionHistoryRecord | null>(null);
  const [historyRuntime, setHistoryRuntime] = useState<PipelineRuntimeSnapshot | null>(null);
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
  });

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
      });
      message.success('已成功同步执行数据到云端分析平台');
    } catch (err) {
      message.error('同步失败: ' + String(err));
    } finally {
      setUploading(false);
    }
  };

  const currentLogs = activeRecord?.logs ?? [];
  const openPipelineRuntime = (record: ExecutionHistoryRecord) => {
    if (isPipelineRuntimeSnapshot(record.runtimeSnapshot)) {
      setHistoryRuntime(record.runtimeSnapshot);
    }
  };

  return (
    <div style={{ padding: '16px 0' }}>
      <Alert
        message="状态检查"
        description="执行结果来自已保存的日志或历史记录；真实任务请在 VS Code 终端中运行。"
        type={activeRecord?.status === 'success' ? 'success' : 'warning'}
        showIcon
        icon={activeRecord?.status === 'success' ? <CheckCircleOutlined /> : <WarningOutlined />}
        style={{ marginBottom: 16 }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space size="large">
          <Link>
            <FileTextOutlined /> {'verification'}/synth.log
          </Link>
          <Link>
            <FileTextOutlined /> {'verification'}/opt.log
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
        title={`日志分析 ${activeRecord ? `[${new Date(activeRecord.executedAt).toLocaleString()}]` : ''}`}
        status={activeRecord?.status || 'idle'}
        logs={currentLogs}
        minHeight={300}
      />

      <ExecutionHistoryList
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={historyRecords}
        onSelect={(record) => setActiveRecord(record)}
        onOpenPipeline={openPipelineRuntime}
      />

      {historyRuntime && (
        <PipelineRuntimeView
          flowKey={historyRuntime.flowKey}
          moduleKey={historyRuntime.moduleKey}
          flowLabel={historyRuntime.flowLabel}
          snapshot={historyRuntime}
          readOnly
          visible
          onClose={() => setHistoryRuntime(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
        <Button onClick={onPrev} icon={<LeftOutlined />}>
          上一页
        </Button>
        <Button
          icon={<CloudUploadOutlined />}
          onClick={handleUpload}
          loading={uploading}
        >
          提交分析到云端
        </Button>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </div>
  );
};

function isPipelineRuntimeSnapshot(value: unknown): value is PipelineRuntimeSnapshot {
  const candidate = value as Partial<PipelineRuntimeSnapshot> | undefined;
  return !!candidate
    && (candidate.flowKey === 'hibist' || candidate.flowKey === 'sailor' || candidate.flowKey === 'verification')
    && typeof candidate.moduleKey === 'string'
    && typeof candidate.flowLabel === 'string'
    && Array.isArray(candidate.tasks)
    && Array.isArray(candidate.links)
    && Array.isArray(candidate.logs);
}

export default Step4Result;
