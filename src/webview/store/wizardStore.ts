import { create } from 'zustand';
import type { ProjectDomain } from '../services/projectService';

export interface FlowContext {
  category: string;
  projectId?: string;
}

export interface ProjectContext {
  id: string;
  name: string;
  rootPath?: string;
  role?: string;
  canManageMembers?: boolean;
  domain?: ProjectDomain;
}

export interface TaskPayload {
  stage?: string;
  module?: string;
  normalizedData?: any[];
  tool?: string;
  cpuCores?: number;
  jobId?: string;
  gitBranch?: string;
}

interface WizardState {
  currentStep: number;
  taskPayload: TaskPayload;
  flowContext: FlowContext | null;
  activeProject: ProjectContext | null;
  currentUser: string;
  /** Tracks which flows have unsaved changes (优化1: 防丢失) */
  dirtyFlows: Set<string>;
  /** Whether the focused (zen) layout is active (优化5: 专注模式) */
  zenMode: boolean;
  nextStep: () => void;
  prevStep: () => void;
  updatePayload: (data: Partial<TaskPayload>) => void;
  setFlowContext: (context: FlowContext | null) => void;
  setActiveProject: (project: ProjectContext | null) => void;
  setActiveProjectDomain: (domain: ProjectDomain) => void;
  setCurrentUser: (user: string) => void;
  markDirty: (flow: string) => void;
  clearDirty: (flow: string) => void;
  isDirty: (flow?: string) => boolean;
  toggleZenMode: () => void;
  setZenMode: (on: boolean) => void;
  reset: () => void;
}

const useWizardStore = create<WizardState>((set, get) => ({
  currentStep: 0,
  taskPayload: {},
  flowContext: null,
  activeProject: null,
  currentUser: '',
  dirtyFlows: new Set<string>(),
  zenMode: false,

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

  setActiveProject: (project) =>
    set(() => ({
      activeProject: project,
    })),

  setActiveProjectDomain: (domain) =>
    set((state) => ({
      activeProject: state.activeProject ? { ...state.activeProject, domain } : null,
    })),

  setCurrentUser: (user) =>
    set(() => ({
      currentUser: user,
    })),

  markDirty: (flow) =>
    set((state) => {
      const next = new Set(state.dirtyFlows);
      next.add(flow);
      return { dirtyFlows: next };
    }),

  clearDirty: (flow) =>
    set((state) => {
      const next = new Set(state.dirtyFlows);
      next.delete(flow);
      return { dirtyFlows: next };
    }),

  isDirty: (flow) => {
    const { dirtyFlows } = get();
    if (flow) return dirtyFlows.has(flow);
    return dirtyFlows.size > 0;
  },

  toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),
  setZenMode: (on) => set({ zenMode: on }),

  reset: () =>
    set({
      currentStep: 0,
      taskPayload: {},
    }),
}));

export default useWizardStore;
