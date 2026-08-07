import * as vscode from 'vscode'

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

type CfgCommand = { name: string; options: Map<string, string> }

function parseCfgCommands(content: string): CfgCommand[] {
  const logicalLines = content.replace(/\\\r?\n\s*/g, ' ').split(/\r?\n/)
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

/**
 * Resolve the parameter choices owned by one mode.cfg.
 *
 * Today inline Group/TC/SubAttr options are supported. Keeping this loader on
 * the extension-host side gives xlsx/json-backed parameter sources a single
 * integration point without reintroducing those values as global resources.
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
): Promise<LanderModeParameters> {
  return parseLanderModeParameters(await readModeConfig(cfgPath))
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
