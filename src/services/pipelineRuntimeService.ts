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
import { stopExecutionTerminal } from './terminalService';

export type PipelineFlowKey = 'hibist' | 'sailor' | 'verification';
export type PipelineRunState = 'idle' | 'running' | 'completed' | 'stopped';

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
  openTerminal: (title: string, command: string | string[], cwd?: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
const historySavedRunIds = new Set<string>();

const nowText = () => new Date().toLocaleTimeString();
const nowStamp = () => Date.now();

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
          const projectPath = resolveProjectPath(flowKey);
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
            const toolName = String(customConfig.toolName ?? "").trim();
            const toolVersion = String(customConfig.toolVersion ?? "").trim();
            if (toolName && toolVersion) {
              try {
                fs.statSync(toolVersion);
                commands.push(`source ${toolVersion}`);
              } catch {
                commands.push(`ma ${toolName}/${toolVersion}`);
              }
            }
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
        const scriptPath = path.resolve(__dirname, '../scripts');
        const scriptName = stepCommand.split(' ')[0];
        commands.push(`source ${path.join(scriptPath, scriptName)}${stepCommand.substring(scriptName.length)}`);

        openTerminal(`${flowLabel} / ${moduleKey}`, commands, cwd);
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
  ): PipelineRuntimeSnapshot {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    const runId = `pipeline_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    clearRuntimeTimers(key);

    const { tasks: parsedTasks, links: parsedLinks } = loadPipelineConfig(flowKey);

    const initialTasks = parsedTasks.map((t, idx) => {
      const isSelected = !selectedTaskIds || selectedTaskIds.includes(t.id);
      const isFirstSelected = isSelected && (
        selectedTaskIds
          ? t.id === selectedTaskIds[0]
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

    runSequentialSimulation(
      key,
      selectedTasksToRun,
      config.logPrefix,
      flowLabel,
      flowKey,
      moduleKey,
      cwd,
      envConfig,
      taskConfig,
      this.options.openTerminal,
      (id, patch) => this.patchTask(key, id, patch),
      (msg) => this.appendLog(key, config.logPrefix, msg),
      (runState) => {
        this.updateRuntime(key, (current) => ({
          ...current,
          runState,
          finishedAt: runState === 'completed' || runState === 'stopped' ? nowStamp() : current.finishedAt,
        }));
      }
    );

    return runtime;
  }

  stopRuntime(flowKey: PipelineFlowKey, moduleKey: string, flowLabel: string): void {
    this.ensureRuntime(flowKey, moduleKey, flowLabel);

    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    clearRuntimeTimers(key);

    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      runState: 'stopped',
      finishedAt: nowStamp(),
      tasks: runtime.tasks.map((task) => {
        if (task.status === 'running') {
          stopExecutionTerminal(`${flowLabel} / ${moduleKey}`);

          return {
            ...task,
            status: 'stopped',
            finishedAt: nowText(),
            logs: [...task.logs, `[${nowText()}] ${config.logPrefix} 已被“停止全部”中止。`],
          };
        }

        if (task.status === 'pending') {
          return {
            ...task,
            status: 'skipped',
            finishedAt: nowText(),
            logs: [...task.logs, `[${nowText()}] ${config.logPrefix} 因“停止全部”跳过。`],
          };
        }

        return task;
      }),
      logs: [...runtime.logs, `[${nowText()}] ${config.logPrefix} 已触发“停止全部”。`],
    }));
  }

  selectTask(flowKey: PipelineFlowKey, moduleKey: string, taskId: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    this.updateRuntime(key, (runtime) => ({ ...runtime, selectedTaskId: taskId }));
  }

  stopTask(flowKey: PipelineFlowKey, moduleKey: string, taskId: string, flowLabel: string): void {
    const key = getPipelineRuntimeKey(flowKey, moduleKey);
    const config = pipelineFlowConfigs[flowKey];
    const logMsg = `[${nowText()}] ${config.logPrefix} 用户手动停止任务。`;

    this.updateRuntime(key, (runtime) => ({
      ...runtime,
      tasks: runtime.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        stopExecutionTerminal(`${flowLabel} / ${moduleKey}`);

        return {
          ...task,
          status: 'stopped',
          finishedAt: nowText(),
          logs: [...task.logs, logMsg],
        };
      }),
      logs: [...runtime.logs, `[${nowText()}] ${config.logPrefix} 任务 ${taskId} 已由用户手动停止。`],
    }));
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
      const scriptPath = path.resolve(__dirname, '../scripts');
      const scriptName = stepCommand.split(' ')[0];
      commands.push(`source ${path.join(scriptPath, scriptName)}${stepCommand.substring(scriptName.length)}`);
      this.options.openTerminal(`${runtime.flowLabel} / ${moduleKey}`, commands);
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
    if (runtime.runState !== 'completed' && runtime.runState !== 'stopped') {
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
