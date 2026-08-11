export type ModePanelTab = 'mode'

export interface ModeConfigItem {
  name: string
  filePath?: string
  versionPath?: string
  versions?: string[]
}

export interface ModeTreeNodeItem {
  key: string
  name: string
  version?: string
}

export interface LanderStep {
  id: string
  name: string
  command: string
  description: string

  enableGroup: boolean
  enableTC: boolean
  enableSubAttr: boolean
}

export type { ToolConfig, ToolPatch } from '../../shared/toolConfigTypes'
import type { ToolConfig } from '../../shared/toolConfigTypes'

export interface DonauConfig {
  group?: string
  queue?: string
  cpu?: string
  mem?: string
}

export interface RunParamRow {
  id: string

  groupNames: string[]
  tcNames: string[]
  subattrNames: string[]

  tools: ToolConfig[]
  extraArg: string
  donau: DonauConfig
}

export interface ModeRunPayload {
  mode: ModeConfigItem

  stepRange: [number, number]

  stepNames: string[]

  stepIds: string[]

  steps: LanderStep[]

  rows: RunParamRow[]
}

export interface GetLanderModePipelinesResult {
  success: boolean

  steps: LanderStep[]

  parameters: LanderModeParameters

  error?: string
}

export interface LanderModeParameters {
  groups: string[]
  tcs: string[]
  subattrs: string[]
}

export type GetLanderModePipelines = (options?: {
  stage?: string
  modeName?: string
  init?: boolean
}) => Promise<GetLanderModePipelinesResult>

export interface ModePanelProps {
  accent: string

  title?: string

  initialCollapsed?: boolean

  onSelect?: (tab: ModePanelTab, item?: ModeTreeNodeItem) => void

  onCheckedChange?: (tab: ModePanelTab, names: string[]) => void

  onDefaultStepsChange?: (stepsByMode: Record<string, LanderStep[]>) => void

  onRun?: (payload: ModeRunPayload) => void

  onStop?: (names: string[]) => void
}

export interface ResourceStore {
  mode: ModeConfigItem[]

  /**
   * 保存 mode.name
   */
  focusModes: string[]

}

/**
 * 当前选中项
 */
export type NameStore = Record<ModePanelTab, ModeTreeNodeItem>

/**
 * 勾选列表
 */
export type NameListStore = Record<ModePanelTab, string[]>

export type LoadingStore = Record<ModePanelTab, boolean>

export type SelectorField = 'groupNames' | 'tcNames' | 'subattrNames'

export interface SelectorState {
  open: boolean

  rowId: string

  field: SelectorField

  search: string

  tempNames: string[]
}

export interface ToolsState {
  open: boolean

  rowId: string

  tools: ToolConfig[]
}

export interface DonauState {
  open: boolean

  rowId: string

  donau: DonauConfig
}
