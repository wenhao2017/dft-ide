import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Button,
  Space,
  Radio,
  Typography,
  Select,
  Row,
  Col,
  Tabs,
  Divider,
  Badge,
  Spin,
} from 'antd';
import {
  FolderOpenOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  LeftOutlined,
  RightOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useFlowConfig } from '../../hooks/useFlowConfig';

const { Text } = Typography;

interface Props {
  onNext: () => void;
  onPrev: () => void;
}

const Step2ToolConfig: React.FC<Props> = ({ onNext, onPrev }) => {
  const [activeTab, setActiveTab] = useState('task');
  const [taskForm] = Form.useForm();
  const [designForm] = Form.useForm();

  // ── 配置持久化 Hook ─────────────────────────────────
  // 注意：Step2 与 Step1 同属 design flow，但字段不同，合并到同一个文件中
  // 这里使用独立 key 区分：step2_task / step2_design
  const { savedData, loading, saving, hasUnsaved, handleSave } = useFlowConfig('design');

  // 回填：从文件读到 savedData 后填入表单
  useEffect(() => {
    if (!savedData) return;
    // 任务配置子表单
    if (savedData.step2Task) {
      taskForm.setFieldsValue(savedData.step2Task);
    }
    // 设计配置子表单
    if (savedData.step2Design) {
      designForm.setFieldsValue(savedData.step2Design);
    }
  }, [savedData, taskForm, designForm]);

  const collectFormData = (): Record<string, unknown> => ({
    // 只写 step2 字段，保留 step1 字段（merge 在 extension 侧）
    step2Task:   taskForm.getFieldsValue(true),
    step2Design: designForm.getFieldsValue(true),
  });

  const onSave = () => handleSave(collectFormData());

  // ── 任务配置 Tab ──────────────────────────────────
  const renderTaskConfig = () => (
    <Form form={taskForm} layout="vertical" style={{ padding: '16px 0' }}>
      <Form.Item label="执行流程" name="execFlow" initialValue="dcg">
        <Radio.Group>
          <Radio value="dcg">DCG</Radio>
          <Radio value="dc">DC</Radio>
          <Radio value="top-down">TOP-DOWN</Radio>
        </Radio.Group>
      </Form.Item>

      <Row gutter={16}>
        <Col span={14}>
          <Form.Item label="常用工具版本" name="toolName" initialValue="sailor">
            <Radio.Group>
              <Radio value="sailor">Sailor</Radio>
              <Radio value="dc">DC</Radio>
              <Radio value="pt">PT</Radio>
              <Radio value="vcs">VCS</Radio>
              <Radio value="fml">fml</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item label="工具版本或路径配置" name="toolVersion">
            <Input placeholder="输入版本号或绝对路径" />
          </Form.Item>
        </Col>
      </Row>

      <div style={{ marginBottom: 24, marginTop: -12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          (默认项目统一在 project.cshrc，此处主要用于 debug 时候可能存在的尝试不同版本)
        </Text>
      </div>

      <Divider orientation="left">集群配置</Divider>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="群组" name="clusterGroup">
            <Select
              placeholder="下拉选择群组"
              options={[{ value: 'g1', label: 'Group_A' }]}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="队列" name="clusterQueue">
            <Select
              placeholder="下拉选择队列"
              options={[{ value: 'q1', label: 'Queue_Fast' }]}
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item label="CPU" name="cpu">
            <Input placeholder="输入核心数" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="内存 (MB)" name="memory">
            <Input placeholder="输入内存大小" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="其他" name="clusterExtra">
            <Input placeholder="其他参数" />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );

  // ── 设计配置 Tab ──────────────────────────────────
  const renderDesignConfig = () => (
    <Form
      form={designForm}
      layout="horizontal"
      labelCol={{ span: 5 }}
      wrapperCol={{ span: 19 }}
      style={{ padding: '16px 0' }}
    >
      <Form.Item label="当前阶段" name="stage">
        <Input placeholder="输入阶段 (如 85, 95)" />
      </Form.Item>

      <Form.Item label="包含文件" name="includeFile">
        <Space.Compact style={{ width: '100%' }}>
          <Input placeholder="包含文件路径" />
          <Button icon={<FolderOpenOutlined />}>打开</Button>
        </Space.Compact>
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            包含文件路径（可由 COMMON 传出可配置修改）
          </Text>
        </div>
      </Form.Item>

      <Divider orientation="left">宏定义配置</Divider>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          宏定义配置：（点击 + 按钮，可配置对应宏定义）
        </Text>
      </div>

      <Form.List name="macros" initialValue={[{ name: '', path: '' }]}>
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }) => (
              <Row key={key} gutter={8} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Form.Item {...restField} name={[name, 'name']} noStyle>
                    <Input placeholder="宏定义名字" />
                  </Form.Item>
                </Col>
                <Col span={14}>
                  <Form.Item {...restField} name={[name, 'path']} noStyle>
                    <Input placeholder="宏定义路径或具体配置修改" />
                  </Form.Item>
                </Col>
                <Col span={2}>
                  <Button
                    type="text"
                    danger
                    icon={<MinusCircleOutlined />}
                    onClick={() => remove(name)}
                  />
                </Col>
              </Row>
            ))}
            <Form.Item>
              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                添加宏定义行
              </Button>
            </Form.Item>
          </>
        )}
      </Form.List>

      <Divider orientation="left">特殊参数配置</Divider>
      <Form.Item label="特殊参数" name="specialParam">
        <Space.Compact style={{ width: '100%' }}>
          <Input placeholder="特殊参数路径或值" />
          <Button icon={<FolderOpenOutlined />}>打开</Button>
        </Space.Compact>
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            特殊参数配置（可由 COMMON 传出可配置修改）
          </Text>
        </div>
      </Form.Item>
    </Form>
  );

  return (
    <Spin spinning={loading} tip="读取配置中...">
      <div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="card"
          items={[
            { key: 'task',   label: '任务配置',  children: renderTaskConfig()   },
            { key: 'design', label: '设计配置',  children: renderDesignConfig() },
            {
              key: 'report',
              label: '报告配置',
              children: (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <Text type="secondary">报告配置开发中...</Text>
                </div>
              ),
            },
          ]}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
          <Button onClick={onPrev} icon={<LeftOutlined />}>
            上一页
          </Button>
          <Badge dot={hasUnsaved} offset={[-4, 4]}>
            <Button icon={<SaveOutlined />} loading={saving} onClick={onSave}>
              保存
            </Button>
          </Badge>
          <Button type="primary" onClick={onNext}>
            下一页 <RightOutlined />
          </Button>
        </div>
      </div>
    </Spin>
  );
};

export default Step2ToolConfig;
