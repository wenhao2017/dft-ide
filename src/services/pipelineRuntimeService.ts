import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  PipelineEcoHook,
  PipelineEcoPhase,
  PipelineLink,
  PipelineTask,
  TaskStatus,
  pipelineFlowConfigs,
} from '../webview/components/shared/pipelineMockData';
import { resolveProjectPath, resolveProjectRoot } from './workspaceService';
import { getExecutionTerminalCapabilities, registerExecutionTerminalMonitor, stopExecutionTerminal } from './terminalService';
import { formatTime, getVersionFromModuleName } from '../utils';

export type PipelineFlowKey = 'hibist' | 'sailor' | 'verification';
export type PipelineRunState = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface PipelineRuntimeSnapshot {
  runId?: string;
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  tasks: PipelineTask[];
  links: PipelineLink[];
  selectedTaskId?: string;
  runState: PipelineRunState;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
}

export type PipelineHistoryTask = PipelineTask;

export interface PipelineRuntimeHistorySnapshot extends PipelineRuntimeSnapshot {
  tasks: PipelineHistoryTask[];
}

export interface PipelineRuntimeHistoryRecord {
  flow: string;
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  runtimeSnapshot: PipelineRuntimeHistorySnapshot;
}

interface PipelineRuntimeServiceOptions {
  onUpdate: (snapshot: PipelineRuntimeSnapshot) => void;
  onHistory: (record: PipelineRuntimeHistoryRecord) => void;
  openTerminal: (title: string, command: string | string[], cwd?: string, shellPath?: string) => Promise<void> | void;
  getPipelineShellPath?: () => string | undefined;
}

interface PipelineExecutionSession {
  runId: string;
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  logPrefix: string;
  terminalTitle: string;
  tasks: PipelineTask[];
  executionPlan: Array<{
    task: PipelineTask;
    parameters?: Record<string, unknown>;
    markerTaskId: string;
    isLastTaskRun: boolean;
    taskIndex: number;
    continueOnFailure: boolean;
  }>;
  nextIndex: number;
  cwd?: string;
  envConfig?: Record<string, unknown> | null;
  taskConfig?: Record<string, unknown> | null;
  runParameters?: unknown;
  shellPath?: string;
  currentTaskId?: string;
  currentMarkerTaskId?: string;
  buffer: string;
  seenStarts: Set<string>;
  seenEnds: Set<string>;
  seenPhaseStarts: Set<string>;
  seenPhaseEnds: Set<string>;
  monitor?: vscode.Disposable;
  stopped: boolean;
}

interface PipelineEcoExecutionSession {
  runId: string;
  taskId: string;
  phase: PipelineEcoPhase;
  terminalTitle: string;
  buffer: string;
  monitor?: vscode.Disposable;
}

interface PipelineRuntimeContext {
  cwd?: string;
  envConfig?: Record<string, unknown> | null;
  taskConfig?: Record<string, unknown> | null;
  runParameters?: unknown;
}

const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
const nowText = () => formatTime(new Date());
const nowStamp = () => Date.now();

function getPipelineTerminalTitle(flowLabel: string, moduleKey: string): string {
  return `${flowLabel} / ${moduleKey}`;
}

const PIPELINE_PYTHON_MODULE = 'python/3.10.6';
const DEFAULT_DONAU_GROUP = 'ug_dft.HIS-HIS-ASIC-HISC-DFT-PLAT-WS';
const DEFAULT_DONAU_QUEUE = 'normal';

function quoteCshArgument(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

type RuntimeToolConfig =
  | { type: 'version'; name: string; version: string }
  | { type: 'path'; name: string; path: string };

function readToolConfigs(value: unknown): RuntimeToolConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<RuntimeToolConfig>((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? '').trim();
    if (record.type === 'version') {
      const version = String(record.version ?? '').trim();
      return name && version ? [{ type: 'version' as const, name, version }] : [];
    }
    if (record.type === 'path') {
      const toolPath = String(record.path ?? '').trim();
      return name && toolPath ? [{ type: 'path' as const, name, path: toolPath }] : [];
    }
    return [];
  });
}

function appendToolCommands(commands: string[], value: unknown): void {
  for (const tool of readToolConfigs(value)) {
    if (tool.type === 'version') {
      commands.push(`ma ${tool.name}/${tool.version}`);
    } else {
      commands.push(`# Add tool ${tool.name}`);
      commands.push(`setenv PATH "\${PATH}:${tool.path.replace(/(["\\`])/g, '\\$1')}"`);
    }
  }
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function mergeToolConfigs(projectTools: unknown, rowTools: unknown): RuntimeToolConfig[] {
  const merged = new Map<string, RuntimeToolConfig>();
  for (const tool of [...readToolConfigs(projectTools), ...readToolConfigs(rowTools)]) {
    merged.set(tool.name.toLocaleLowerCase(), tool);
  }
  return Array.from(merged.values());
}

function buildPipelineStepExecutionCommand(projectPath: string | undefined, stepCommand: string): string {
  const scriptName = stepCommand.split(' ')[0];
  const scriptPath = resolvePipelineScriptPath(projectPath, scriptName);
  const stepArguments = stepCommand.substring(scriptName.length).trim();
  const argumentsSuffix = stepArguments ? ` ${stepArguments}` : '';
  return `ma ${PIPELINE_PYTHON_MODULE} && python3 ${quoteCshArgument(scriptPath)}${argumentsSuffix}`;
}

function resolvePipelineScriptPath(projectPath: string | undefined, scriptName: string): string {
  const projectScriptPath = projectPath
    ? path.join(path.dirname(projectPath), '.dft-ide', 'local-state', 'scripts', scriptName)
    : '';
  return projectScriptPath && fs.existsSync(projectScriptPath)
    ? projectScriptPath
    : path.resolve(__dirname, '../scripts', scriptName);
}

function getRunFlowScriptName(command: string): string | undefined {
  const scriptName = command.trim().split(/\s+/)[0];
  return /^run_flow_[A-Za-z0-9_-]+$/.test(scriptName) ? scriptName : undefined;
}

function getDefaultRunFlowScriptName(flowKey: PipelineFlowKey): string {
  if (flowKey === 'verification') return 'run_flow_lander';
  return `run_flow_${flowKey}`;
}

function getRunFlowStepName(task: PipelineTask): string {
  if (!getRunFlowScriptName(task.command)) return task.id;
  const [, stepName] = task.command.trim().split(/\s+/, 2);
  return stepName || task.id;
}

function resolveEcoScriptPath(
  flowKey: PipelineFlowKey,
  command: string,
  envConfig?: Record<string, unknown> | null,
): { scriptName: string; scriptPath?: string } {
  const runFlowScript = getRunFlowScriptName(command) ?? getDefaultRunFlowScriptName(flowKey);
  const scriptName = `${runFlowScript}_eco`;
  const projectPath = resolveProjectPath(flowKey);
  if (!projectPath) {
    return { scriptName };
  }
  const stage = flowKey === 'verification' ? firstNonEmptyString(envConfig?.stage) : '';
  const candidateScriptPath = flowKey === 'verification'
    ? (stage ? path.join(projectPath, stage, 'eco', scriptName) : undefined)
    : path.join(projectPath, 'eco', scriptName);
  return {
    scriptName,
    scriptPath: candidateScriptPath && fs.existsSync(candidateScriptPath)
      ? candidateScriptPath
      : undefined,
  };
}

function makeEcoHook(
  phase: PipelineEcoPhase,
  scriptPath?: string,
  previous?: PipelineEcoHook,
): PipelineEcoHook {
  return {
    phase,
    scriptPath,
    status: previous?.status ?? 'pending',
    attempts: previous?.attempts ?? 0,
    startedAt: previous?.startedAt,
    finishedAt: previous?.finishedAt,
    duration: previous?.duration,
    exitCode: previous?.exitCode,
    lastRunSource: previous?.lastRunSource,
  };
}

function attachEcoRuntime(
  task: PipelineTask,
  flowKey: PipelineFlowKey,
  envConfig?: Record<string, unknown> | null,
): PipelineTask {
  const resolved = resolveEcoScriptPath(flowKey, task.command, envConfig);
  return {
    ...task,
    eco: {
      scriptName: resolved.scriptName,
      scriptPath: resolved.scriptPath,
      before: makeEcoHook('before', resolved.scriptPath, task.eco?.before),
      after: makeEcoHook('after', resolved.scriptPath, task.eco?.after),
    },
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

function isInterruptOutput(value: string): boolean {
  const normalized = stripAnsi(value).toLowerCase();
  return normalized.includes('\u0003') ||
    normalized.includes('^c') ||
    normalized.includes('keyboardinterrupt');
}

function buildStepEndMarker(runId: string, taskId: string): string {
  return `__DFT_IDE_STEP_END__|${runId}|${taskId}|`;
}

function resolveVerificationRunParameters(
  runParameters: unknown,
  taskConfig?: Record<string, unknown> | null,
): unknown {
  if (!Array.isArray(runParameters)) {
    return runParameters;
  }

  const step2 = taskConfig?.step2 as Record<string, unknown> | undefined;
  const task = step2?.step2Task as Record<string, unknown> | undefined;
  const fallbackDonau = {
    group: String(task?.clusterGroup ?? DEFAULT_DONAU_GROUP).trim() || DEFAULT_DONAU_GROUP,
    queue: String(task?.clusterQueue ?? DEFAULT_DONAU_QUEUE).trim() || DEFAULT_DONAU_QUEUE,
    cpu: String(task?.cpu ?? '').trim(),
    mem: String(task?.memory ?? '').trim(),
  };

  return runParameters.map((row) => {
    if (!row || typeof row !== 'object') {
      return row;
    }
    const record = row as Record<string, unknown>;
    const suppliedDonau = record.donau && typeof record.donau === 'object'
      ? record.donau as Record<string, unknown>
      : {};
    const value = (key: keyof typeof fallbackDonau) => (
      String(suppliedDonau[key] ?? '').trim() || fallbackDonau[key]
    );
    return {
      ...record,
      donau: {
        group: value('group'),
        queue: value('queue'),
        ...(value('cpu') ? { cpu: value('cpu') } : {}),
        ...(value('mem') ? { mem: value('mem') } : {}),
      },
    };
  });
}

function readRunParameterNames(row: Record<string, unknown>, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function getApplicableVerificationParameterSets(
  task: PipelineTask,
  runParameters: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(runParameters)) return [];

  const parameterTask = task as PipelineTask & {
    enableGroup?: boolean;
    enableTC?: boolean;
    enableSubAttr?: boolean;
  };
  const enabledFields = [
    parameterTask.enableGroup ? 'groupNames' : undefined,
    parameterTask.enableTC ? 'tcNames' : undefined,
    parameterTask.enableSubAttr ? 'subattrNames' : undefined,
  ].filter((field): field is string => Boolean(field));
  if (enabledFields.length === 0) return [];

  return runParameters.filter((row): row is Record<string, unknown> => {
    if (!row || typeof row !== 'object') return false;
    const record = row as Record<string, unknown>;
    return enabledFields.some((field) => readRunParameterNames(record, field).length > 0);
  });
}

function buildVerificationExecutionCommands(projectPath: string | undefined, task: PipelineTask): string[] {
  return [buildPipelineStepExecutionCommand(projectPath, task.command.trim())];
}

function appendVerificationParameterCommands(
  commands: string[],
  task: PipelineTask,
  runParameters: unknown,
): void {
  const parameterTask = task as PipelineTask & {
    enableGroup?: boolean;
    enableTC?: boolean;
    enableSubAttr?: boolean;
  };
  const row = Array.isArray(runParameters) && runParameters[0] && typeof runParameters[0] === 'object'
    ? runParameters[0] as Record<string, unknown>
    : undefined;
  if (!row) return;

  const append = (enabled: boolean | undefined, key: string, envName: string) => {
    if (!enabled) return;
    const value = readRunParameterNames(row, key).join(',');
    commands.push(`setenv ${envName} ${quoteCshArgument(value)}`);
  };
  append(parameterTask.enableGroup, 'groupNames', 'DFT_IDE_GROUPS');
  append(parameterTask.enableTC, 'tcNames', 'DFT_IDE_TCS');
  append(parameterTask.enableSubAttr, 'subattrNames', 'DFT_IDE_SUBATTRS');
}
function buildStepCommands(
  runId: string,
  task: PipelineTask,
  index: number,
  flowKey: PipelineFlowKey,
  moduleKey: string,
  envConfig?: Record<string, unknown> | null,
  taskConfig?: Record<string, unknown> | null,
  runParameters?: unknown,
  markerTaskId: string = task.id,
): string | string[] {
  const commands: string[] = [];
  const projectPath = resolveProjectPath(flowKey);
  commands.push(`setenv DFT_IDE_HISTORY ${quoteCshArgument(runId)}`);
  commands.push(`setenv DFT_IDE_MARKER_TASK_ID ${quoteCshArgument(markerTaskId)}`);

  if (index === 0) {
    const [oriModuleKey, version] = getVersionFromModuleName(moduleKey);
    if (version) {
      commands.push(`setenv DFT_IDE_MODULE_ORI "${oriModuleKey}"`);
      commands.push(`setenv DFT_IDE_VERSION "${version}"`);
    }
    const moduleEnvName = flowKey === 'verification' ? 'DFT_IDE_MODE' : 'DFT_IDE_MODULE';
    commands.push(`setenv ${moduleEnvName} "${moduleKey}"`);
    if (projectPath) {
      commands.push(`setenv DFT_IDE_WORK_PATH "${projectPath}"`);
    }
    const stage = flowKey === 'verification'
      ? firstNonEmptyString(envConfig?.stage)
      : '';
    if (stage) {
      commands.push(`setenv DFT_IDE_STAGE ${quoteCshArgument(stage)}`);
    }

    const source = taskConfig?.step2 as Record<string, unknown> | undefined;
    const customConfig = source?.step2Task as Record<string, unknown> | undefined;
    if (customConfig) {
      const parameterRow = Array.isArray(runParameters) && runParameters[0] && typeof runParameters[0] === 'object'
        ? runParameters[0] as Record<string, unknown>
        : undefined;
      appendToolCommands(commands, mergeToolConfigs(customConfig.tools, parameterRow?.tools));

      const parameterDonau = parameterRow?.donau && typeof parameterRow.donau === 'object'
        ? parameterRow.donau as Record<string, unknown>
        : undefined;
      const clusterGroup = firstNonEmptyString(parameterDonau?.group, customConfig.clusterGroup);
      const clusterQueue = firstNonEmptyString(parameterDonau?.queue, customConfig.clusterQueue);
      const cpu = firstNonEmptyString(parameterDonau?.cpu, customConfig.cpu);
      const memory = firstNonEmptyString(parameterDonau?.mem, customConfig.memory);
      const clusterExtra = firstNonEmptyString(customConfig.clusterExtra);
      if (clusterGroup) {
        commands.push(`setenv DONAU_GROUP "${clusterGroup}"`);
        const queue = clusterQueue ? `-q ${clusterQueue}` : '';
        let resource = '';
        if (cpu || memory) {
          const resources: string[] = [];
          if (cpu) {
            resources.push(`cpu=${cpu}`);
          }
          if (memory) {
            resources.push(`mem=${memory}`);
          }
          resource = `-R '${resources.join(';')}'`;
        }
        const dsubArgs = ['-A', clusterGroup, queue, resource, clusterExtra]
          .filter(Boolean)
          .join(' ');
        commands.push(`setenv DFT_IDE_DSUBRUN_I "dsub -I ${dsubArgs}"`);
      }
    }
  }

  if (flowKey === 'verification') {
    appendVerificationParameterCommands(commands, task, runParameters);
  }

  const stepCommand = task.command.trim();
  const executionCommands = flowKey === 'verification'
    ? buildVerificationExecutionCommands(projectPath, task)
    : [buildPipelineStepExecutionCommand(projectPath, stepCommand)];
  commands.push(`echo "__DFT_IDE_STEP_START__|${runId}|${markerTaskId}"`);
  commands.push(`echo "=== [DFT IDE] Step: ${task.name || task.id} ==="`);
  commands.push('set dft_ide_step_status = 0');
  for (const executionCommand of executionCommands) {
    commands.push(`echo '[DFT IDE] 执行命令: ${executionCommand}'`);
    commands.push(executionCommand);
    commands.push('set dft_ide_step_status = $status');
    commands.push('if ($dft_ide_step_status != 0) goto dft_ide_step_end');
  }
  commands.push('dft_ide_step_end:');
  commands.push(`echo "${buildStepEndMarker(runId, markerTaskId)}$dft_ide_step_status"`);

  if (projectPath) {
    const stage = flowKey === 'verification' && typeof envConfig?.stage === 'string'
      ? envConfig.stage.trim()
      : '';
    const targetDir = path.join(
      path.dirname(projectPath),
      ".dft-ide",
      "local-state",
      "run_flow",
      flowKey,
      ...(stage ? [stage] : []),
      moduleKey,
    );
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, task.name);
    const scriptContent = commands.map(cmd => cmd.trim()).join('\n');
    fs.writeFileSync(
      targetFile,
      `#!/bin/csh -f\nstty sane >& /dev/null\nstty onlcr >& /dev/null\n${scriptContent}\n`,
    );
    fs.chmodSync(targetFile, 0o755);
    return `source ${targetFile}`;
  }

  return commands;
}

export function getPipelineRuntimeKey(flowKey: PipelineFlowKey, moduleKey: string): string {
  return `${flowKey}:${moduleKey}`;
}

export function isPipelineFlowKey(value: unknown): value is PipelineFlowKey {
  return value === 'hibist' || value === 'sailor' || value === 'verification';
}

function getProjectRootPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// Lightweight YAML parser
function parseYamlTasks(content: string): PipelineTask[] {
  const lines = content.split(/\r?\n/);
  const tasks: PipelineTask[] = [];
  let currentTask: Partial<PipelineTask> | null = null;

  for (let line of lines) {
    const hashIndex = line.indexOf('#');
    if (hashIndex !== -1) {
      line = line.substring(0, hashIndex);
    }
    line = line.trimEnd();
    if (!line.trim()) continue;

    // Check for "- id: ..."
    const listItemMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listItemMatch) {
      if (currentTask && currentTask.id) {
        tasks.push({
          id: currentTask.id,
          name: currentTask.name || currentTask.id,
          command: currentTask.command || '',
          status: 'pending',
          attempts: 1,
          description: currentTask.description || '',
        });
      }
      currentTask = {};
      const rest = listItemMatch[2].trim();
      const colonIndex = rest.indexOf(':');
      if (colonIndex !== -1) {
        const key = rest.substring(0, colonIndex).trim();
        let val = rest.substring(colonIndex + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        currentTask[key as keyof PipelineTask] = val as any;
      }
    } else {
      const kvMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (kvMatch && currentTask) {
        const key = kvMatch[2].trim();
        let val = kvMatch[3].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        currentTask[key as keyof PipelineTask] = val as any;
      }
    }
  }

  if (currentTask && currentTask.id) {
    tasks.push({
      id: currentTask.id,
      name: currentTask.name || currentTask.id,
      command: currentTask.command || '',
      status: 'pending',
      attempts: 1,
      description: currentTask.description || '',
    });
  }

  return tasks;
}

const DEFAULT_PIPELINE_TASKS: Record<PipelineFlowKey, Array<{ id: string; name: string; command: string; description: string }>> = {
  hibist: [
    { id: 'gen_analysis_env', name: 'gen_analysis_env', command: 'dftm gen_analysis_env', description: '生成 analysis 阶段分析环境' },
    { id: 'run_analysis', name: 'run_analysis', command: 'dftm run_analysis', description: '执行 design rule check 与 DFT 分析' },
    { id: 'gen_insert_env', name: 'gen_insert_env', command: 'dftm gen_insert_env', description: '生成 insert 阶段 MBIST 插入环境' },
    { id: 'run_insert', name: 'run_insert', command: 'dftm run_insert', description: '执行 wrapper generation 与 MBIST 插入' },
    { id: 'gen_build_env', name: 'gen_build_env', command: 'dftm gen_build_env', description: '生成 build 阶段环境' },
    { id: 'run_build', name: 'run_build', command: 'dftm run_build', description: '构建 post-MBIST RTL 与结构描述' },
    { id: 'gen_syn_env', name: 'gen_syn_env', command: 'dftm gen_syn_env', description: '生成 synthesis 综合环境' },
    { id: 'run_syn', name: 'run_syn', command: 'dftm run_syn', description: '执行 top-link check 与逻辑综合' },
    { id: 'gen_fml_env', name: 'gen_fml_env', command: 'dftm gen_fml_env', description: '生成 Formality 验证环境' },
    { id: 'run_fml', name: 'run_fml', command: 'dftm run_fml', description: '执行 Formality 形式等价性验证' },
    { id: 'gen_sim_env', name: 'gen_sim_env', command: 'dftm gen_sim_env', description: '生成仿真环境与 testbench' },
    { id: 'run_sim', name: 'run_sim', command: 'dftm run_sim', description: '运行 MBIST 并行/串行等多类型仿真' },
    { id: 'release', name: 'release', command: 'dftm release -version 0.1.0', description: '打包交付 release 介质及报告' },
  ],
  sailor: [
    { id: 'create_branch', name: 'create_branch', command: 'sailor branch -create feat_dft_scan', description: '创建或切换 feature 分支' },
    { id: 'gen_cfg', name: 'gen_cfg', command: 'sailor gen_cfg -spec norm_input.xlsx', description: '根据归一化表格生成 sailor cfg' },
    { id: 'user_hook_before_gen_dcg_env', name: 'user_hook_before_gen_dcg_env', command: 'run_flow_sailor hook --before gen_dcg_env', description: '执行 DCG 生成前置 ECO 钩子' },
    { id: 'gen_dcg_env', name: 'gen_dcg_env', command: 'sailor gen_dcg_env -cfg sailor.cfg', description: '生成 DCG 扫描链环境' },
    { id: 'user_hook_after_gen_cfg', name: 'user_hook_after_gen_cfg', command: 'run_flow_sailor hook --after gen_cfg', description: '执行生成后置 ECO 校验钩子' },
    { id: 'run_scan', name: 'run_scan', command: 'sailor run_scan -cfg sailor.cfg', description: '执行 scan 链插入与缝合' },
    { id: 'gen_analysis_env', name: 'gen_analysis_env', command: 'sailor gen_analysis_env -cfg sailor.cfg', description: '生成 scan 分析与 DRC 环境' },
    { id: 'run_analysis', name: 'run_analysis', command: 'sailor run_analysis -cfg sailor.cfg', description: '执行 scan 检查与 DRC 分析' },
    { id: 'commit_result', name: 'commit_result', command: 'sailor commit -files "cfg,scripts,reports"', description: '提交配置文件、脚本与报告' },
  ],
  verification: [
    { id: 'prepare_workspace', name: 'prepare_workspace', command: 'lander prepare_workspace --dir ./verify_run', description: '准备 verification workspace' },
    { id: 'load_config', name: 'load_config', command: 'lander load_config --file lander_verify.cfg', description: '加载 lander 配置' },
    { id: 'check_env', name: 'check_env', command: 'run_flow_lander check_env --tools', description: '检查仿真环境、filelist 和工具版本' },
    { id: 'submit_mode', name: 'submit_mode', command: 'lander submit_mode --mode scan_test', description: '提交仿真 mode 任务' },
    { id: 'collect_result', name: 'collect_result', command: 'lander collect_result --dir ./verify_run', description: '收集仿真结果' },
    { id: 'parse_report', name: 'parse_report', command: 'lander parse_report --out report.json', description: '解析 pass / fail / error 报告' },
    { id: 'publish_dashboard', name: 'publish_dashboard', command: 'lander publish_dashboard --server ide-board', description: '发布结果到 IDE 看板' },
  ]
};

function getYamlFileName(flowKey: PipelineFlowKey): string {
  if (flowKey === 'verification') return 'lander.yaml';
  return `${flowKey}.yaml`;
}

function getYamlPath(flowKey: PipelineFlowKey): string | undefined {
  const projectPath = resolveProjectPath(flowKey);
  if (projectPath) {
    const yamlPath = path.join(path.dirname(projectPath), ".dft-ide", "local-state", "pipelines", getYamlFileName(flowKey));
    if (fs.existsSync(yamlPath)) {
      return yamlPath;
    }
  }
  const root = path.resolve(__dirname, '../');
  if (!root) return undefined;
  return path.join(root, 'pipelines', getYamlFileName(flowKey));
}

function getDefaultYamlContent(flowKey: PipelineFlowKey): string {
  const flowLabel = flowKey === 'verification' ? 'Lander 仿真验证' : flowKey.toUpperCase();
  let content = `# DFT IDE ${flowLabel} 流水线配置文件\n`;
  content += `# 修改此文件可以自定义流水线的执行步骤和执行命令\n\n`;

  const tasks = DEFAULT_PIPELINE_TASKS[flowKey] || [];
  tasks.forEach((task) => {
    content += `- id: ${task.id}\n`;
    content += `  name: ${task.name}\n`;
    content += `  command: "${task.command}"\n`;
    content += `  description: ${task.description}\n\n`;
  });

  return content;
}

function loadPipelineConfig(flowKey: PipelineFlowKey): { tasks: PipelineTask[]; links: PipelineLink[] } {
  const yamlPath = getYamlPath(flowKey);
  const defaultTasks = (DEFAULT_PIPELINE_TASKS[flowKey] || []).map((t) => makeTask(t.id, t.name, t.command, t.description));

  const generateLinks = (tasks: PipelineTask[]) => {
    const links: PipelineLink[] = [];
    for (let i = 0; i < tasks.length - 1; i++) {
      links.push({ source: tasks[i].id, target: tasks[i + 1].id });
    }
    return links;
  };
  const defaultLinks = generateLinks(defaultTasks);

  if (!yamlPath) {
    return { tasks: defaultTasks, links: defaultLinks };
  }

  try {
    const dir = path.dirname(yamlPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(yamlPath)) {
      const defaultContent = getDefaultYamlContent(flowKey);
      fs.writeFileSync(yamlPath, defaultContent, 'utf-8');
      return { tasks: defaultTasks, links: defaultLinks };
    }

    const content = fs.readFileSync(yamlPath, 'utf-8');
    const parsedTasks = parseYamlTasks(content);

    if (parsedTasks.length === 0) {
      return { tasks: defaultTasks, links: defaultLinks };
    }

    const links = generateLinks(parsedTasks);
    return { tasks: parsedTasks, links };
  } catch (error) {
    console.error(`Error loading pipeline config for ${flowKey}:`, error);
    return { tasks: defaultTasks, links: defaultLinks };
  }
}
function makeTask(
  id: string,
  name: string,
  command: string,
  description: string,
  status: TaskStatus = 'pending',
): PipelineTask {
  return {
    id,
    name,
    command,
    status,
    attempts: 1,
    description,
  };
}

function createIdleRuntime(
  flowKey: PipelineFlowKey,
  moduleKey: string,
  flowLabel: string,
): PipelineRuntimeSnapshot {
  const config = pipelineFlowConfigs[flowKey];
  const { tasks, links } = loadPipelineConfig(flowKey);
  return {
    flowKey,
    moduleKey,
    flowLabel,
    tasks: tasks.map((t) => attachEcoRuntime({ ...t, status: 'pending' }, flowKey)),
    links,
    runState: 'idle',
    updatedAt: nowStamp(),
  };
}

function clearRuntimeTimers(key: string) {
  timers.get(key)?.forEach((timer) => clearTimeout(timer));
  timers.set(key, []);
}

function scheduleRuntime(key: string, delay: number, action: () => void) {
  const timer = setTimeout(action, delay);
  timers.set(key, [...(timers.get(key) ?? []), timer]);
}

export class PipelineRuntimeService {
  private runtimes = new Map<string, PipelineRuntimeSnapshot>();
  private executionSessions = new Map<string, PipelineExecutionSession>();
  private ecoExecutionSessions = new Map<string, PipelineEcoExecutionSession>();
  private runtimeContexts = new Map<string, PipelineRuntimeContext>();

  constructor(private readonly options: PipelineRuntimeServiceOptions) {}

  getRuntimes(): PipelineRuntimeSnapshot[] {
    return Array.from(this.runtimes.values());
  }

  ensureRuntime(flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string): PipelineRuntimeSnapshot {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const existing = this.runtimes.get(key);
    if (existing) {
      const next = { ...existing, flowLabel, updatedAt: nowStamp() };
      this.runtimes.set(key, next);
      this.options.onUpdate(next);
      return next;
    }

    const runtime = createIdleRuntime(flowKey, moduleKey, flowLabel);
    this.runtimes.set(key, runtime);
    this.options.onUpdate(runtime);
    return runtime;
  }

  startRuntime(
    flowKey: PipelineFlowKey,
    moduleKey: string,
    flowLabel: string,
    selectedTaskIds?: string[],
    cwd?: string,
    envConfig?: Record<string, unknown> | null,
    taskConfig?: Record<string, unknown> | null,
    selectedTasks?: Array<Pick<PipelineTask, 'id' | 'name' | 'command' | 'description'>>,
    runParameters?: unknown,
  ): PipelineRuntimeSnapshot {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    const runId = `exec_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const existing = this.runtimes.get(key);
    if (existing?.runState === 'running') {
      return existing;
    }
    this.runtimeContexts.set(key, { cwd, envConfig, taskConfig, runParameters });

    const projectRoot = resolveProjectRoot();
    if (projectRoot) {
      fs.mkdirSync(
        path.join(projectRoot, '.dft-ide', 'local-state', 'history', flowKey, runId),
        { recursive: true },
      );
    }

    clearRuntimeTimers(key);

    const loadedPipeline = loadPipelineConfig(flowKey);
    const parsedTasks = selectedTasks?.length
      ? selectedTasks.map((task) => ({
          ...task,
          ...makeTask(task.id, task.name, task.command, task.description),
        }))
      : loadedPipeline.tasks;
    const parsedLinks = selectedTasks?.length
      ? parsedTasks.slice(1).map((task, index) => ({ source: parsedTasks[index].id, target: task.id }))
      : loadedPipeline.links;
    const terminalCapabilities = getExecutionTerminalCapabilities();
    if (!terminalCapabilities.data) {
      const failedTasks = parsedTasks.map((task, index) => ({
        ...task,
        status: index === 0 ? 'failed' as TaskStatus : 'skipped' as TaskStatus,
        finishedAt: nowText(),
      }));
      const failedRuntime: PipelineRuntimeSnapshot = {
        runId,
        flowKey,
        moduleKey,
        flowLabel,
        tasks: failedTasks,
        links: parsedLinks,
        selectedTaskId: failedTasks[0]?.id,
        runState: 'failed',
        startedAt: nowStamp(),
        finishedAt: nowStamp(),
        updatedAt: nowStamp(),
      };
      this.runtimes.set(key, failedRuntime);
      this.notify(key);
      return failedRuntime;
    }

    const normalizedSelectedTaskIds = selectedTaskIds && selectedTaskIds.length > 0 ? selectedTaskIds : undefined;
    const initialTasks = parsedTasks.map((t, idx) => {
      const isSelected = !normalizedSelectedTaskIds || normalizedSelectedTaskIds.includes(t.id);
      const isFirstSelected = isSelected && (
        normalizedSelectedTaskIds
          ? t.id === normalizedSelectedTaskIds[0]
          : idx === 0
      );
      return {
        ...attachEcoRuntime(t, flowKey, envConfig),
        status: isSelected
          ? (isFirstSelected ? 'running' as TaskStatus : 'pending' as TaskStatus)
          : 'skipped' as TaskStatus,
        startedAt: isFirstSelected ? nowText() : undefined,
      };
    });

    const runtime: PipelineRuntimeSnapshot = {
      runId,
      flowKey,
      moduleKey,
      flowLabel,
      tasks: initialTasks,
      links: parsedLinks,
      selectedTaskId: initialTasks.find((t) => t.status === 'running')?.id || initialTasks[0]?.id,
      runState: 'running',
      startedAt: nowStamp(),
      updatedAt: nowStamp(),
    };
    this.runtimes.set(key, runtime);
    this.notify(key);

    const selectedTasksToRun = initialTasks.filter((t) => t.status !== 'skipped');
    const resolvedRunParameters = flowKey === 'verification'
      ? resolveVerificationRunParameters(runParameters, taskConfig)
      : runParameters;
    const executionPlan = selectedTasksToRun.flatMap((task, taskIndex) => {
      const parameterSets = flowKey === 'verification'
        ? getApplicableVerificationParameterSets(task, resolvedRunParameters)
        : [];
      const taskRuns: Array<Record<string, unknown> | undefined> = parameterSets.length > 0
        ? parameterSets
        : [undefined];
      return taskRuns.map((parameters, parameterIndex) => ({
        task,
        parameters,
        markerTaskId: `${task.id}__params_${parameterIndex + 1}`,
        isLastTaskRun: parameterIndex === taskRuns.length - 1,
        taskIndex,
        continueOnFailure: parameterSets.length > 0,
      }));
    });

    this.registerExecutionSession(key, {
      runId,
      flowKey,
      moduleKey,
      flowLabel,
      logPrefix: config.logPrefix,
      terminalTitle: getPipelineTerminalTitle(flowLabel, moduleKey),
      tasks: selectedTasksToRun,
      executionPlan,
      nextIndex: 0,
      cwd,
      envConfig,
      taskConfig,
      runParameters: resolvedRunParameters,
      shellPath: this.options.getPipelineShellPath?.() ?? 'csh',
      buffer: '',
      seenStarts: new Set<string>(),
      seenEnds: new Set<string>(),
      seenPhaseStarts: new Set<string>(),
      seenPhaseEnds: new Set<string>(),
      stopped: false,
    });
    this.startNextSessionTask(key);

    return runtime;
  }

  stopRuntime(flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string): void {
    this.ensureRuntime(flowKey, moduleKey, flowLabel);

    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    this.markRuntimeStopped(key, config.logPrefix, '已触发“停止全部”。', true);
  }

  selectTask(flowKey: PipelineFlowKey, moduleKey: string, taskId: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    this.updateRuntime(key, (runtime) => ({ ...runtime, selectedTaskId: taskId }));
  }

  stopTask(flowKey: PipelineFlowKey, moduleKey: string, taskId: string, flowLabel: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    this.markRuntimeStopped(key, pipelineFlowConfigs[flowKey].logPrefix, `任务 ${taskId} 已由用户手动停止。`, true);
  }

  rerunTask(flowKey: PipelineFlowKey, moduleKey: string, taskId: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    const runtime = this.runtimes.get(key);
    const task = runtime?.tasks.find((t) => t.id === taskId);

    this.patchTask(key, taskId, {
      status: 'running',
      startedAt: nowText(),
      finishedAt: undefined,
    });

    if (task && task.command.trim() && runtime) {
      const stepCommand = task.command.trim();
      let commands: string[] = [];
      commands.push(`echo "=== [DFT IDE] Rerun Step: ${task.name || task.id} ==="`);
      commands.push(flowKey === 'verification'
        ? stepCommand
        : buildPipelineStepExecutionCommand(resolveProjectPath(flowKey), stepCommand));
      this.options.openTerminal(getPipelineTerminalTitle(runtime.flowLabel, moduleKey), commands);
    }

    scheduleRuntime(key, 1200, () => {
      this.patchTask(key, taskId, {
        status: 'success',
        finishedAt: nowText(),
        duration: '1.2s',
      });
    });
  }

  runTaskEcoHook(
    flowKey: PipelineFlowKey,
    moduleKey: string,
    taskId: string,
    phase: PipelineEcoPhase,
    envConfig?: Record<string, unknown> | null,
    taskConfig?: Record<string, unknown> | null,
    runParameters?: unknown,
    cwd?: string,
    stepStatus = 0,
  ): PipelineRuntimeSnapshot {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const previousContext = this.runtimeContexts.get(key);
    envConfig ??= previousContext?.envConfig;
    taskConfig ??= previousContext?.taskConfig;
    runParameters ??= previousContext?.runParameters;
    cwd ??= previousContext?.cwd;
    const runtime = this.runtimes.get(key);
    if (!runtime) {
      throw new Error('流水线运行态不存在，请先加载流水线。');
    }
    if (runtime.runState === 'running') {
      throw new Error('流水线正在运行，不能并行调试 ECO。请先停止或等待流水线结束。');
    }
    if (this.ecoExecutionSessions.has(key)) {
      throw new Error('当前模块已有 ECO Hook 正在运行。');
    }

    const originalTask = runtime.tasks.find((item) => item.id === taskId);
    if (!originalTask) {
      throw new Error(`找不到流水线 Step: ${taskId}`);
    }
    const task = attachEcoRuntime(originalTask, flowKey, envConfig);
    const hook = task.eco?.[phase];
    if (!hook) {
      throw new Error(`Step ${taskId} 缺少 ${phase} ECO 执行阶段。`);
    }

    const runId = `eco_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const terminalTitle = `${runtime.flowLabel} / ${moduleKey} / ECO`;
    const commands = this.buildEcoHookCommands(
      runId,
      task,
      phase,
      flowKey,
      moduleKey,
      envConfig,
      taskConfig,
      runParameters,
      stepStatus,
    );
    const session: PipelineEcoExecutionSession = {
      runId,
      taskId,
      phase,
      terminalTitle,
      buffer: '',
    };
    session.monitor = registerExecutionTerminalMonitor(terminalTitle, {
      onData: (data) => this.handleEcoTerminalData(key, data),
      onClose: () => this.finishManualEcoHook(key, 'stopped'),
    });
    this.ecoExecutionSessions.set(key, session);
    this.patchTask(key, taskId, {
      eco: {
        ...task.eco!,
        [phase]: {
          ...hook,
          status: 'running',
          attempts: hook.attempts + 1,
          startedAt: nowText(),
          finishedAt: undefined,
          exitCode: undefined,
          lastRunSource: 'manual',
        },
      },
    });

    void Promise.resolve(
      this.options.openTerminal(
        terminalTitle,
        commands,
        cwd,
        this.options.getPipelineShellPath?.() ?? 'csh',
      ),
    ).catch(() => {
      this.finishManualEcoHook(key, 'failed', -1);
    });
    return this.runtimes.get(key)!;
  }

  stopTaskEcoHook(flowKey: PipelineFlowKey, moduleKey: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const session = this.ecoExecutionSessions.get(key);
    if (!session) return;
    stopExecutionTerminal(session.terminalTitle);
    this.finishManualEcoHook(key, 'stopped', 130);
  }

  private buildEcoHookCommands(
    runId: string,
    task: PipelineTask,
    phase: PipelineEcoPhase,
    flowKey: PipelineFlowKey,
    moduleKey: string,
    envConfig?: Record<string, unknown> | null,
    taskConfig?: Record<string, unknown> | null,
    runParameters?: unknown,
    stepStatus = 0,
  ): string[] {
    const commands: string[] = [
      `setenv DFT_IDE_HISTORY ${quoteCshArgument(runId)}`,
      `setenv DFT_IDE_MARKER_TASK_ID ${quoteCshArgument(task.id)}`,
    ];
    const [oriModuleKey, version] = getVersionFromModuleName(moduleKey);
    if (version) {
      commands.push(`setenv DFT_IDE_MODULE_ORI ${quoteCshArgument(oriModuleKey)}`);
      commands.push(`setenv DFT_IDE_VERSION ${quoteCshArgument(version)}`);
    }
    commands.push(`setenv ${flowKey === 'verification' ? 'DFT_IDE_MODE' : 'DFT_IDE_MODULE'} ${quoteCshArgument(moduleKey)}`);
    const projectPath = resolveProjectPath(flowKey);
    if (projectPath) {
      commands.push(`setenv DFT_IDE_WORK_PATH ${quoteCshArgument(projectPath)}`);
    }
    const stage = flowKey === 'verification' ? firstNonEmptyString(envConfig?.stage) : '';
    if (stage) {
      commands.push(`setenv DFT_IDE_STAGE ${quoteCshArgument(stage)}`);
    }

    const source = taskConfig?.step2 as Record<string, unknown> | undefined;
    const customConfig = source?.step2Task as Record<string, unknown> | undefined;
    const parameterRow = Array.isArray(runParameters) && runParameters[0] && typeof runParameters[0] === 'object'
      ? runParameters[0] as Record<string, unknown>
      : undefined;
    if (customConfig) {
      appendToolCommands(commands, mergeToolConfigs(customConfig.tools, parameterRow?.tools));
      const parameterDonau = parameterRow?.donau && typeof parameterRow.donau === 'object'
        ? parameterRow.donau as Record<string, unknown>
        : undefined;
      const clusterGroup = firstNonEmptyString(parameterDonau?.group, customConfig.clusterGroup);
      const clusterQueue = firstNonEmptyString(parameterDonau?.queue, customConfig.clusterQueue);
      const cpu = firstNonEmptyString(parameterDonau?.cpu, customConfig.cpu);
      const memory = firstNonEmptyString(parameterDonau?.mem, customConfig.memory);
      const clusterExtra = firstNonEmptyString(customConfig.clusterExtra);
      if (clusterGroup) {
        commands.push(`setenv DONAU_GROUP ${quoteCshArgument(clusterGroup)}`);
        const queue = clusterQueue ? `-q ${clusterQueue}` : '';
        const resources = [
          cpu ? `cpu=${cpu}` : '',
          memory ? `mem=${memory}` : '',
        ].filter(Boolean);
        const resource = resources.length ? `-R '${resources.join(';')}'` : '';
        const dsubArgs = ['-A', clusterGroup, queue, resource, clusterExtra].filter(Boolean).join(' ');
        commands.push(`setenv DFT_IDE_DSUBRUN_I ${quoteCshArgument(`dsub -I ${dsubArgs}`)}`);
      }
    }
    if (flowKey === 'verification') {
      appendVerificationParameterCommands(commands, task, runParameters);
    }

    const scriptName = getRunFlowScriptName(task.command);
    if (!scriptName) {
      throw new Error(`Step ${task.id} 不是 run_flow 命令，无法运行 ECO。`);
    }
    const scriptPath = resolvePipelineScriptPath(projectPath, scriptName);
    const stepName = getRunFlowStepName(task);
    commands.push(`echo "=== [DFT IDE] ${phase === 'before' ? 'Before' : 'After'} ECO: ${task.name || task.id} ==="`);
    commands.push(`echo "__DFT_IDE_ECO_START__|${runId}|${task.id}|${phase}"`);
    commands.push('set dft_ide_eco_status = 0');
    commands.push(
      `ma ${PIPELINE_PYTHON_MODULE} && python3 ${quoteCshArgument(scriptPath)} run --eco-phase ${phase} --step-status ${Math.trunc(stepStatus)} ${quoteCshArgument(stepName)}`,
    );
    commands.push('set dft_ide_eco_status = $status');
    commands.push(`echo "__DFT_IDE_ECO_END__|${runId}|${task.id}|${phase}|$dft_ide_eco_status"`);
    return commands;
  }

  private registerExecutionSession(key: string, session: PipelineExecutionSession): void {
    this.disposeExecutionSession(key);
    const monitor = registerExecutionTerminalMonitor(session.terminalTitle, {
      onData: (data) => this.handleTerminalData(key, data),
      onShellEnd: (exitCode) => this.handleTerminalShellEnd(key, exitCode),
      onClose: () => this.markRuntimeStopped(key, session.logPrefix, 'Terminal 已关闭，流水线已停止。', false),
    });
    session.monitor = monitor;
    this.executionSessions.set(key, session);
  }

  private disposeExecutionSession(key: string): void {
    const session = this.executionSessions.get(key);
    session?.monitor?.dispose();
    this.executionSessions.delete(key);
  }

  private startNextSessionTask(key: string): void {
    const session = this.executionSessions.get(key);
    if (!session || session.stopped) {
      return;
    }

    if (session.nextIndex >= session.executionPlan.length) {
      this.completeRuntime(key, session.logPrefix);
      return;
    }

    const index = session.nextIndex;
    const execution = session.executionPlan[index];
    const task = execution.task;
    session.nextIndex += 1;
    session.currentTaskId = task.id;
    session.currentMarkerTaskId = execution.markerTaskId;

    if (!task.command.trim()) {
      this.patchTask(key, task.id, {
        status: execution.isLastTaskRun ? 'success' : 'running',
        startedAt: nowText(),
        finishedAt: nowText(),
      });
      this.startNextSessionTask(key);
      return;
    }

    this.patchTask(key, task.id, (current) => ({
      status: current.status === 'failed' ? current.status : 'running',
      startedAt: nowText(),
      finishedAt: undefined,
    }));

    const commands = buildStepCommands(
      session.runId,
      task,
      execution.taskIndex,
      session.flowKey,
      session.moduleKey,
      session.envConfig,
      session.taskConfig,
      execution.parameters ? [execution.parameters] : session.runParameters,
      execution.markerTaskId,
    );
    const generatedCommands = session.flowKey === 'verification'
      ? buildVerificationExecutionCommands(resolveProjectPath(session.flowKey), task)
      : [buildPipelineStepExecutionCommand(resolveProjectPath(session.flowKey), task.command.trim())];
    const runParameterRows = execution.parameters ? [execution.parameters] : [];
    console.group(`[DFT IDE] Pipeline Task: ${session.flowLabel} / ${session.moduleKey} / ${task.name} / ${execution.markerTaskId}`);
    console.log('commands:', generatedCommands);
    console.log('groups:', runParameterRows.map((row) => row.groupNames ?? []));
    console.log('tcs:', runParameterRows.map((row) => row.tcNames ?? []));
    console.log('subattrs:', runParameterRows.map((row) => row.subattrNames ?? []));
    console.log('tools:', runParameterRows.map((row) => row.tools ?? []));
    console.log('Donau:', runParameterRows.map((row) => row.donau ?? {}));
    console.log('parameter rows:', runParameterRows);
    console.groupEnd();
    this.patchTask(key, task.id, (current) => ({
    }));
    void Promise.resolve(
      this.options.openTerminal(session.terminalTitle, commands, session.cwd, session.shellPath),
    ).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.finishRuntimeWithFailure(key, session.logPrefix, task.id, -1, `Terminal 启动失败：${message}`);
    });
  }

  private handleTerminalData(key: string, data: string): void {
    const session = this.executionSessions.get(key);
    if (!session || session.stopped) {
      return;
    }

    if (isInterruptOutput(data)) {
      this.markRuntimeStopped(key, session.logPrefix, 'Terminal 收到 Ctrl+C，中断已同步到流水线。', false);
      return;
    }

    session.buffer = stripAnsi(`${session.buffer}${data}`).slice(-30000);

    const startRegex = /__DFT_IDE_STEP_START__\|([^|\s]+)\|([^|\r\n]+)/g;
    for (const match of session.buffer.matchAll(startRegex)) {
      const [, runId, taskId] = match;
      if (runId !== session.runId || session.seenStarts.has(taskId)) {
        continue;
      }
      session.seenStarts.add(taskId);
      const execution = session.executionPlan.find((item) => item.markerTaskId === taskId);
      const runtimeTaskId = execution?.task.id ?? taskId;
      this.patchTask(key, runtimeTaskId, (task) => ({
        status: task.status === 'success' || task.status === 'failed' ? task.status : 'running',
        startedAt: task.startedAt ?? nowText(),
      }));
    }

    const endRegex = /__DFT_IDE_STEP_END__\|([^|\s]+)\|([^|\r\n]+)\|(-?\d+)/g;
    for (const match of session.buffer.matchAll(endRegex)) {
      const [, runId, taskId, exitCodeText] = match;
      if (runId !== session.runId || session.seenEnds.has(taskId)) {
        continue;
      }
      session.seenEnds.add(taskId);
      this.handleStepEnd(key, taskId, Number(exitCodeText));
    }

    const phaseStartRegex = /__DFT_IDE_ECO_START__\|([^|\s]+)\|([^|\r\n]+)\|(before|after)/g;
    for (const match of session.buffer.matchAll(phaseStartRegex)) {
      const [, runId, markerTaskId, phaseText] = match;
      const markerKey = `${markerTaskId}:${phaseText}`;
      if (runId !== session.runId || session.seenPhaseStarts.has(markerKey)) continue;
      session.seenPhaseStarts.add(markerKey);
      const execution = session.executionPlan.find((item) => item.markerTaskId === markerTaskId);
      const runtimeTaskId = execution?.task.id ?? markerTaskId;
      this.patchEcoHook(key, runtimeTaskId, phaseText as PipelineEcoPhase, (hook) => ({
        ...hook,
        status: 'running',
        attempts: hook.attempts + 1,
        startedAt: nowText(),
        finishedAt: undefined,
        exitCode: undefined,
        lastRunSource: 'pipeline',
      }));
    }

    const phaseEndRegex = /__DFT_IDE_ECO_END__\|([^|\s]+)\|([^|\r\n]+)\|(before|after)\|(-?\d+)/g;
    for (const match of session.buffer.matchAll(phaseEndRegex)) {
      const [, runId, markerTaskId, phaseText, exitCodeText] = match;
      const markerKey = `${markerTaskId}:${phaseText}`;
      if (runId !== session.runId || session.seenPhaseEnds.has(markerKey)) continue;
      session.seenPhaseEnds.add(markerKey);
      const execution = session.executionPlan.find((item) => item.markerTaskId === markerTaskId);
      const runtimeTaskId = execution?.task.id ?? markerTaskId;
      const exitCode = Number(exitCodeText);
      this.patchEcoHook(key, runtimeTaskId, phaseText as PipelineEcoPhase, (hook) => ({
        ...hook,
        status: exitCode === 0 ? (hook.status === 'failed' ? 'failed' : 'success') : 'failed',
        finishedAt: nowText(),
        exitCode,
        lastRunSource: 'pipeline',
      }));
    }
  }

  private handleEcoTerminalData(key: string, data: string): void {
    const session = this.ecoExecutionSessions.get(key);
    if (!session) return;
    if (isInterruptOutput(data)) {
      this.finishManualEcoHook(key, 'stopped', 130);
      return;
    }
    session.buffer = stripAnsi(`${session.buffer}${data}`).slice(-30000);
    const endRegex = /__DFT_IDE_ECO_END__\|([^|\s]+)\|([^|\r\n]+)\|(before|after)\|(-?\d+)/g;
    for (const match of session.buffer.matchAll(endRegex)) {
      const [, runId, taskId, phaseText, exitCodeText] = match;
      if (runId !== session.runId || taskId !== session.taskId || phaseText !== session.phase) continue;
      const exitCode = Number(exitCodeText);
      this.finishManualEcoHook(key, exitCode === 0 ? 'success' : 'failed', exitCode);
      return;
    }
  }

  private finishManualEcoHook(
    key: string,
    status: Extract<TaskStatus, 'success' | 'failed' | 'stopped'>,
    exitCode?: number,
  ): void {
    const session = this.ecoExecutionSessions.get(key);
    if (!session) return;
    session.monitor?.dispose();
    this.ecoExecutionSessions.delete(key);
    this.patchEcoHook(key, session.taskId, session.phase, (hook) => ({
      ...hook,
      status,
      finishedAt: nowText(),
      exitCode,
      lastRunSource: 'manual',
    }));
  }

  private handleTerminalShellEnd(key: string, exitCode: number | undefined): void {
    const session = this.executionSessions.get(key);
    if (!session || session.stopped || exitCode === undefined) {
      return;
    }

    if (exitCode === 130 || exitCode === 143) {
      this.markRuntimeStopped(key, session.logPrefix, 'Terminal 收到 Ctrl+C，中断已同步到流水线。', false);
    }
  }

  private handleStepEnd(key: string, taskId: string, exitCode: number): void {
    const session = this.executionSessions.get(key);
    if (!session || session.stopped) {
      return;
    }

    const execution = session.executionPlan.find((item) => item.markerTaskId === taskId);
    const task = execution?.task ?? session.tasks.find((item) => item.id === taskId);
    const runtimeTaskId = task?.id ?? taskId;
    if (exitCode === 0) {
      this.patchTask(key, runtimeTaskId, (current) => ({
        status: current.status === 'stopped' || current.status === 'failed'
          ? current.status
          : execution?.isLastTaskRun ? 'success' : 'running',
        finishedAt: execution?.isLastTaskRun || current.status === 'failed' ? nowText() : undefined,
      }));
      this.startNextSessionTask(key);
      return;
    }

    if (exitCode === 130 || exitCode === 143) {
      this.markRuntimeStopped(key, session.logPrefix, `${task?.name ?? taskId} 被中断。`, false);
      return;
    }

    if (execution?.continueOnFailure) {
      this.patchTask(key, runtimeTaskId, (current) => ({
        status: 'failed',
        finishedAt: execution.isLastTaskRun ? nowText() : undefined,
      }));
      this.startNextSessionTask(key);
      return;
    }

    this.finishRuntimeWithFailure(key, session.logPrefix, runtimeTaskId, exitCode);
  }

  private finishRuntimeWithFailure(
    key: string,
    logPrefix: string,
    taskId: string,
    exitCode: number,
    message?: string,
  ): void {
    clearRuntimeTimers(key);
    this.disposeExecutionSession(key);
    if (message) {
    }
    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      runState: 'failed',
      finishedAt: nowStamp(),
      tasks: runtime.tasks.map((task) => {
        if (task.id === taskId) {
          return {
            ...task,
            status: 'failed',
            finishedAt: nowText(),
          };
        }
        if (task.status === 'pending') {
          return {
            ...task,
            status: 'skipped',
            finishedAt: nowText(),
          };
        }
        return task;
      }),
    }));
  }

  private completeRuntime(key: string, logPrefix: string): void {
    clearRuntimeTimers(key);
    this.disposeExecutionSession(key);
    this.updateRuntime(key, (runtime) => {
      const hasFailedTask = runtime.tasks.some((task) => task.status === 'failed');
      return {
        ...runtime,
        runState: hasFailedTask ? 'failed' : 'completed',
        finishedAt: nowStamp(),
      };
    });
  }

  private markRuntimeStopped(key: string, logPrefix: string, reason: string, sendInterrupt: boolean): void {
    const runtime = this.runtimes.get(key);
    if (!runtime || runtime.runState === 'completed' || runtime.runState === 'failed' || runtime.runState === 'stopped') {
      return;
    }

    const session = this.executionSessions.get(key);
    if (session) {
      session.stopped = true;
    }

    clearRuntimeTimers(key);
    if (sendInterrupt) {
      stopExecutionTerminal(session?.terminalTitle ?? getPipelineTerminalTitle(runtime.flowLabel, runtime.moduleKey));
    }
    this.disposeExecutionSession(key);

    this.updateRuntime(key, (current) => ({
      ...current,
      runState: 'stopped',
      finishedAt: nowStamp(),
      tasks: current.tasks.map((task) => {
        if (task.status === 'running') {
          return {
            ...task,
            status: 'stopped',
            finishedAt: nowText(),
          };
        }
        if (task.status === 'pending') {
          return {
            ...task,
            status: 'skipped',
            finishedAt: nowText(),
          };
        }
        return task;
      }),
    }));
  }
  private patchTask(
    key: string,
    id: string,
    patch: Partial<PipelineTask> | ((task: PipelineTask) => Partial<PipelineTask>),
  ): void {
    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      tasks: runtime.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        const nextPatch = typeof patch === 'function' ? patch(task) : patch;
        return {
          ...task,
          ...nextPatch,
        };
      }),
    }));
  }

  private patchEcoHook(
    key: string,
    taskId: string,
    phase: PipelineEcoPhase,
    patch: (hook: PipelineEcoHook) => PipelineEcoHook,
  ): void {
    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      tasks: runtime.tasks.map((task) => {
        if (task.id !== taskId || !task.eco) return task;
        return {
          ...task,
          eco: {
            ...task.eco,
            [phase]: patch(task.eco[phase]),
          },
        };
      }),
    }));
  }

  private updateRuntime(
    key: string,
    updater: (runtime: PipelineRuntimeSnapshot) => PipelineRuntimeSnapshot,
  ): void {
    const current = this.runtimes.get(key);
    if (!current) {
      return;
    }

    const next = { ...updater(current), updatedAt: nowStamp() };
    this.runtimes.set(key, next);
    this.notify(key);
  }

  private notify(key: string): void {
    const runtime = this.runtimes.get(key);
    if (!runtime) {
      return;
    }

    this.options.onUpdate(runtime);
    this.maybeSaveHistory(runtime);
  }

  private maybeSaveHistory(runtime: PipelineRuntimeSnapshot): void {
    if (!runtime.runId || runtime.tasks.length === 0) {
      return;
    }
    const failed = runtime.tasks.some((task) => task.status === 'failed');
    const status = runtime.runState === 'stopped'
      ? 'cancelled'
      : runtime.runState === 'running'
        ? 'running'
      : failed
        ? 'error'
        : 'success';

    const { tasks, ...historySnapshot } = runtime;
    const historyTasks = tasks.map((task) => ({ ...task }));
    this.options.onHistory({
      flow: runtime.flowKey,
      flowKey: runtime.flowKey,
      moduleKey: runtime.moduleKey,
      flowLabel: runtime.flowLabel,
      status,
      runtimeSnapshot: {
        ...historySnapshot,
        tasks: historyTasks,
      },
    });
  }
}
