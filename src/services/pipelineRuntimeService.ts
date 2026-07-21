import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  PipelineLink,
  PipelineTask,
  TaskStatus,
  pipelineFlowConfigs,
} from '../webview/components/shared/pipelineMockData';
import { resolveProjectPath } from './workspaceService';
import { getExecutionTerminalCapabilities, registerExecutionTerminalMonitor, stopExecutionTerminal } from './terminalService';

export type PipelineFlowKey = 'hibist' | 'sailor' | 'verification';
export type PipelineRunState = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface PipelineRuntimeSnapshot {
  runId?: string;
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  tasks: PipelineTask[];
  links: PipelineLink[];
  logs: string[];
  selectedTaskId?: string;
  runState: PipelineRunState;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
}

export interface PipelineRuntimeHistoryRecord {
  flow: string;
  flowKey: PipelineFlowKey;
  moduleKey: string;
  flowLabel: string;
  status: 'success' | 'error' | 'cancelled';
  logs: string[];
  runtimeSnapshot: PipelineRuntimeSnapshot;
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
  nextIndex: number;
  cwd?: string;
  envConfig?: Record<string, unknown> | null;
  taskConfig?: Record<string, unknown> | null;
  runParameters?: unknown;
  shellPath?: string;
  currentTaskId?: string;
  buffer: string;
  seenStarts: Set<string>;
  seenEnds: Set<string>;
  monitor?: vscode.Disposable;
  stopped: boolean;
}

const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
const historySavedRunIds = new Set<string>();

const nowText = () => new Date().toLocaleTimeString();
const nowStamp = () => Date.now();

function getPipelineTerminalTitle(flowLabel: string, moduleKey: string): string {
  return `${flowLabel} / ${moduleKey}`;
}

const PIPELINE_PYTHON_MODULE = 'python/3.10.6';
const DEFAULT_DONAU_GROUP = 'ug_dft.HIS-HIS-ASIC-HISC-DFT-PLAT-WS';
const DEFAULT_DONAU_QUEUE = 'normal';

function quoteCshArgument(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
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
      commands.push(`setenv PATH "\${PATH}:${tool.path.replace(/(["\\`])/g, '\\$1')}"`);
    }
  }
}

function buildPipelineStepExecutionCommand(projectPath: string | undefined, stepCommand: string): string {
  let scriptPath = '';
  const scriptName = stepCommand.split(' ')[0];
  if (projectPath) {
    scriptPath = path.join(path.dirname(projectPath), ".dft-ide", "local-state", "scripts", scriptName);
  }
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    scriptPath = path.resolve(__dirname, '../scripts', scriptName);
  }
  const stepArguments = stepCommand.substring(scriptName.length).trim();
  const argumentsSuffix = stepArguments ? ` ${stepArguments}` : '';
  return `ma ${PIPELINE_PYTHON_MODULE} && python3 ${quoteCshArgument(scriptPath)}${argumentsSuffix}`;
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
function buildStepCommands(
  runId: string,
  task: PipelineTask,
  index: number,
  flowKey: PipelineFlowKey,
  moduleKey: string,
  envConfig?: Record<string, unknown> | null,
  taskConfig?: Record<string, unknown> | null,
): string | string[] {
  const commands: string[] = [];
  const projectPath = resolveProjectPath(flowKey);

  if (index === 0) {
    const projectSource = typeof envConfig?.project === 'string' ? envConfig.project.trim() : '';
    if (projectSource) {
      commands.push(`source ${projectSource}`);
    }

    commands.push(`setenv module "${moduleKey}"`);
    if (projectPath) {
      commands.push(`setenv project_path "${projectPath}"`);
    }

    const source = taskConfig?.step2 as Record<string, unknown> | undefined;
    const customConfig = source?.step2Task as Record<string, unknown> | undefined;
    if (customConfig) {
      appendToolCommands(commands, customConfig.tools);

      const clusterGroup = String(customConfig.clusterGroup ?? '').trim();
      const clusterQueue = String(customConfig.clusterQueue ?? '').trim();
      const cpu = String(customConfig.cpu ?? '').trim();
      const memory = String(customConfig.memory ?? '').trim();
      const clusterExtra = String(customConfig.clusterExtra ?? '').trim();
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
        const dsub = `dsub -I -A ${clusterGroup} ${queue} ${resource} ${clusterExtra}`;
        commands.push(`alias dsubrun_I "${dsub}"`);
      }
    }
  }

  const stepCommand = task.command.trim();
  const executionCommand = flowKey === 'verification'
    ? stepCommand
    : buildPipelineStepExecutionCommand(projectPath, stepCommand);
  commands.push(`echo "__DFT_IDE_STEP_START__|${runId}|${task.id}"`);
  commands.push(`echo "=== [DFT IDE] Step: ${task.name || task.id} ==="`);
  commands.push(`echo ${quoteCshArgument(`[DFT IDE] 执行命令: ${executionCommand}`)}`);
  commands.push(executionCommand);
  commands.push('set dft_ide_step_status = $status');
  commands.push(`echo "${buildStepEndMarker(runId, task.id)}$dft_ide_step_status"`);

  if (projectPath) {
    const targetDir = path.join(path.dirname(projectPath), ".dft-ide", "local-state", "run_flow", flowKey, moduleKey);
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, task.name);
    const scriptContent = commands.map(cmd => cmd.trim()).join('\n');
    fs.writeFileSync(targetFile, `#!/bin/csh -f\n${scriptContent}\n`);
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
          logs: [],
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
      logs: [],
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

function runSequentialSimulation(
  key: string,
  tasks: PipelineTask[],
  logPrefix: string,
  flowLabel: string,
  flowKey: string,
  moduleKey: string,
  cwd: string | undefined,
  envConfig: Record<string, unknown> | null | undefined,
  taskConfig: Record<string, unknown> | null | undefined,
  openTerminal: (title: string, command: string | string[], cwd?: string) => void,
  patchTask: (id: string, patch: Partial<PipelineTask> | ((task: PipelineTask) => Partial<PipelineTask>)) => void,
  appendLog: (msg: string) => void,
  setRunState: (state: PipelineRunState) => void,
) {
  let delay = 500;
  tasks.forEach((task, index) => {
    // 1. Schedule Task Start
    scheduleRuntime(key, delay, () => {
      patchTask(task.id, {
        status: 'running',
        startedAt: nowText(),
      });
      const stepCommand = task.command.trim();
      if (stepCommand) {
        const projectPath = resolveProjectPath(flowKey);
        let commands: string[] = [];
        if (index === 0) {
          // a. 加载环境配置
          if (envConfig) {
            commands.push(`source ${envConfig.project}`);
          }
          // b. 设置环境变量
          // 模块名称
          commands.push(`setenv module "${moduleKey}"`);
          // 项目路径
          if (projectPath) {
            commands.push(`setenv project_path "${projectPath}"`);
          }
          // setenv STAGE DFT
          // setenv DIE CDIE
          // setenv GRP xxx
          // setenv TC xxx
          // c. 自定义配置
          const source = taskConfig?.step2 as Record<string, unknown> | undefined;
          const customConfig = source?.step2Task as Record<string, unknown> | undefined;
          if(customConfig){
            // 工具版本
            appendToolCommands(commands, customConfig.tools);
            // 集群
            const clusterGroup = String(customConfig.clusterGroup ?? "").trim();
            const clusterQueue = String(customConfig.clusterQueue ?? "").trim();
            const cpu = String(customConfig.cpu ?? "").trim();
            const memory = String(customConfig.memory ?? "").trim();
            const clusterExtra = String(customConfig.clusterExtra ?? "").trim();
            if (clusterGroup) {
              commands.push(`setenv DONAU_GROUP "${clusterGroup}"`);
              let queue = '';
              let resource = '';
              if (clusterQueue) {
                queue = `-q ${clusterQueue}`;
              }
              if (cpu || memory) {
                let arr: string[] = [];
                if (cpu) {
                  arr.push(`cpu=${cpu}`);
                }
                if (memory) {
                  arr.push(`mem=${memory}`);
                }
                resource = `-R '${arr.join(';')}'`;
              }
              const dsub = `dsub -I -A ${clusterGroup} ${queue} ${resource} ${clusterExtra}`;
              commands.push(`alias dsubrun_I "${dsub}"`);
            }
          }
        }
        commands.push(`echo "=== [DFT IDE] Step: ${task.name || task.id} ==="`);
        // d. 步骤命令
        commands.push(flowKey === 'verification'
          ? stepCommand
          : buildPipelineStepExecutionCommand(projectPath, stepCommand));

        openTerminal(getPipelineTerminalTitle(flowLabel, moduleKey), commands, cwd);
      }
      appendLog(`${logPrefix} ${task.name} 运行启动。`);
    });

    delay += 1500;

    // 2. Schedule Task End
    scheduleRuntime(key, delay, () => {
      patchTask(task.id, {
        status: 'success',
        finishedAt: nowText(),
        duration: '1.2s',
        logs: [`[${nowText()}] ${logPrefix} ${task.name} 执行完成。`],
      });
      appendLog(`${logPrefix} ${task.name} 执行成功。`);

      // If it's the last task, complete the run
      if (index === tasks.length - 1) {
        setRunState('completed');
        appendLog(`${logPrefix} 流水线执行成功。`);
      }
    });

    delay += 500;
  });
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
    logs: [],
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
    tasks: tasks.map((t) => ({ ...t, status: 'pending' })),
    links,
    logs: [`流水线运行态已就绪，点击“启动流水线”开始接收 ${config.title} 事件流。`],
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
    const runId = `pipeline_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const existing = this.runtimes.get(key);
    if (existing?.runState === 'running') {
      this.appendLog(key, config.logPrefix, '已有流水线正在运行，请先停止当前运行后再启动。');
      return existing;
    }

    clearRuntimeTimers(key);

    const loadedPipeline = loadPipelineConfig(flowKey);
    const parsedTasks = selectedTasks?.length
      ? selectedTasks.map((task) => makeTask(task.id, task.name, task.command, task.description))
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
        logs: index === 0
          ? [`[${nowText()}] ${config.logPrefix} 当前 VS Code 环境不支持 terminalDataWriteEvent，无法可靠监控流水线步骤。`]
          : [`[${nowText()}] ${config.logPrefix} 因 terminal 监控能力不可用跳过。`],
      }));
      const failedRuntime: PipelineRuntimeSnapshot = {
        runId,
        flowKey,
        moduleKey,
        flowLabel,
        tasks: failedTasks,
        links: parsedLinks,
        logs: [`[${nowText()}] ${config.logPrefix} 当前 VS Code 环境不支持 terminalDataWriteEvent，流水线未启动。`],
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
        ...t,
        status: isSelected
          ? (isFirstSelected ? 'running' as TaskStatus : 'pending' as TaskStatus)
          : 'skipped' as TaskStatus,
        startedAt: isFirstSelected ? nowText() : undefined,
        logs: isSelected
          ? [`[${nowText()}] ${config.logPrefix} ${t.name} 已创建，初始状态：${isFirstSelected ? 'running' : 'pending'}。`]
          : [`[${nowText()}] ${config.logPrefix} ${t.name} 已跳过。`],
      };
    });

    const runtime: PipelineRuntimeSnapshot = {
      runId,
      flowKey,
      moduleKey,
      flowLabel,
      tasks: initialTasks,
      links: parsedLinks,
      logs: [`[${nowText()}] ${config.logPrefix} 流水线已启动。`],
      selectedTaskId: initialTasks.find((t) => t.status === 'running')?.id || initialTasks[0]?.id,
      runState: 'running',
      startedAt: nowStamp(),
      updatedAt: nowStamp(),
    };
    this.runtimes.set(key, runtime);
    this.notify(key);

    const selectedTasksToRun = initialTasks.filter((t) => t.status !== 'skipped');

    this.registerExecutionSession(key, {
      runId,
      flowKey,
      moduleKey,
      flowLabel,
      logPrefix: config.logPrefix,
      terminalTitle: getPipelineTerminalTitle(flowLabel, moduleKey),
      tasks: selectedTasksToRun,
      nextIndex: 0,
      cwd,
      envConfig,
      taskConfig,
      runParameters: flowKey === 'verification'
        ? resolveVerificationRunParameters(runParameters, taskConfig)
        : runParameters,
      shellPath: this.options.getPipelineShellPath?.() ?? 'csh',
      buffer: '',
      seenStarts: new Set<string>(),
      seenEnds: new Set<string>(),
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
    this.appendLog(key, config.logPrefix, `手动重跑任务 ${taskId}...`);

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
      this.appendLog(key, config.logPrefix, `任务 ${taskId} 重跑成功。`);
    });
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

    if (session.nextIndex >= session.tasks.length) {
      this.completeRuntime(key, session.logPrefix);
      return;
    }

    const index = session.nextIndex;
    const task = session.tasks[index];
    session.nextIndex += 1;
    session.currentTaskId = task.id;

    if (!task.command.trim()) {
      this.patchTask(key, task.id, {
        status: 'success',
        startedAt: nowText(),
        finishedAt: nowText(),
        logs: [`[${nowText()}] ${session.logPrefix} ${task.name} 无执行命令，已跳过。`],
      });
      this.startNextSessionTask(key);
      return;
    }

    this.patchTask(key, task.id, {
      status: 'running',
      startedAt: nowText(),
      finishedAt: undefined,
    });
    this.appendLog(key, session.logPrefix, `${task.name} 运行启动。`);

    const commands = buildStepCommands(
      session.runId,
      task,
      index,
      session.flowKey,
      session.moduleKey,
      session.envConfig,
      session.taskConfig,
    );
    const generatedCommand = session.flowKey === 'verification'
      ? task.command.trim()
      : buildPipelineStepExecutionCommand(resolveProjectPath(session.flowKey), task.command.trim());
    const runParameterRows = Array.isArray(session.runParameters)
      ? session.runParameters.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
      : [];
    console.group(`[DFT IDE] Pipeline Task: ${session.flowLabel} / ${session.moduleKey} / ${task.name}`);
    console.log('command:', generatedCommand);
    console.log('groups:', runParameterRows.map((row) => row.groupNames ?? []));
    console.log('tcs:', runParameterRows.map((row) => row.tcNames ?? []));
    console.log('subattrs:', runParameterRows.map((row) => row.subattrNames ?? []));
    console.log('tools:', runParameterRows.map((row) => row.tools ?? []));
    console.log('Donau:', runParameterRows.map((row) => row.donau ?? {}));
    console.log('parameter rows:', runParameterRows);
    console.groupEnd();
    this.patchTask(key, task.id, (current) => ({
      logs: [...current.logs, `[${nowText()}] ${session.logPrefix} 执行命令：${generatedCommand}`],
    }));
    this.appendLog(key, session.logPrefix, `${task.name} 执行命令：${generatedCommand}`);
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
      this.patchTask(key, taskId, (task) => ({
        status: task.status === 'success' ? task.status : 'running',
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

    const task = session.tasks.find((item) => item.id === taskId);
    if (exitCode === 0) {
      this.patchTask(key, taskId, (current) => ({
        status: current.status === 'stopped' ? current.status : 'success',
        finishedAt: nowText(),
        logs: [...current.logs, `[${nowText()}] ${session.logPrefix} ${current.name} 执行完成。`],
      }));
      this.appendLog(key, session.logPrefix, `${task?.name ?? taskId} 执行成功。`);
      this.startNextSessionTask(key);
      return;
    }

    if (exitCode === 130 || exitCode === 143) {
      this.markRuntimeStopped(key, session.logPrefix, `${task?.name ?? taskId} 被中断。`, false);
      return;
    }

    this.finishRuntimeWithFailure(key, session.logPrefix, taskId, exitCode);
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
      this.appendLog(key, logPrefix, message);
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
            logs: [...task.logs, `[${nowText()}] ${logPrefix} 执行失败，退出码 ${exitCode}。`],
          };
        }
        if (task.status === 'pending') {
          return {
            ...task,
            status: 'skipped',
            finishedAt: nowText(),
            logs: [...task.logs, `[${nowText()}] ${logPrefix} 因前置任务失败跳过。`],
          };
        }
        return task;
      }),
      logs: [...runtime.logs, `[${nowText()}] ${logPrefix} 任务 ${taskId} 执行失败，流水线停止推进。`],
    }));
  }

  private completeRuntime(key: string, logPrefix: string): void {
    clearRuntimeTimers(key);
    this.disposeExecutionSession(key);
    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      runState: 'completed',
      finishedAt: nowStamp(),
      logs: [...runtime.logs, `[${nowText()}] ${logPrefix} 流水线执行成功。`],
    }));
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
            logs: [...task.logs, `[${nowText()}] ${logPrefix} ${reason}`],
          };
        }
        if (task.status === 'pending') {
          return {
            ...task,
            status: 'skipped',
            finishedAt: nowText(),
            logs: [...task.logs, `[${nowText()}] ${logPrefix} 因流水线停止跳过。`],
          };
        }
        return task;
      }),
      logs: [...current.logs, `[${nowText()}] ${logPrefix} ${reason}`],
    }));
  }

  private appendLog(key: string, prefix: string, msg: string): void {
    const formatted = msg.startsWith(prefix) ? msg : `${prefix} ${msg}`;
    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      logs: [...runtime.logs, `[${nowText()}] ${formatted}`],
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
          logs: nextPatch.logs ?? task.logs,
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
    if (runtime.runState !== 'completed' && runtime.runState !== 'failed' && runtime.runState !== 'stopped') {
      return;
    }
    if (historySavedRunIds.has(runtime.runId)) {
      return;
    }

    historySavedRunIds.add(runtime.runId);
    const failed = runtime.tasks.some((task) => task.status === 'failed');
    const status = runtime.runState === 'stopped'
      ? 'cancelled'
      : failed
        ? 'error'
        : 'success';

    this.options.onHistory({
      flow: runtime.flowKey,
      flowKey: runtime.flowKey,
      moduleKey: runtime.moduleKey,
      flowLabel: runtime.flowLabel,
      status,
      logs: runtime.logs,
      runtimeSnapshot: runtime,
    });
  }
}
