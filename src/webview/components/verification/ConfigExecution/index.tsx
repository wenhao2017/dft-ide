"use client"

import { useState } from "react"
import { Tabs } from "antd"

import ConfigTab from "./ConfigTab"
import ExecutionTab from "./ExecutionTab"

export type TC = {
  name: string
}

export type SubAttr = {
  name: string
}

export type Group = {
  name: string
  tc?: string[]
  subattr?: string[]
}

export type ConfigData = {
  tc: TC[]
  subattr: SubAttr[]
  groups: Group[]
}

export type ConfigExecutionTab = "config" | "execution"

export type Combination = {
  key: string
  group: string
  tc?: string
  subattr?: string
}

type ConfigExecutionProps = {
  initialConfig: ConfigData
}

const PAGE_CLASS = "dftx-config-execution-page"

const configExecutionCss = `
.${PAGE_CLASS} {
  --dftx-bg: #0b1326;
  --dftx-panel: #131b2e;
  --dftx-panel-header: #171f33;
  --dftx-control: #2d3449;
  --dftx-text: #dae2fd;
  --dftx-text-muted: #c2c6d6;
  --dftx-text-subtle: #8c909f;
  --dftx-border: #424754;
  --dftx-primary: #adc6ff;
  --dftx-primary-bg: rgba(173, 198, 255, 0.12);

  height: 100%;
  min-height: 720px;
  background: var(--dftx-bg);
  color: var(--dftx-text);
}

/* VSCode dark */
.vscode-dark .${PAGE_CLASS} {
  --dftx-bg: var(--vscode-editor-background, #0b1326);
  --dftx-panel: var(--vscode-sideBar-background, #131b2e);
  --dftx-panel-header: var(--vscode-editorGroupHeader-tabsBackground, #171f33);
  --dftx-control: var(--vscode-input-background, #2d3449);
  --dftx-text: var(--vscode-foreground, #dae2fd);
  --dftx-text-muted: var(--vscode-descriptionForeground, #c2c6d6);
  --dftx-text-subtle: var(--vscode-disabledForeground, #8c909f);
  --dftx-border: var(--vscode-panel-border, #424754);
  --dftx-primary: var(--vscode-textLink-foreground, #adc6ff);
  --dftx-primary-bg: color-mix(in srgb, var(--dftx-primary) 16%, transparent);
}

/* VSCode light */
.vscode-light .${PAGE_CLASS} {
  --dftx-bg: var(--vscode-editor-background, #ffffff);
  --dftx-panel: var(--vscode-sideBar-background, #f3f4f6);
  --dftx-panel-header: var(--vscode-editorGroupHeader-tabsBackground, #eef1f6);
  --dftx-control: var(--vscode-input-background, #ffffff);
  --dftx-text: var(--vscode-foreground, #1f2937);
  --dftx-text-muted: var(--vscode-descriptionForeground, #4b5563);
  --dftx-text-subtle: var(--vscode-disabledForeground, #6b7280);
  --dftx-border: var(--vscode-panel-border, #c8d0dc);
  --dftx-primary: var(--vscode-textLink-foreground, #005ac2);
  --dftx-primary-bg: color-mix(in srgb, var(--dftx-primary) 12%, transparent);
}

/* AntD Tabs */
.${PAGE_CLASS} .ant-tabs {
  height: 100%;
  color: var(--dftx-text);
}

.${PAGE_CLASS} .ant-tabs-nav {
  margin: 0;
  padding: 0 12px;
  background: var(--dftx-panel-header);
  border-bottom: 1px solid var(--dftx-border);
}

.${PAGE_CLASS} .ant-tabs-tab {
  color: var(--dftx-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.${PAGE_CLASS} .ant-tabs-tab:hover {
  color: var(--dftx-primary);
}

.${PAGE_CLASS} .ant-tabs-tab-active .ant-tabs-tab-btn {
  color: var(--dftx-primary) !important;
}

.${PAGE_CLASS} .ant-tabs-ink-bar {
  background: var(--dftx-primary);
}

.${PAGE_CLASS} .ant-tabs-content-holder {
  height: calc(100% - 46px);
  background: var(--dftx-bg);
}

.${PAGE_CLASS} .ant-tabs-content {
  height: 100%;
}

.${PAGE_CLASS} .ant-tabs-tabpane {
  height: 100%;
}
`

function makeCombinationKey(input: {
  group: string
  tc?: string
  subattr?: string
}) {
  return [
    input.group,
    input.tc ?? "__no_tc",
    input.subattr ?? "__no_subattr",
  ].join("__")
}

export function generateCombinations(config: ConfigData): Combination[] {
  return config.groups.flatMap((group) => {
    const tcList = group.tc ?? []
    const subattrList = group.subattr ?? []

    if (tcList.length === 0) {
      return [
        {
          key: makeCombinationKey({
            group: group.name,
          }),
          group: group.name,
        },
      ]
    }

    if (subattrList.length === 0) {
      return tcList.map((tc) => ({
        key: makeCombinationKey({
          group: group.name,
          tc,
        }),
        group: group.name,
        tc,
      }))
    }

    return tcList.flatMap((tc) =>
      subattrList.map((subattr) => ({
        key: makeCombinationKey({
          group: group.name,
          tc,
          subattr,
        }),
        group: group.name,
        tc,
        subattr,
      }))
    )
  })
}

export default function ConfigExecution({
  initialConfig,
}: ConfigExecutionProps) {
  const [activeTab, setActiveTab] =
    useState<ConfigExecutionTab>("config")

  const [config, setConfig] = useState<ConfigData>(initialConfig)

  return (
    <div className={PAGE_CLASS}>
      <style>{configExecutionCss}</style>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as ConfigExecutionTab)}
        items={[
          {
            key: "config",
            label: "任务配置",
            children: (
              <ConfigTab
                config={config}
                onChange={setConfig}
              />
            ),
          },
          {
            key: "execution",
            label: "执行配置",
            children: <ExecutionTab />,
          },
        ]}
      />
    </div>
  )
}
