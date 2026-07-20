export type ModePanelTab = 'mode' | 'group' | 'tc' | 'subattr'

export interface BaseConfigItem {
  name: string
}

export interface ModeConfigItem {
  /**
   * mode.cfg 解析结果。
   *
   * name:
   *   运行模式名称
   *
   * preMode:
   *   用于获取:
   *   pipelines/lander_{preMode}.yaml
   */
  name: string

  preMode: string
}

export type ModePanelItem = BaseConfigItem | ModeConfigItem

export interface LanderStep {
  id: string
  name: string
  command: string
  description: string

  enableGroup: boolean
  enableTC: boolean
  enableSubAttr: boolean
}

export type VersionToolConfig = {
  id: string
  type: 'version'
  name: string
  version: string
  path?: string
}

export type PathToolConfig = {
  id: string
  type: 'path'
  path: string
  name?: string
  version?: string
}

export type ToolConfig = VersionToolConfig | PathToolConfig

export type ToolPatch = {
  type?: ToolConfig['type']
  name?: string
  version?: string
  path?: string
}

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
  donau: DonauConfig
}

export interface ModeRunPayload {
  mode: ModeConfigItem

  preMode: string

  stepRange: [number, number]

  stepNames: string[]

  stepIds: string[]

  steps: LanderStep[]

  rows: RunParamRow[]
}

export interface ParsedCfgResult {
  /**
   * mode.cfg 原始解析候选值。
   *
   * 例如：
   * verification
   * mode_verification
   * lander_verification
   */
  extractedCandidate?: string

  /**
   * 归一化后的 preMode
   */
  preMode?: string
}

export interface PreModeExtractContext {
  file: File
  text: string
}

export type PreModeExtractor = (
  context: PreModeExtractContext,
) => string | undefined | Promise<string | undefined>

export interface GetLanderModePipelinesResult {
  success: boolean

  preMode?: string

  steps: LanderStep[]

  error?: string
}

export type GetLanderModePipelines = (
  preMode: string,
) => Promise<GetLanderModePipelinesResult>

export interface ModePanelProps {
  accent: string

  initialTab?: ModePanelTab

  title?: string

  onSelect?: (tab: ModePanelTab, item?: ModePanelItem) => void

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

  group: BaseConfigItem[]

  tc: BaseConfigItem[]

  subattr: BaseConfigItem[]
}

/**
 * 当前选中项
 */
export type NameStore = Record<ModePanelTab, string>

/**
 * 勾选列表
 */
export type NameListStore = Record<ModePanelTab, string[]>

export type SearchStore = Record<ModePanelTab, string>

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
