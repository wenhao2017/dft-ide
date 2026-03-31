import { create } from 'zustand';

export interface TaskPayload {
  /** 步骤1: 阶段 */
  stage?: string;
  /** 步骤1: 目标模块 */
  module?: string;
  /** 步骤2: 确认的归一化数据 */
  normalizedData?: any[];
  /** 步骤3: 目标工具 */
  tool?: string;
  /** 步骤3: CPU 核数 */
  cpuCores?: number;
  /** 步骤4: 任务 ID */
  jobId?: string;
}

interface WizardState {
  currentStep: number;
  taskPayload: TaskPayload;
  nextStep: () => void;
  prevStep: () => void;
  updatePayload: (data: Partial<TaskPayload>) => void;
  reset: () => void;
}

const useWizardStore = create<WizardState>((set) => ({
  currentStep: 0,
  taskPayload: {},

  nextStep: () =>
    set((state) => ({
      currentStep: Math.min(state.currentStep + 1, 3),
    })),

  prevStep: () =>
    set((state) => ({
      currentStep: Math.max(state.currentStep - 1, 0),
    })),

  updatePayload: (data) =>
    set((state) => ({
      taskPayload: { ...state.taskPayload, ...data },
    })),

  reset: () =>
    set({
      currentStep: 0,
      taskPayload: {},
    }),
}));

export default useWizardStore;
