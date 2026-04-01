import { create } from 'zustand';

export interface FlowContext {
  category: string;
}

export interface TaskPayload {
  stage?: string;
  module?: string;
  normalizedData?: any[];
  tool?: string;
  cpuCores?: number;
  jobId?: string;
}

interface WizardState {
  currentStep: number;
  taskPayload: TaskPayload;
  flowContext: FlowContext | null;
  nextStep: () => void;
  prevStep: () => void;
  updatePayload: (data: Partial<TaskPayload>) => void;
  setFlowContext: (context: FlowContext | null) => void;
  reset: () => void;
}

const useWizardStore = create<WizardState>((set) => ({
  currentStep: 0,
  taskPayload: {},
  flowContext: null,

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

  setFlowContext: (context) => 
    set(() => ({
      flowContext: context,
    })),

  reset: () =>
    set({
      currentStep: 0,
      taskPayload: {},
    }),
}));

export default useWizardStore;
