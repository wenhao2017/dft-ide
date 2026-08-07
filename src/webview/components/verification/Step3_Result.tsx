import React, { useState, useEffect } from 'react';
import { Button, Tabs, message } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import ExecutionHistoryList from '../shared/ExecutionHistoryList';
import { getExecutionHistory, ExecutionHistoryRecord } from '../../utils/ipc';
import { uploadExecutionData } from '../../services/projectService';
import useWizardStore from '../../store/wizardStore';
import ExecutionHistoryDetail from '../shared/ExecutionHistoryDetail';
import ReportParsingPanel from './ReportParsingPanel';

interface Props {
  onNext: () => void;
  onPrev: () => void;
}

const Step3Result: React.FC<Props> = ({ onNext, onPrev }) => {
  const activeProject = useWizardStore((s) => s.activeProject);
  const [historyRecords, setHistoryRecords] = useState<ExecutionHistoryRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<ExecutionHistoryRecord | null>(null);
  const [historyDetail, setHistoryDetail] = useState<ExecutionHistoryRecord | null>(null);
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
    if (activeRecord.status === 'running') {
      message.warning('当前执行仍在运行，请等待结束后再提交');
      return;
    }

    setUploading(true);
    try {
      await uploadExecutionData(activeProject.id, {
        flow: 'verification',
        status: activeRecord.status,
        executedAt: activeRecord.executedAt,
      });
      message.success('已成功同步执行数据到云端分析平台');
    } catch (err) {
      message.error('同步失败: ' + String(err));
    } finally {
      setUploading(false);
    }
  };

  const viewHistoryDetail = (record: ExecutionHistoryRecord) => {
    setHistoryDetail(record);
  };

  const handleHistoryDeleted = (ids: string[]) => {
    setHistoryRecords((records) => records.filter((record) => !ids.includes(record.id)));
    setActiveRecord((record) => record && ids.includes(record.id) ? null : record);
    setHistoryDetail((record) => record && ids.includes(record.id) ? null : record);
  };

  return (
    <div style={{ padding: '16px 0' }}>
      <Tabs
        defaultActiveKey={'reportParsing'}
        items={[
          {
            key: 'reportParsing',
            label: '报告解析',
            children: <ReportParsingPanel />,
          },
          {
            key: 'history',
            label: '执行历史',
            children: (
              <ExecutionHistoryList
                history={historyRecords}
                flow='verification'
                onOpenPipeline={viewHistoryDetail}
                onDeleted={handleHistoryDeleted}
              />
            ),
          },
        ]}
      />

      <ExecutionHistoryDetail
        record={historyDetail}
        onClose={() => setHistoryDetail(null)}
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
          提交分析到云端
        </Button>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </div>
  );
};

export default Step3Result;
