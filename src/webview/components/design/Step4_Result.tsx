import React from 'react';
import { Button, Alert } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CodeOutlined,
} from '@ant-design/icons';

interface Props {
  onNext: () => void;
  onPrev: () => void;
}

const Step4Result: React.FC<Props> = ({ onNext, onPrev }) => {
  return (
    <div style={{ padding: '16px 0' }}>
      <Alert
        message="状态检查"
        description="是否有错？如果执行过程中存在错误，可在此处跳出具体的 log 以及错误原因进行分析。"
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        style={{ marginBottom: 24 }}
      />

      {/* 终端日志展示 */}
      <div
        style={{
          background: '#000',
          borderRadius: 6,
          padding: 16,
          border: '1px solid #333',
          minHeight: 300,
          fontFamily: 'monospace',
          color: '#ccc',
        }}
      >
        <div
          style={{
            borderBottom: '1px solid #333',
            paddingBottom: 8,
            marginBottom: 8,
            color: '#888',
          }}
        >
          <CodeOutlined style={{ marginRight: 8 }} /> 交互终端 (TERM) — 日志输出
        </div>
        <div>[INFO] Start parsing results...</div>
        <div>[INFO] Normalizing data sets...</div>
        <div style={{ color: '#4ade80', marginTop: 4 }}>[INFO] Module A: OK</div>
        <div style={{ color: '#4ade80' }}>[INFO] Module B: OK</div>
        <div style={{ color: '#ff4d4f', marginTop: 4 }}>[ERROR] Failed to load module metrics.</div>
        <div style={{ color: '#faad14' }}>[WARN] Skipping partial result for Module C.</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
        <Button onClick={onPrev} icon={<LeftOutlined />}>
          上一页
        </Button>
        <Button icon={<CheckCircleOutlined />}>提交</Button>
        <Button type="primary" onClick={onNext}>
          下一页 <RightOutlined />
        </Button>
      </div>
    </div>
  );
};

export default Step4Result;
