export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'stopped' | 'skipped';

export type PipelineEcoPhase = 'before' | 'after';

export interface PipelineEcoHook {
  phase: PipelineEcoPhase;
  scriptPath?: string;
  status: TaskStatus;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  duration?: string;
  exitCode?: number;
  lastRunSource?: 'pipeline' | 'manual';
}

export interface PipelineEcoRuntime {
  scriptName: string;
  scriptPath?: string;
  before: PipelineEcoHook;
  after: PipelineEcoHook;
}

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
  eco?: PipelineEcoRuntime;
}

export interface PipelineLink {
  source: string;
  target: string;
}

export interface FlowConfig {
  title: string;
  logPrefix: string;
  terminalTitle: string;
  terminalCommand: string;
}

export const pipelineFlowConfigs: Record<'hibist' | 'sailor' | 'verification', FlowConfig> = {
  hibist: {
    title: 'DFTM MBIST Flow',
    logPrefix: '[DFTM]',
    terminalTitle: 'DFTM MBIST Flow 运行终端',
    terminalCommand: 'dftm gen_analysis_env',
  },
  sailor: {
    title: 'Sailor Design Flow',
    logPrefix: '[Sailor]',
    terminalTitle: 'Sailor Design Flow 运行终端',
    terminalCommand: 'sailor gen_cfg -spec norm_input.xlsx',
  },
  verification: {
    title: 'Lander Verification Flow',
    logPrefix: '[Lander]',
    terminalTitle: 'Lander Verification Flow 运行终端',
    terminalCommand: 'lander submit_mode --mode scan_test',
  },
};
