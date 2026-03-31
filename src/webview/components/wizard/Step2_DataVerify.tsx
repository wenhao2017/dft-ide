import React from 'react';
import { Card, Table, Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import useWizardStore from '../../store/wizardStore';

interface NormalizedRow {
  key: string;
  pin_name: string;
  pin_attribute: string;
  ctrl_type: string;
  default_value: number;
  ip_sim: number;
}

const mockData: NormalizedRow[] = [
  {
    key: '1',
    pin_name: 'temp_en',
    pin_attribute: 'dft_ip_tsensor0_ctrl',
    ctrl_type: 'share_func',
    default_value: 0,
    ip_sim: 1,
  },
  {
    key: '2',
    pin_name: 'jtag_sel',
    pin_attribute: 'dft_ip_jtag_ctrl',
    ctrl_type: 'dedicated',
    default_value: 1,
    ip_sim: 0,
  },
  {
    key: '3',
    pin_name: 'mbist_mode',
    pin_attribute: 'dft_ip_mbist_ctrl',
    ctrl_type: 'share_func',
    default_value: 0,
    ip_sim: 1,
  },
  {
    key: '4',
    pin_name: 'scan_en',
    pin_attribute: 'dft_ip_scan_ctrl',
    ctrl_type: 'dedicated',
    default_value: 0,
    ip_sim: 1,
  },
];

const columns: ColumnsType<NormalizedRow> = [
  { title: 'Pin Name', dataIndex: 'pin_name', key: 'pin_name' },
  { title: 'Pin Attribute', dataIndex: 'pin_attribute', key: 'pin_attribute' },
  { title: 'Ctrl Type', dataIndex: 'ctrl_type', key: 'ctrl_type' },
  { title: 'Default Value', dataIndex: 'default_value', key: 'default_value' },
  { title: 'IP Sim', dataIndex: 'ip_sim', key: 'ip_sim' },
];

const Step2DataVerify: React.FC = () => {
  const { nextStep, prevStep, updatePayload } = useWizardStore();

  const handleConfirm = () => {
    updatePayload({ normalizedData: mockData });
    nextStep();
  };

  return (
    <Card title="步骤 2：归一化数据确认（只读）" bordered={false}>
      <Table<NormalizedRow>
        columns={columns}
        dataSource={mockData}
        pagination={false}
        bordered
        size="middle"
        style={{ marginBottom: 24 }}
      />

      <Space>
        <Button onClick={prevStep}>上一步</Button>
        <Button type="primary" onClick={handleConfirm}>
          确认数据无误，下一步
        </Button>
      </Space>
    </Card>
  );
};

export default Step2DataVerify;
