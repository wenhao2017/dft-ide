export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'stopped' | 'skipped';

export interface PipelineTask {
  id: string;
  name: string;
  command: string;
  status: TaskStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: string;
  attempts: number;
  description: string;
  logs: string[];
}

export interface PipelineLink {
  source: string;
  target: string;
}

export interface TimelineEvent {
  delay: number;
  action: (utils: {
    appendLog: (msg: string) => void;
    addTasks: (tasks: PipelineTask[], links: PipelineLink[]) => void;
    patchTask: (id: string, patch: Partial<PipelineTask> | ((task: PipelineTask) => Partial<PipelineTask>)) => void;
    setRunState: (state: 'idle' | 'running' | 'completed' | 'stopped') => void;
    getNow: () => string;
  }) => void;
}

export interface FlowConfig {
  title: string;
  logPrefix: string;
  terminalTitle: string;
  terminalCommand: string;
  getInitialTasks: (makeTask: (id: string, name: string, cmd: string, desc: string, status?: TaskStatus) => PipelineTask) => PipelineTask[];
  getInitialLinks: () => PipelineLink[];
  timeline: TimelineEvent[];
  onRerun: (
    taskId: string,
    utils: {
      appendLog: (msg: string) => void;
      patchTask: (id: string, patch: Partial<PipelineTask> | ((task: PipelineTask) => Partial<PipelineTask>)) => void;
      setRunState: (state: 'idle' | 'running' | 'completed' | 'stopped') => void;
      getNow: () => string;
      schedule: (delay: number, action: () => void) => void;
      setRuntime: React.Dispatch<React.SetStateAction<any>>;
    }
  ) => void;
}

export const pipelineFlowConfigs: Record<'hibist' | 'sailor' | 'verification', FlowConfig> = {
  hibist: {
    title: 'DFTM MBIST Flow',
    logPrefix: '[DFTM]',
    terminalTitle: 'DFTM MBIST Flow 运行终端',
    terminalCommand: 'dftm gen_analysis_env -cfg cpu_top.cfg',
    getInitialTasks: (makeTask) => [
      makeTask('gen_analysis_env', 'gen_analysis_env', 'dftm gen_analysis_env -cfg cpu_top.cfg', '生成 analysis 阶段分析环境'),
      makeTask('run_analysis', 'run_analysis', 'dftm run_analysis -cfg cpu_top.cfg', '执行 design rule check 与 DFT 分析'),
      makeTask('gen_insert_env', 'gen_insert_env', 'dftm gen_insert_env -cfg cpu_top.cfg', '生成 insert 阶段 MBIST 插入环境'),
      makeTask('run_insert', 'run_insert', 'dftm run_insert -cfg cpu_top.cfg', '执行 wrapper generation 与 MBIST 插入'),
      makeTask('gen_build_env', 'gen_build_env', 'dftm gen_build_env -cfg cpu_top.cfg', '生成 build 阶段环境'),
      makeTask('run_build', 'run_build', 'dftm run_build -cfg cpu_top.cfg', '构建 post-MBIST RTL 与结构描述'),
      makeTask('gen_syn_env', 'gen_syn_env', 'dftm gen_syn_env -cfg cpu_top.cfg', '生成 synthesis 综合环境'),
      makeTask('run_syn', 'run_syn', 'dftm run_syn -cfg cpu_top.cfg', '执行 top-link check 与逻辑综合'),
      makeTask('gen_fml_env', 'gen_fml_env', 'dftm gen_fml_env -cfg cpu_top.cfg', '生成 Formality 验证环境'),
      makeTask('run_fml', 'run_fml', 'dftm run_fml -cfg cpu_top.cfg', '执行 Formality 形式等价性验证'),
      makeTask('gen_sim_env', 'gen_sim_env', 'dftm gen_sim_env -cfg cpu_top.cfg', '生成仿真环境与 testbench'),
      makeTask('run_sim', 'run_sim', 'dftm run_sim -cfg cpu_top.cfg', '运行 MBIST 并行/串行等多类型仿真'),
      makeTask('release', 'release', 'dftm release -cfg cpu_top.cfg -version 0.1.0', '打包交付 release 介质及报告'),
    ],
    getInitialLinks: () => [
      { source: 'gen_analysis_env', target: 'run_analysis' },
      { source: 'run_analysis', target: 'gen_insert_env' },
      { source: 'gen_insert_env', target: 'run_insert' },
      { source: 'run_insert', target: 'gen_build_env' },
      { source: 'gen_build_env', target: 'run_build' },
      { source: 'run_build', target: 'gen_syn_env' },
      { source: 'gen_syn_env', target: 'run_syn' },
      { source: 'run_syn', target: 'gen_fml_env' },
      { source: 'gen_fml_env', target: 'run_fml' },
      { source: 'run_fml', target: 'gen_sim_env' },
      { source: 'gen_sim_env', target: 'run_sim' },
      { source: 'run_sim', target: 'release' },
    ],
    timeline: [
      {
        delay: 500,
        action: ({ patchTask, appendLog, getNow }) => {
          appendLog('[DFTM] 加载 cfg 配置文件: cpu_top.cfg');
          appendLog('[DFTM] 生成 analysis 阶段运行环境目录');
          patchTask('gen_analysis_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 1500,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_analysis_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[DFTM] ${getNow()} analysis 环境准备就绪。`],
          }));
          appendLog('[DFTM] gen_analysis_env 执行成功。');
          appendLog('[DFTM] 提取 memory instance 列表');
          appendLog('[DFTM] 执行 design rule check (DRC) 分析');
          patchTask('run_analysis', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 2800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('run_analysis', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.3s',
            logs: [...t.logs, `[DFTM] ${getNow()} 设计树结构校验通过，生成 mem_list.do。`],
          }));
          appendLog('[DFTM] run_analysis 执行成功。');
          appendLog('[DFTM] 生成 insert 脚本与配置文件模板');
          patchTask('gen_insert_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 3800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_insert_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[DFTM] ${getNow()} MBIST 插入脚本环境准备就绪。`],
          }));
          appendLog('[DFTM] gen_insert_env 执行成功。');
          appendLog('[DFTM] 执行 wrapper generation 逻辑生成');
          appendLog('[DFTM] 执行 MBIST insertion 插入操作');
          patchTask('run_insert', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 5000,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('run_insert', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.2s',
            logs: [...t.logs, `[DFTM] ${getNow()} 成功插入 12 个 MBIST controller。`],
          }));
          appendLog('[DFTM] run_insert 执行成功。');
          appendLog('[DFTM] 生成 post-MBIST RTL 构建目录');
          patchTask('gen_build_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 6000,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_build_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[DFTM] ${getNow()} RTL构建环境准备就绪。`],
          }));
          appendLog('[DFTM] gen_build_env 执行成功。');
          appendLog('[DFTM] 生成 post-MBIST RTL 代码文件');
          appendLog('[DFTM] 校验 RTL 语法与模块接口一致性');
          patchTask('run_build', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 7200,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('run_build', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.2s',
            logs: [...t.logs, `[DFTM] ${getNow()} RTL 代码构建完成。`],
          }));
          appendLog('[DFTM] run_build 执行成功。');
          appendLog('[DFTM] 导出综合约束文件与环境模板');
          patchTask('gen_syn_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 8200,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_syn_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[DFTM] ${getNow()} 综合环境准备就绪。`],
          }));
          appendLog('[DFTM] gen_syn_env 执行成功。');
          appendLog('[DFTM] 执行 top-link check 顶层连接检查');
          appendLog('[DFTM] 启动逻辑综合流程 (synthesis)');
          patchTask('run_syn', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 9600,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('run_syn', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.4s',
            logs: [...t.logs, `[DFTM] ${getNow()} 逻辑综合通过。`],
          }));
          appendLog('[DFTM] run_syn 执行成功。');
          appendLog('[DFTM] 生成 FML (Formality) 形式等价性验证约束文件');
          patchTask('gen_fml_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 10600,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_fml_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[DFTM] ${getNow()} FML 环境准备就绪。`],
          }));
          appendLog('[DFTM] gen_fml_env 执行成功。');
          appendLog('[DFTM] 执行 Formality comparison 形式验证对比');
          patchTask('run_fml', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 12000,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('run_fml', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.4s',
            logs: [...t.logs, `[DFTM] ${getNow()} 逻辑等价性校验结果: VERIFIED (100% Match)`],
          }));
          appendLog('[DFTM] run_fml 执行成功。');
          appendLog('[DFTM] 生成仿真环境与仿真测试激励 (testbench)');
          patchTask('gen_sim_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 13000,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_sim_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[DFTM] ${getNow()} 仿真环境生成完毕。`],
          }));
          appendLog('[DFTM] gen_sim_env 执行成功。');
          appendLog('[DFTM] 准备运行 MBIST 并行/串行仿真分叉');
          patchTask('run_sim', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 13800,
        action: ({ addTasks, patchTask, appendLog, getNow }) => {
          appendLog('[DFTM] run_sim 动态展开仿真子任务: pfast, pslow, rcr, share_bus_order, pbisr');
          const makeSub = (id: string, name: string, cmd: string, desc: string) => {
            const task = {
              id,
              name,
              command: cmd,
              status: 'running' as TaskStatus,
              attempts: 1,
              description: desc,
              startedAt: getNow(),
              logs: [`[DFTM] [${getNow()}] ${name} 仿真子任务启动。`],
            };
            return task;
          };

          addTasks(
            [
              makeSub('mbist_pfast', 'mbist_pfast', 'dftm run_sim -mode pfast -cfg cpu_top.cfg', '运行 pfast 仿真模式'),
              makeSub('mbist_pslow', 'mbist_pslow', 'dftm run_sim -mode pslow -cfg cpu_top.cfg', '运行 pslow 仿真模式'),
              makeSub('mbist_rcr', 'mbist_rcr', 'dftm run_sim -mode rcr -cfg cpu_top.cfg', '运行 rcr 仿真模式'),
              makeSub('mbist_share_bus_order', 'mbist_share_bus_order', 'dftm run_sim -mode share_bus_order -cfg cpu_top.cfg', '运行 share_bus_order 仿真模式'),
              makeSub('mbist_pbisr', 'mbist_pbisr', 'dftm run_sim -mode pbisr -cfg cpu_top.cfg', '运行 pbisr 仿真模式'),
            ],
            [
              { source: 'run_sim', target: 'mbist_pfast' },
              { source: 'run_sim', target: 'mbist_pslow' },
              { source: 'run_sim', target: 'mbist_rcr' },
              { source: 'run_sim', target: 'mbist_share_bus_order' },
              { source: 'run_sim', target: 'mbist_pbisr' },
              { source: 'mbist_pfast', target: 'release' },
              { source: 'mbist_pslow', target: 'release' },
              { source: 'mbist_rcr', target: 'release' },
              { source: 'mbist_share_bus_order', target: 'release' },
              { source: 'mbist_pbisr', target: 'release' },
            ]
          );
        },
      },
      {
        delay: 15500,
        action: ({ patchTask, appendLog, getNow, setRunState }) => {
          patchTask('mbist_pfast', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[DFTM] ${getNow()} 仿真时间: 12400 ns, 结果: PASS`],
          }));
          patchTask('mbist_pslow', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[DFTM] ${getNow()} 仿真时间: 45800 ns, 结果: PASS`],
          }));
          patchTask('mbist_rcr', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[DFTM] ${getNow()} 仿真时间: 8900 ns, 结果: PASS`],
          }));
          patchTask('mbist_pbisr', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[DFTM] ${getNow()} 仿真时间: 15400 ns, 结果: PASS`],
          }));
          patchTask('mbist_share_bus_order', (t) => ({
            status: 'failed',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [
              ...t.logs,
              `[DFTM] ${getNow()} 仿真在 4200 ns 处捕获到时序违例 (Timing violation)`,
              `[DFTM] 错误：pattern_017 触发断言失败`,
            ],
          }));

          appendLog('[DFTM] 仿真子任务 mbist_share_bus_order 执行失败。');
          patchTask('run_sim', (t) => ({
            status: 'failed',
            finishedAt: getNow(),
            duration: '2.5s',
            logs: [...t.logs, `[DFTM] ${getNow()} 子仿真任务存在错误，停止流向下一步。`],
          }));
          patchTask('release', (t) => ({
            status: 'skipped',
            finishedAt: getNow(),
            logs: [...t.logs, `[DFTM] ${getNow()} 因上游仿真失败，跳过打包交付。`],
          }));
          setRunState('completed');
        },
      },
    ],
    onRerun: (taskId, { appendLog, patchTask, setRunState, getNow, schedule, setRuntime }) => {
      if (taskId === 'mbist_share_bus_order') {
        patchTask('mbist_share_bus_order', (t) => ({
          status: 'running',
          attempts: t.attempts + 1,
          startedAt: getNow(),
          finishedAt: undefined,
          logs: [...t.logs, `[DFTM] [${getNow()}] 重新提交仿真，开始分析波形并调整时延。`],
        }));
        appendLog('[DFTM] mbist_share_bus_order 开始重跑。');

        setRuntime((prev: any) => ({
          ...prev,
          runState: 'running',
          tasks: prev.tasks.map((task: any) => {
            if (task.id === 'run_sim' || task.id === 'release') {
              return {
                ...task,
                status: task.id === 'run_sim' ? 'running' : 'pending',
                finishedAt: undefined,
                logs: [...task.logs, `[DFTM] [${getNow()}] 等待重跑子任务结果以恢复流向。`],
              };
            }
            return task;
          }),
        }));

        schedule(1500, () => {
          patchTask('mbist_share_bus_order', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.5s',
            logs: [...t.logs, `[DFTM] [${getNow()}] 重新运行成功，未发现时序违例，结果: PASS`],
          }));
          appendLog('[DFTM] mbist_share_bus_order 重跑成功。');

          setRuntime((prev: any) => {
            // Check if all subtasks are success now
            const updatedTasks = prev.tasks.map((task: any) => {
              if (task.id === 'mbist_share_bus_order') {
                return {
                  ...task,
                  status: 'success',
                  finishedAt: getNow(),
                  duration: '1.5s',
                };
              }
              if (task.id === 'run_sim') {
                return {
                  ...task,
                  status: 'success',
                  finishedAt: getNow(),
                  duration: '4.0s',
                  logs: [...task.logs, `[DFTM] [${getNow()}] 所有子仿真任务通过。`],
                };
              }
              if (task.id === 'release') {
                return {
                  ...task,
                  status: 'running',
                  startedAt: getNow(),
                  logs: [...task.logs, `[DFTM] [${getNow()}] 所有前置条件已满足，启动 release 交付物打包。`],
                };
              }
              return task;
            });
            return {
              ...prev,
              tasks: updatedTasks,
            };
          });

          schedule(1500, () => {
            patchTask('release', (t) => ({
              status: 'success',
              finishedAt: getNow(),
              duration: '1.5s',
              logs: [
                ...t.logs,
                `[DFTM] [${getNow()}] 生成最终 DFT 报告摘要及交付物成功。`,
                `[DFTM] [${getNow()}] 完整 release 封包输出于: work/release/v0.1.0/`,
              ],
            }));
            appendLog('[DFTM] release 执行成功。');
            appendLog('[DFTM] 流水线执行成功完成。');
            setRunState('completed');
          });
        });
      } else {
        // generic fallback rerun
        patchTask(taskId, (t) => ({
          status: 'running',
          attempts: t.attempts + 1,
          startedAt: getNow(),
          finishedAt: undefined,
          logs: [...t.logs, `[DFTM] [${getNow()}] 手动触发重跑。`],
        }));
        appendLog(`[DFTM] ${taskId} 开始重跑。`);
        schedule(1000, () => {
          patchTask(taskId, (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[DFTM] [${getNow()}] 重跑成功。`],
          }));
          appendLog(`[DFTM] ${taskId} 重跑成功。`);
        });
      }
    },
  },
  sailor: {
    title: 'Sailor Design Flow',
    logPrefix: '[Sailor]',
    terminalTitle: 'Sailor Design Flow 运行终端',
    terminalCommand: 'sailor gen_cfg -spec norm_input.xlsx',
    getInitialTasks: (makeTask) => [
      makeTask('create_branch', 'create_branch', 'sailor branch -create feat_dft_scan', '创建或切换 feature 分支'),
      makeTask('gen_cfg', 'gen_cfg', 'sailor gen_cfg -spec norm_input.xlsx', '根据归一化表格生成 sailor cfg'),
      makeTask('user_hook_before_gen_dcg_env', 'user_hook_before_gen_dcg_env', 'run_flow_sailor hook --before gen_dcg_env', '执行 DCG 生成前置 ECO 钩子'),
      makeTask('gen_dcg_env', 'gen_dcg_env', 'sailor gen_dcg_env -cfg sailor.cfg', '生成 DCG 扫描链环境'),
      makeTask('user_hook_after_gen_cfg', 'user_hook_after_gen_cfg', 'run_flow_sailor hook --after gen_cfg', '执行生成后置 ECO 校验钩子'),
      makeTask('run_scan', 'run_scan', 'sailor run_scan -cfg sailor.cfg', '执行 scan 链插入与缝合'),
      makeTask('gen_analysis_env', 'gen_analysis_env', 'sailor gen_analysis_env -cfg sailor.cfg', '生成 scan 分析与 DRC 环境'),
      makeTask('run_analysis', 'run_analysis', 'sailor run_analysis -cfg sailor.cfg', '执行 scan 检查与 DRC 分析'),
      makeTask('commit_result', 'commit_result', 'sailor commit -files "cfg,scripts,reports"', '提交配置文件、脚本与报告'),
    ],
    getInitialLinks: () => [
      { source: 'create_branch', target: 'gen_cfg' },
      { source: 'gen_cfg', target: 'user_hook_before_gen_dcg_env' },
      { source: 'user_hook_before_gen_dcg_env', target: 'gen_dcg_env' },
      { source: 'gen_dcg_env', target: 'user_hook_after_gen_cfg' },
      { source: 'user_hook_after_gen_cfg', target: 'run_scan' },
      { source: 'run_scan', target: 'gen_analysis_env' },
      { source: 'gen_analysis_env', target: 'run_analysis' },
      { source: 'run_analysis', target: 'commit_result' },
    ],
    timeline: [
      {
        delay: 500,
        action: ({ patchTask, appendLog, getNow }) => {
          appendLog('[Sailor] 切换工作分支到: feat_dft_scan');
          patchTask('create_branch', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 1500,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('create_branch', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Sailor] ${getNow()} 已成功切换至 feat_dft_scan 分支。`],
          }));
          appendLog('[Sailor] create_branch 执行成功。');
          appendLog('[Sailor] 读取归一化输入表格: norm_input.xlsx');
          appendLog('[Sailor] 解析模块端口及时钟复位信息');
          patchTask('gen_cfg', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 2800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_cfg', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.3s',
            logs: [...t.logs, `[Sailor] ${getNow()} 成功生成 sailor.cfg 配置文件。`],
          }));
          appendLog('[Sailor] gen_cfg 执行成功。');
          appendLog('[Sailor] 执行用户 ECO 前置 hook 脚本');
          patchTask('user_hook_before_gen_dcg_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 3800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('user_hook_before_gen_dcg_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Sailor] ${getNow()} 前置 ECO 钩子脚本校验通过。`],
          }));
          appendLog('[Sailor] user_hook_before_gen_dcg_env 执行成功。');
          appendLog('[Sailor] 基于配置文件生成 DCG 环境结构');
          patchTask('gen_dcg_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 4800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_dcg_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Sailor] ${getNow()} DCG 约束文件及加载脚本生成就绪。`],
          }));
          appendLog('[Sailor] gen_dcg_env 执行成功。');
          appendLog('[Sailor] 执行用户后置 hook 脚本校验生成结果');
          patchTask('user_hook_after_gen_cfg', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 5800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('user_hook_after_gen_cfg', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Sailor] ${getNow()} 后置 hook 校验通过。`],
          }));
          appendLog('[Sailor] user_hook_after_gen_cfg 执行成功。');
          appendLog('[Sailor] 开始执行 scan 相关任务并插入 scan 链');
          patchTask('run_scan', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 7000,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('run_scan', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.2s',
            logs: [...t.logs, `[Sailor] ${getNow()} Scan-inserted RTL 成功输出。`],
          }));
          appendLog('[Sailor] run_scan 执行成功。');
          appendLog('[Sailor] 准备分析阶段的仿真与检查环境');
          patchTask('gen_analysis_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 8000,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('gen_analysis_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Sailor] ${getNow()} 分析环境配置完毕。`],
          }));
          appendLog('[Sailor] gen_analysis_env 执行成功。');
          appendLog('[Sailor] 启动 analysis 分析任务，准备展开子检查项');
          patchTask('run_analysis', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 8800,
        action: ({ addTasks, patchTask, appendLog, getNow }) => {
          appendLog('[Sailor] run_analysis 动态展开子任务: clock_check, scan_chain_check, drc_check, report_summary');
          const makeSub = (id: string, name: string, cmd: string, desc: string) => {
            const task = {
              id,
              name,
              command: cmd,
              status: 'running' as TaskStatus,
              attempts: 1,
              description: desc,
              startedAt: getNow(),
              logs: [`[Sailor] [${getNow()}] 子检查项 ${name} 启动。`],
            };
            return task;
          };

          addTasks(
            [
              makeSub('clock_check', 'clock_check', 'sailor check --type clock', '校验时钟树一致性'),
              makeSub('scan_chain_check', 'scan_chain_check', 'sailor check --type scan_chain', '校验扫描链长度及完整性'),
              makeSub('drc_check', 'drc_check', 'sailor check --type drc', '执行设计规则校验 (DRC)'),
              makeSub('report_summary', 'report_summary', 'sailor check --type summary', '生成模块级别 DFT 摘要报告'),
            ],
            [
              { source: 'run_analysis', target: 'clock_check' },
              { source: 'run_analysis', target: 'scan_chain_check' },
              { source: 'run_analysis', target: 'drc_check' },
              { source: 'run_analysis', target: 'report_summary' },
              { source: 'clock_check', target: 'commit_result' },
              { source: 'scan_chain_check', target: 'commit_result' },
              { source: 'drc_check', target: 'commit_result' },
              { source: 'report_summary', target: 'commit_result' },
            ]
          );
        },
      },
      {
        delay: 10500,
        action: ({ patchTask, appendLog, getNow, setRunState }) => {
          patchTask('clock_check', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[Sailor] ${getNow()} 未检测到未定义时钟，时钟校验 PASS。`],
          }));
          patchTask('scan_chain_check', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[Sailor] ${getNow()} 扫描链总长度: 4500 bits, 缝合正常，校验 PASS。`],
          }));
          patchTask('report_summary', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[Sailor] ${getNow()} DFT summary 报告已输出。`],
          }));
          patchTask('drc_check', (t) => ({
            status: 'failed',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [
              ...t.logs,
              `[Sailor] ${getNow()} 发现 C1 违例 - 扫描时钟不受外部引脚控制。`,
              `[Sailor] 错误：Test Clock is not controlled by tester.`,
            ],
          }));

          appendLog('[Sailor] DRC 校验失败，扫描时钟不受测试机控制。');
          patchTask('run_analysis', (t) => ({
            status: 'failed',
            finishedAt: getNow(),
            duration: '2.5s',
            logs: [...t.logs, `[Sailor] ${getNow()} 子检查项 drc_check 失败。`],
          }));
          patchTask('commit_result', (t) => ({
            status: 'skipped',
            finishedAt: getNow(),
            logs: [...t.logs, `[Sailor] ${getNow()} 因 DRC 校验失败，跳过文件 commit 提交。`],
          }));
          setRunState('completed');
        },
      },
    ],
    onRerun: (taskId, { appendLog, patchTask, setRunState, getNow, schedule, setRuntime }) => {
      if (taskId === 'drc_check') {
        patchTask('drc_check', (t) => ({
          status: 'running',
          attempts: t.attempts + 1,
          startedAt: getNow(),
          finishedAt: undefined,
          logs: [...t.logs, `[Sailor] [${getNow()}] 重新加载修改后的 test clock pad 配置，再次触发 DRC 校验。`],
        }));
        appendLog('[Sailor] drc_check 开始重跑。');

        setRuntime((prev: any) => ({
          ...prev,
          runState: 'running',
          tasks: prev.tasks.map((task: any) => {
            if (task.id === 'run_analysis' || task.id === 'commit_result') {
              return {
                ...task,
                status: task.id === 'run_analysis' ? 'running' : 'pending',
                finishedAt: undefined,
                logs: [...task.logs, `[Sailor] [${getNow()}] 等待 DRC 重跑结果以恢复主流程。`],
              };
            }
            return task;
          }),
        }));

        schedule(1500, () => {
          patchTask('drc_check', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.5s',
            logs: [...t.logs, `[Sailor] [${getNow()}] 测试时钟引脚已由 ECO 修复，DRC 校验结果: PASS`],
          }));
          appendLog('[Sailor] drc_check 重跑成功。');

          setRuntime((prev: any) => {
            const updatedTasks = prev.tasks.map((task: any) => {
              if (task.id === 'drc_check') {
                return {
                  ...task,
                  status: 'success',
                  finishedAt: getNow(),
                  duration: '1.5s',
                };
              }
              if (task.id === 'run_analysis') {
                return {
                  ...task,
                  status: 'success',
                  finishedAt: getNow(),
                  duration: '4.0s',
                  logs: [...task.logs, `[Sailor] [${getNow()}] 所有子检查项均已通过。`],
                };
              }
              if (task.id === 'commit_result') {
                return {
                  ...task,
                  status: 'running',
                  startedAt: getNow(),
                  logs: [...task.logs, `[Sailor] [${getNow()}] 校验通过，开始提交生成的 cfg 脚本和报告。`],
                };
              }
              return task;
            });
            return {
              ...prev,
              tasks: updatedTasks,
            };
          });

          schedule(1500, () => {
            patchTask('commit_result', (t) => ({
              status: 'success',
              finishedAt: getNow(),
              duration: '1.5s',
              logs: [
                ...t.logs,
                `[Sailor] [${getNow()}] 文件提交成功，已推送至 Sailor feature 分支仓库。`,
                `[Sailor] [${getNow()}] 自动触发远程 CI pipeline。`,
              ],
            }));
            appendLog('[Sailor] commit_result 执行成功。');
            appendLog('[Sailor] 流水线执行成功完成。');
            setRunState('completed');
          });
        });
      } else {
        patchTask(taskId, (t) => ({
          status: 'running',
          attempts: t.attempts + 1,
          startedAt: getNow(),
          finishedAt: undefined,
          logs: [...t.logs, `[Sailor] [${getNow()}] 手动触发重跑。`],
        }));
        appendLog(`[Sailor] ${taskId} 开始重跑。`);
        schedule(1000, () => {
          patchTask(taskId, (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Sailor] [${getNow()}] 重跑成功。`],
          }));
          appendLog(`[Sailor] ${taskId} 重跑成功。`);
        });
      }
    },
  },
  verification: {
    title: 'Lander Verification Flow',
    logPrefix: '[Lander]',
    terminalTitle: 'Lander Verification Flow 运行终端',
    terminalCommand: 'lander submit_mode --mode scan_test',
    getInitialTasks: (makeTask) => [
      makeTask('prepare_workspace', 'prepare_workspace', 'lander prepare_workspace --dir ./verify_run', '准备 verification workspace'),
      makeTask('load_config', 'load_config', 'lander load_config --file lander_verify.cfg', '加载 lander 配置'),
      makeTask('check_env', 'check_env', 'run_flow_lander check_env --tools', '检查仿真环境、filelist 和工具版本'),
      makeTask('submit_mode', 'submit_mode', 'lander submit_mode --mode scan_test', '提交仿真 mode 任务'),
      makeTask('collect_result', 'collect_result', 'lander collect_result --dir ./verify_run', '收集仿真结果'),
      makeTask('parse_report', 'parse_report', 'lander parse_report --out report.json', '解析 pass / fail / error 报告'),
      makeTask('publish_dashboard', 'publish_dashboard', 'lander publish_dashboard --server ide-board', '发布结果到 IDE 看板'),
    ],
    getInitialLinks: () => [
      { source: 'prepare_workspace', target: 'load_config' },
      { source: 'load_config', target: 'check_env' },
      { source: 'check_env', target: 'submit_mode' },
      { source: 'submit_mode', target: 'collect_result' },
      { source: 'collect_result', target: 'parse_report' },
      { source: 'parse_report', target: 'publish_dashboard' },
    ],
    timeline: [
      {
        delay: 500,
        action: ({ patchTask, appendLog, getNow }) => {
          appendLog('[Lander] 准备 verification workspace 目录结构');
          appendLog('[Lander] 创建 log、report 以及 dump waveform 目录');
          patchTask('prepare_workspace', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 1500,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('prepare_workspace', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Lander] ${getNow()} 工作区已就绪。`],
          }));
          appendLog('[Lander] prepare_workspace 执行成功。');
          appendLog('[Lander] 加载 lander 验证配置文件: lander_verify.cfg');
          appendLog('[Lander] 解析包含的 testcases 与模式选项');
          patchTask('load_config', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 2800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('load_config', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.3s',
            logs: [...t.logs, `[Lander] ${getNow()} 配置加载完毕。`],
          }));
          appendLog('[Lander] load_config 执行成功。');
          appendLog('[Lander] 检查仿真环境工具版本 (VCS / Verdi)');
          appendLog('[Lander] 检查仿真 filelist 文件及约束定义');
          patchTask('check_env', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 3800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('check_env', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Lander] ${getNow()} 仿真环境自检通过。`],
          }));
          appendLog('[Lander] check_env 执行成功。');
          appendLog('[Lander] 提交仿真模式 (mode: scan_test) 至计算集群');
          patchTask('submit_mode', { status: 'running', startedAt: getNow() });
        },
      },
      {
        delay: 4500,
        action: ({ addTasks, patchTask, appendLog, getNow }) => {
          appendLog('[Lander] submit_mode 动态展开子仿真组 (group_smoke, group_regression, group_corner)');
          const makeSub = (id: string, name: string, cmd: string, desc: string) => ({
            id,
            name,
            command: cmd,
            status: 'running' as TaskStatus,
            attempts: 1,
            description: desc,
            startedAt: getNow(),
            logs: [`[Lander] [${getNow()}] 仿真组 ${name} 开始启动运行。`],
          });

          addTasks(
            [
              makeSub('group_smoke', 'group_smoke', 'lander run_group --group smoke', '运行 smoke 仿真任务组'),
              makeSub('group_regression', 'group_regression', 'lander run_group --group regression', '运行 regression 仿真任务组'),
              makeSub('group_corner', 'group_corner', 'lander run_group --group corner', '运行 corner 仿真任务组'),
            ],
            [
              { source: 'submit_mode', target: 'group_smoke' },
              { source: 'submit_mode', target: 'group_regression' },
              { source: 'submit_mode', target: 'group_corner' },
              { source: 'group_smoke', target: 'collect_result' },
              { source: 'group_regression', target: 'collect_result' },
              { source: 'group_corner', target: 'collect_result' },
            ]
          );
        },
      },
      {
        delay: 5800,
        action: ({ patchTask, appendLog, getNow }) => {
          patchTask('group_smoke', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.3s',
            logs: [...t.logs, `[Lander] ${getNow()} Smoke 组测试全部通过。`],
          }));
          patchTask('group_corner', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.3s',
            logs: [...t.logs, `[Lander] ${getNow()} Corner 组测试全部通过。`],
          }));
          appendLog('[Lander] 仿真组 group_smoke、group_corner 运行成功。');
          appendLog('[Lander] group_regression 启动二级展开，运行具体测试例 (tc_scan_shift, tc_scan_capture, tc_edt_bypass, tc_occ_clock)');
        },
      },
      {
        delay: 6500,
        action: ({ addTasks, patchTask, appendLog, getNow }) => {
          const makeTc = (id: string, name: string, cmd: string, desc: string) => ({
            id,
            name,
            command: cmd,
            status: 'running' as TaskStatus,
            attempts: 1,
            description: desc,
            startedAt: getNow(),
            logs: [`[Lander] [${getNow()}] 测试例 ${name} 在集群节点启动。`],
          });

          // We remove regression -> collect_result and route through the testcases
          // But wait! To keep ReactFlow visual links neat, we remove the edge { source: 'group_regression', target: 'collect_result' }
          // and add:
          // { source: 'group_regression', target: 'tc_scan_shift' } etc
          // { source: 'tc_scan_shift', target: 'collect_result' } etc
          // Let's call addTasks with the new nodes and connections.

          addTasks(
            [
              makeTc('tc_scan_shift', 'tc_scan_shift', 'lander run_testcase tc_scan_shift', '扫描移位测试'),
              makeTc('tc_scan_capture', 'tc_scan_capture', 'lander run_testcase tc_scan_capture', '扫描捕获测试'),
              makeTc('tc_edt_bypass', 'tc_edt_bypass', 'lander run_testcase tc_edt_bypass', 'EDT旁路测试'),
              makeTc('tc_occ_clock', 'tc_occ_clock', 'lander run_testcase tc_occ_clock', 'OCC时钟波形测试'),
            ],
            [
              { source: 'group_regression', target: 'tc_scan_shift' },
              { source: 'group_regression', target: 'tc_scan_capture' },
              { source: 'group_regression', target: 'tc_edt_bypass' },
              { source: 'group_regression', target: 'tc_occ_clock' },
              { source: 'tc_scan_shift', target: 'collect_result' },
              { source: 'tc_scan_capture', target: 'collect_result' },
              { source: 'tc_edt_bypass', target: 'collect_result' },
              { source: 'tc_occ_clock', target: 'collect_result' },
            ]
          );
        },
      },
      {
        delay: 8200,
        action: ({ patchTask, appendLog, getNow, setRunState }) => {
          patchTask('tc_scan_shift', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[Lander] ${getNow()} tc_scan_shift 移位数据对比通过，结果: PASS`],
          }));
          patchTask('tc_scan_capture', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[Lander] ${getNow()} tc_scan_capture 捕获数据对比通过，结果: PASS`],
          }));
          patchTask('tc_edt_bypass', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [...t.logs, `[Lander] ${getNow()} tc_edt_bypass 比对通过，结果: PASS`],
          }));
          patchTask('tc_occ_clock', (t) => ({
            status: 'failed',
            finishedAt: getNow(),
            duration: '1.7s',
            logs: [
              ...t.logs,
              `[Lander] ${getNow()} VCS 仿真遇到断言错误: OCC 时钟未产生预期脉冲数。`,
              `[Lander] 错误：tc_occ_clock 捕获失败，仿真进程非正常退出(Exit Code 1)。`,
            ],
          }));

          appendLog('[Lander] 仿真测试例 tc_occ_clock 运行失败。');
          patchTask('group_regression', (t) => ({
            status: 'failed',
            finishedAt: getNow(),
            duration: '2.5s',
            logs: [...t.logs, `[Lander] ${getNow()} 子仿真测试例 tc_occ_clock 失败。`],
          }));
          patchTask('submit_mode', (t) => ({
            status: 'failed',
            finishedAt: getNow(),
            duration: '4.4s',
            logs: [...t.logs, `[Lander] ${getNow()} 仿真组 group_regression 失败。`],
          }));
          patchTask('collect_result', (t) => ({
            status: 'skipped',
            finishedAt: getNow(),
            logs: [...t.logs, `[Lander] ${getNow()} 因仿真出错跳过收集。`],
          }));
          patchTask('parse_report', (t) => ({
            status: 'skipped',
            finishedAt: getNow(),
            logs: [...t.logs, `[Lander] ${getNow()} 跳过报告解析。`],
          }));
          patchTask('publish_dashboard', (t) => ({
            status: 'skipped',
            finishedAt: getNow(),
            logs: [...t.logs, `[Lander] ${getNow()} 跳过IDE看板发布。`],
          }));
          setRunState('completed');
        },
      },
    ],
    onRerun: (taskId, { appendLog, patchTask, setRunState, getNow, schedule, setRuntime }) => {
      if (taskId === 'tc_occ_clock') {
        patchTask('tc_occ_clock', (t) => ({
          status: 'running',
          attempts: t.attempts + 1,
          startedAt: getNow(),
          finishedAt: undefined,
          logs: [...t.logs, `[Lander] [${getNow()}] 重新载入时钟选择信号，修正仿真控制激励并重启 VCS 仿真。`],
        }));
        appendLog('[Lander] tc_occ_clock 开始重跑。');

        setRuntime((prev: any) => ({
          ...prev,
          runState: 'running',
          tasks: prev.tasks.map((task: any) => {
            if (task.id === 'submit_mode' || task.id === 'group_regression' || task.id === 'collect_result' || task.id === 'parse_report' || task.id === 'publish_dashboard') {
              return {
                ...task,
                status: (task.id === 'submit_mode' || task.id === 'group_regression') ? 'running' : 'pending',
                finishedAt: undefined,
                logs: [...task.logs, `[Lander] [${getNow()}] 等待 tc_occ_clock 重跑成功。`],
              };
            }
            return task;
          }),
        }));

        schedule(1500, () => {
          patchTask('tc_occ_clock', (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.5s',
            logs: [...t.logs, `[Lander] [${getNow()}] 重新仿真完成，OCC脉冲计数匹配，结果: PASS`],
          }));
          appendLog('[Lander] tc_occ_clock 重跑成功。');

          setRuntime((prev: any) => {
            const updatedTasks = prev.tasks.map((task: any) => {
              if (task.id === 'tc_occ_clock') {
                return {
                  ...task,
                  status: 'success',
                  finishedAt: getNow(),
                  duration: '1.5s',
                };
              }
              if (task.id === 'group_regression') {
                return {
                  ...task,
                  status: 'success',
                  finishedAt: getNow(),
                  duration: '4.5s',
                  logs: [...task.logs, `[Lander] [${getNow()}] Regression 仿真组所有测试例均已通过。`],
                };
              }
              if (task.id === 'submit_mode') {
                return {
                  ...task,
                  status: 'success',
                  finishedAt: getNow(),
                  duration: '6.0s',
                  logs: [...task.logs, `[Lander] [${getNow()}] 所有仿真组及测试任务全部通过。`],
                };
              }
              if (task.id === 'collect_result') {
                return {
                  ...task,
                  status: 'running',
                  startedAt: getNow(),
                  logs: [...task.logs, `[Lander] [${getNow()}] 开始收集 VCS 仿真日志与波形数据。`],
                };
              }
              return task;
            });
            return {
              ...prev,
              tasks: updatedTasks,
            };
          });

          schedule(1500, () => {
            patchTask('collect_result', (t) => ({
              status: 'success',
              finishedAt: getNow(),
              duration: '1.5s',
              logs: [...t.logs, `[Lander] [${getNow()}] 数据收集完成，生成 verify_run 结果归档。`],
            }));
            appendLog('[Lander] collect_result 执行成功。');

            setRuntime((prev: any) => ({
              ...prev,
              tasks: prev.tasks.map((task: any) => {
                if (task.id === 'parse_report') {
                  return {
                    ...task,
                    status: 'running',
                    startedAt: getNow(),
                    logs: [...task.logs, `[Lander] [${getNow()}] 解析 VCS 测试结果，统计通过率。`],
                  };
                }
                return task;
              }),
            }));

            schedule(1500, () => {
              patchTask('parse_report', (t) => ({
                status: 'success',
                finishedAt: getNow(),
                duration: '1.5s',
                logs: [...t.logs, `[Lander] [${getNow()}] 报告解析完毕: 7 / 7 testcases PASS (100% Pass Rate)。`],
              }));
              appendLog('[Lander] parse_report 执行成功。');

              setRuntime((prev: any) => ({
                ...prev,
                tasks: prev.tasks.map((task: any) => {
                  if (task.id === 'publish_dashboard') {
                    return {
                      ...task,
                      status: 'running',
                      startedAt: getNow(),
                      logs: [...task.logs, `[Lander] [${getNow()}] 将测试结果推送发布至 IDE 面板系统。`],
                    };
                  }
                  return task;
                }),
              }));

              schedule(1500, () => {
                patchTask('publish_dashboard', (t) => ({
                  status: 'success',
                  finishedAt: getNow(),
                  duration: '1.5s',
                  logs: [...t.logs, `[Lander] [${getNow()}] 验证报告发布成功，远程面板更新完成。`],
                }));
                appendLog('[Lander] publish_dashboard 执行成功。');
                appendLog('[Lander] 流水线执行成功完成。');
                setRunState('completed');
              });
            });
          });
        });
      } else {
        patchTask(taskId, (t) => ({
          status: 'running',
          attempts: t.attempts + 1,
          startedAt: getNow(),
          finishedAt: undefined,
          logs: [...t.logs, `[Lander] [${getNow()}] 手动触发重跑。`],
        }));
        appendLog(`[Lander] ${taskId} 开始重跑。`);
        schedule(1000, () => {
          patchTask(taskId, (t) => ({
            status: 'success',
            finishedAt: getNow(),
            duration: '1.0s',
            logs: [...t.logs, `[Lander] [${getNow()}] 重跑成功。`],
          }));
          appendLog(`[Lander] ${taskId} 重跑成功。`);
        });
      }
    },
  },
};
