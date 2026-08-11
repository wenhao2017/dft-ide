import * as vscode from 'vscode'
import * as path from 'path'

import * as XLSX from 'xlsx'
import yaml from 'yaml'
import { z } from 'zod'

const booleanWithDefaultFalse = z.boolean().optional().default(false)

export const landerStepSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),

  name: z.string().trim().min(1, 'name 不能为空'),

  command: z.string().trim().min(1, 'command 不能为空'),

  description: z.string().default(''),

  enableGroup: booleanWithDefaultFalse,

  enableTC: booleanWithDefaultFalse,

  enableSubAttr: booleanWithDefaultFalse,
})

export type LanderStep = z.infer<typeof landerStepSchema>

export interface LanderFlowSelectionOptions {
  init?: boolean
}

export interface LanderModeConfigInfo {
  atpgStage: string
  atpgMode: string
  parameters: LanderModeParameters
}

export interface LanderModeParameters {
  groups: string[]
  tcs: string[]
  subattrs: string[]
}

export interface LanderParameterRelation {
  group: string | null
  tc: string | null
  subattr: string | null
}

export interface LanderParameterSourcePaths {
  workPath: string
  tcFile: string
}

type CfgCommand = { name: string; options: Map<string, string> }

/**
 * Apply Tcl's line-continuation pre-pass. Tcl consumes only spaces and tabs
 * following the escaped newline; a second newline still terminates the
 * command. Using `\s*` here would incorrectly swallow blank separator lines
 * and merge adjacent define_*_info commands.
 */
function normalizeTclLineContinuations(content: string): string {
  return content.replace(/\\\r?\n[ \t]*/g, ' ')
}

function parseCfgCommands(content: string): CfgCommand[] {
  const logicalLines = normalizeTclLineContinuations(content).split(/\r?\n/)
  return logicalLines.flatMap((rawLine) => {
    const line = rawLine.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) return []
    const tokens = line.match(/"(?:\\.|[^"])*"|'[^']*'|\{[^}]*\}|\S+/g) ?? []
    const name = tokens.shift()
    if (!name) return []
    const options = new Map<string, string>()
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      if (!token.startsWith('-')) continue
      const value = tokens[index + 1]?.startsWith('-') ? '' : (tokens[++index] ?? '')
      options.set(token.slice(1), value.replace(/^(?:"|'|\{)|(?:"|'|\})$/g, ''))
    }
    return [{ name, options }]
  })
}

export function parseLanderModeConfigInfo(content: string): LanderModeConfigInfo {
  const atpg = parseCfgCommands(content).find((item) => item.name === 'define_atpg_info')

  return {
    atpgStage: atpg?.options.get('stage') ?? '',
    atpgMode: atpg?.options.get('mode') ?? '',
    parameters: parseLanderModeParameters(content),
  }
}

const PARAMETER_OPTIONS = {
  groups: ['group', 'groups'],
  tcs: ['tc', 'tcs'],
  subattrs: ['subattr', 'subattrs'],
} as const

function splitParameterValues(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(/[\s,;]+/)
    .map((item) => item.trim().replace(/^(?:"|'|\{)|(?:"|'|\})$/g, ''))
    .filter(Boolean)
}

function option(commands: CfgCommand[], commandName: string, optionName: string): string {
  return commands.find((command) => command.name === commandName)?.options.get(optionName) ?? ''
}

/**
 * Build the TC source path used by Lander. Group-specific source files are
 * intentionally ignored; Group/TC/SubAttr choices are all loaded from tcFile.
 */
export function resolveLanderParameterSourcePaths(
  content: string,
  verificationRepoRoot: string,
  selectedStage: string,
): LanderParameterSourcePaths {
  const commands = parseCfgCommands(content)
  const projectMode = option(commands, 'define_project_info', 'mode')
  const planStage = option(commands, 'define_project_info', 'stage')
  const version = option(commands, 'define_project_info', 'version')
  const crg = option(commands, 'define_project_info', 'crg')
  const workPath = path.join(
    verificationRepoRoot,
    selectedStage,
    projectMode,
    'lander_dir',
  )
  const releasePath = path.join(workPath, '01.plan', 'release', planStage, version)

  let tcFile = ''

  if (projectMode === 'atpg') {
    const verificationMode = option(commands, 'define_atpg_info', 'mode').toUpperCase()
    const groupMode = option(commands, 'define_atpg_info', 'top_mode')
    const fault = option(commands, 'define_atpg_info', 'fault_type')
    const fileStem = `${verificationMode}_GROUP_TC.${groupMode}.${fault}.cfg`
    const sourceDirectory = crg === 'on' ? path.join(releasePath, 'crg') : releasePath
    tcFile = path.join(sourceDirectory, `${fileStem}.tc.xlsx`)
  } else if (projectMode === 'fml') {
    const groupMode = option(commands, 'define_gml_info', 'top_mode')
      || option(commands, 'define_fml_info', 'top_mode')
    tcFile = path.join(releasePath, `FML_TC_PLAN.${groupMode}.xls`)
  } else if (projectMode === 'ip' || projectMode === 'jtag') {
    const prefix = projectMode.toUpperCase()
    tcFile = path.join(releasePath, `${prefix}_TC_PLAN.xls`)
  } else if (projectMode === 'mbist') {
    const verificationMode = option(commands, 'define_mbist_info', 'mode')
    const tcPlans = option(commands, 'define_incomming_info', 'tc_plans')
    if (tcPlans === 'onlychk') {
      tcFile = path.join(
        workPath,
        '96.wgl_check',
        planStage,
        version,
        'mbist',
        'MERGE_MBIST_TOP_TC_PLAN.json',
      )
    } else if (verificationMode === 'sub' || verificationMode === 'top') {
      const modeUpper = verificationMode.toUpperCase()
      tcFile = path.join(releasePath, `MBIST_${modeUpper}_TC_PLAN.json`)
    } else if (verificationMode === 'top_repair') {
      tcFile = path.join(releasePath, 'REPAIR_TC_PLAN.json')
    }
  }

  return { workPath, tcFile }
}

const EMPTY_LANDER_MODE_PARAMETERS: LanderModeParameters = {
  groups: [],
  tcs: [],
  subattrs: [],
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function isEnabledRelationCell(value: unknown): boolean {
  const normalized = cellText(value).toLowerCase()
  return Boolean(normalized) && !['n', 'no', 'false', '0', '-'].includes(normalized)
}

/**
 * Excel plans contain only Group and TC choices. A row above the real header
 * may contain metadata (for example `dft2pr`), so only the row containing the
 * `group` header and the data below it are interpreted. Older plans without a
 * literal `group` header use the first non-empty row as their TC header.
 */
export function parseLanderWorkbookParameters(bytes: Uint8Array): LanderModeParameters {
  return collectLanderModeParameters(parseLanderWorkbookRelations(bytes))
}

export function parseLanderWorkbookRelations(bytes: Uint8Array): LanderParameterRelation[] {
  const workbook = XLSX.read(bytes, { type: 'array' })
  const relations: LanderParameterRelation[] = []

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: false,
    })
    if (!rows.length) continue

    let headerIndex = rows.findIndex((row) => row.some(
      (value) => cellText(value).toLowerCase() === 'group',
    ))
    if (headerIndex < 0) {
      headerIndex = rows.findIndex((row) => row.some((value) => cellText(value)))
    }
    if (headerIndex < 0) continue

    const header = rows[headerIndex]
    const explicitGroupColumn = header.findIndex(
      (value) => cellText(value).toLowerCase() === 'group',
    )
    const groupColumn = explicitGroupColumn >= 0
      ? explicitGroupColumn
      : Math.max(0, header.findIndex((value) => cellText(value)) - 1)

    rows.slice(headerIndex + 1).forEach((row) => {
      const group = cellText(row[groupColumn])
      const relationCount = relations.length
      header.forEach((value, column) => {
        const tc = cellText(value)
        if (column === groupColumn || !tc || !isEnabledRelationCell(row[column])) return
        relations.push({ group: group || null, tc, subattr: null })
      })
      if (group && relations.length === relationCount) {
        relations.push({ group, tc: null, subattr: null })
      }
    })
  }

  return uniqueRelations(relations)
}

/**
 * JSON plans may additionally describe SubAttr choices. A TC key is exposed
 * only when at least one detail row has a non-null value for that key.
 */
export function parseLanderJsonParameters(content: string): LanderModeParameters {
  return collectLanderModeParameters(parseLanderJsonRelations(content))
}

export function parseLanderJsonRelations(content: string): LanderParameterRelation[] {
  const parsed: unknown = JSON.parse(content)
  const detail = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { detail?: unknown }).detail)
      ? (parsed as { detail: unknown[] }).detail
      : []
  const relations: LanderParameterRelation[] = []
  const reservedKeys = new Set(['line_index', 'group', 'subattr'])

  detail.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return
    const row = item as Record<string, unknown>
    const group = cellText(row.group)
    const subattr = cellText(row.subattr)
    const relationCount = relations.length
    Object.entries(row).forEach(([key, value]) => {
      if (!reservedKeys.has(key) && isEnabledRelationCell(value)) {
        relations.push({
          group: group || null,
          tc: key,
          subattr: subattr || null,
        })
      }
    })
    if ((group || subattr) && relations.length === relationCount) {
      relations.push({ group: group || null, tc: null, subattr: subattr || null })
    }
  })

  return uniqueRelations(relations)
}

function uniqueRelations(relations: LanderParameterRelation[]): LanderParameterRelation[] {
  const seen = new Set<string>()
  return relations.filter((relation) => {
    const key = JSON.stringify([relation.group, relation.tc, relation.subattr])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function collectLanderModeParameters(
  relations: LanderParameterRelation[],
): LanderModeParameters {
  return {
    groups: unique(relations.flatMap((item) => item.group ? [item.group] : [])),
    tcs: unique(relations.flatMap((item) => item.tc ? [item.tc] : [])),
    subattrs: unique(relations.flatMap((item) => item.subattr ? [item.subattr] : [])),
  }
}

export function parseLanderParameterFile(
  filePath: string,
  bytes: Uint8Array,
): LanderModeParameters {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.json') {
    return parseLanderJsonParameters(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  }
  if (extension === '.xls' || extension === '.xlsx') {
    return parseLanderWorkbookParameters(bytes)
  }
  return { ...EMPTY_LANDER_MODE_PARAMETERS }
}

export function parseLanderParameterRelationsFile(
  filePath: string,
  bytes: Uint8Array,
): LanderParameterRelation[] {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.json') {
    return parseLanderJsonRelations(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  }
  if (extension === '.xls' || extension === '.xlsx') {
    return parseLanderWorkbookRelations(bytes)
  }
  return []
}

async function isFile(filePath: string): Promise<boolean> {
  if (!filePath) return false
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
    return (stat.type & vscode.FileType.File) !== 0
  } catch {
    return false
  }
}

async function loadLanderModeParametersFromFiles(
  sources: LanderParameterSourcePaths,
): Promise<LanderModeParameters> {
  if (!await isFile(sources.tcFile)) return { ...EMPTY_LANDER_MODE_PARAMETERS }
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(sources.tcFile))
    return parseLanderParameterFile(sources.tcFile, bytes)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`解析 Lander Group/TC/SubAttr 参数文件失败: ${sources.tcFile}: ${reason}`)
  }
}

async function loadLanderParameterRelationsFromFiles(
  sources: LanderParameterSourcePaths,
): Promise<LanderParameterRelation[]> {
  if (!await isFile(sources.tcFile)) {
    throw new Error(`Lander Group/TC/SubAttr source file does not exist: ${sources.tcFile}`)
  }
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(sources.tcFile))
    return parseLanderParameterRelationsFile(sources.tcFile, bytes)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse Lander Group/TC/SubAttr source: ${sources.tcFile}: ${reason}`)
  }
}

/**
 * Resolve the parameter choices owned by one mode.cfg.
 *
 * Inline parsing remains available for config-info callers. Runtime choices
 * are loaded from the resolved JSON/XLS/XLSX plan by getLanderModeParameters.
 */
export function parseLanderModeParameters(content: string): LanderModeParameters {
  const commands = parseCfgCommands(content)
  const readOptions = (optionNames: readonly string[]) => {
    const values = commands.flatMap((command) => optionNames.flatMap((optionName) => {
      const value = command.options.get(optionName)
      return value === undefined ? [] : splitParameterValues(value)
    }))
    return Array.from(new Set(values))
  }

  return {
    groups: readOptions(PARAMETER_OPTIONS.groups),
    tcs: readOptions(PARAMETER_OPTIONS.tcs),
    subattrs: readOptions(PARAMETER_OPTIONS.subattrs),
  }
}

async function readModeConfig(cfgPath: string): Promise<string> {
  if (!cfgPath.toLowerCase().endsWith('.cfg')) {
    throw new Error('Mode 配置文件必须是 .cfg 文件')
  }

  try {
    const cfgBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(cfgPath))
    return new TextDecoder('utf-8', { fatal: true }).decode(cfgBytes)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`读取或解析 mode.cfg 失败: ${reason}`)
  }
}

export async function getLanderModeConfigInfo(
  cfgPath: string,
): Promise<LanderModeConfigInfo> {
  return parseLanderModeConfigInfo(await readModeConfig(cfgPath))
}

export async function getLanderModeParameters(
  cfgPath: string,
  sourceContext?: { verificationRepoRoot: string; selectedStage: string },
): Promise<LanderModeParameters> {
  const content = await readModeConfig(cfgPath)
  if (!sourceContext) return parseLanderModeParameters(content)
  const sources = resolveLanderParameterSourcePaths(
    content,
    sourceContext.verificationRepoRoot,
    sourceContext.selectedStage,
  )
  return loadLanderModeParametersFromFiles(sources)
}

export async function getLanderModeParameterRelations(
  cfgPath: string,
  sourceContext: { verificationRepoRoot: string; selectedStage: string },
): Promise<LanderParameterRelation[]> {
  const content = await readModeConfig(cfgPath)
  const sources = resolveLanderParameterSourcePaths(
    content,
    sourceContext.verificationRepoRoot,
    sourceContext.selectedStage,
  )
  return loadLanderParameterRelationsFromFiles(sources)
}

function selectFlowNames(content: string, options: LanderFlowSelectionOptions): string[] {
  const commands = parseCfgCommands(content)
  const command = (name: string) => commands.find((item) => item.name === name)
  const projectMode = command('define_project_info')?.options.get('mode') ?? ''
  const atpg = command('define_atpg_info')
  const acrg = atpg?.options.get('crg') ?? ''
  const odc = atpg?.options.get('odc') ?? ''
  const verificationMode = atpg?.options.get('mode') ?? ''
  const sed3d = Boolean(command('define_incomming_info')?.options.get('instmap_path'))
  const initialize = options.init === true

  if (odc === 'on' && verificationMode === 'prt_top' && acrg === 'off' && !sed3d) return ['create_project', 'gen_design_info', 'gen_plan_env', 'release_plan', 'gen_atpg_setting', 'gen_pdl_env', 'gen_atpg_env_pre', 'gen_atpg_env', 'run_atpg', 'upload_atpg_database_pre', 'upload_atpg_database', 'gen_odc_env', 'gen_odc_pattern', 'upload_odc_database_pre', 'upload_odc_database', 'gen_sim_env', 'run_sim', 'upload_simu_database_pre', 'upload_simu_database', 'gen_report', 'delivery_data']
  if (command('define_lib_check_info')) return ['get_dftlib_info', 'gen_dftlib_rtl', 'run_dftlib_qualib', 'gen_dftlib_qa_rpt', 'run_dftlib_syn', 'run_dftlib_scan', 'run_dftlib_atpg', 'gen_dftlib_sdf', 'run_dftlib_sim', 'gen_check_tb', 'upload_libcheck_data', 'modify_sdf']
  if (projectMode === 'merge_3d') return ['create_project', 'gen_design_info', 'gen_3d_merge_env', 'analysis_3d_netlist', 'complete_check', 'run_3d_merge', 'delivery_data']
  if (projectMode === 'fml') return ['create_project', 'gen_design_info', 'gen_plan_env', 'release_plan', 'gen_fml_env', 'run_fml', 'upload_fml_database_pre', 'upload_fml_database', 'gen_report', 'delivery_data']
  if (projectMode === 'prune') return ['create_project', 'gen_design_info', 'gen_prune_env', 'run_prune', 'upload_prune_database_pre', 'upload_prune_database', 'gen_report', 'delivery_data']
  if (projectMode === 'ip' || projectMode === 'jtag') return ['create_project', 'gen_design_info', 'gen_plan_env', 'release_plan', 'gen_pdl_env', 'gen_run_env', projectMode === 'ip' ? 'run_ip_gen' : 'run_jtag_gen', 'gen_sim_env', 'run_sim', 'upload_simu_database_pre', 'upload_simu_database', 'gen_report', 'delivery_data']
  if (projectMode === 'mbist') return ['create_project', 'gen_design_info', 'gen_plan_env', 'release_plan', 'gen_pdl_env', 'gen_dftm_excel', 'gen_mbist_setting', 'gen_run_env', 'run_mbist_gen', ...(sed3d ? ['sed_3d_tb'] : []), 'gen_sim_env', 'run_sim', 'upload_simu_database_pre', 'upload_simu_database', 'gen_report', 'run_wgl_check', 'delivery_data']
  if (projectMode !== 'atpg') return []
  if (verificationMode === 'all_scan') return ['create_project', 'gen_design_info', 'gen_plan_env', 'release_plan', 'gen_atpg_setting', 'gen_pdl_env', 'gen_atpg_env_pre', 'gen_atpg_env', 'run_atpg', 'upload_atpg_database_pre', 'upload_atpg_database', 'gen_all_scan_env', 'run_all_scan', 'gen_sim_env', 'run_sim', 'upload_simu_database_pre', 'upload_simu_database', 'gen_report', 'delivery_data']
  if (verificationMode === 'all_scan' || (!(initialize && !sed3d) && acrg !== 'on' && acrg !== 'off')) return []
  const execution = (initialize && !sed3d) || acrg === 'off'
    ? ['run_atpg', 'upload_atpg_database_pre', 'upload_atpg_database']
    : ['gen_crg_env', 'run_crg_gen']
  return ['create_project', 'gen_design_info', 'gen_plan_env', 'release_plan', 'gen_atpg_setting', 'gen_pdl_env', 'gen_atpg_env_pre', 'gen_atpg_env', ...execution, ...(sed3d ? ['sed_3d_tb'] : []), 'gen_sim_env', 'run_sim', 'upload_simu_database_pre', 'upload_simu_database', 'gen_report', 'delivery_data']
}

/**
 * 当前 YAML 顶层直接是 Step 数组：
 *
 * - id: create_project
 *   name: create_project
 *   command: ...
 */
const landerPipelineSchema = z.array(landerStepSchema)

export async function getLanderModePipelines(
  extensionUri: vscode.Uri,
  cfgPath?: string,
  selectionOptions: LanderFlowSelectionOptions = {},
): Promise<LanderStep[]> {
  const pipelineUri = vscode.Uri.joinPath(
    extensionUri,
    'pipelines',
    'lander.yaml',
  )

  let content: string

  try {
    const bytes = await vscode.workspace.fs.readFile(pipelineUri)

    content = new TextDecoder('utf-8').decode(bytes)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    throw new Error(`找不到 pipeline 文件: ${pipelineUri.fsPath}；${reason}`)
  }

  let yamlData: unknown

  try {
    yamlData = yaml.parse(content)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    throw new Error(`pipeline YAML 解析失败: ${pipelineUri.fsPath}；${reason}`)
  }

  const result = landerPipelineSchema.safeParse(yamlData)

  if (!result.success) {
    throw new Error(`lander pipeline 格式错误: ${result.error.message}`)
  }

  if (!cfgPath) return result.data

  const cfgContent = await readModeConfig(cfgPath)

  const selectedNames = selectFlowNames(cfgContent, selectionOptions)
  if (!selectedNames.length) {
    throw new Error('解析 mode.cfg 后未匹配到任何 Step，请检查配置内容以及 init / flat_mode 选项')
  }
  const stepsByName = new Map(result.data.map((step) => [step.name, step]))
  const missing = selectedNames.filter((name) => !stepsByName.has(name))
  if (missing.length) throw new Error(`lander.yaml 缺少 Step: ${missing.join(', ')}`)
  return selectedNames.map((name) => stepsByName.get(name)!)
}
