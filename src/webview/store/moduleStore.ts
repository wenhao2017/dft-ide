import { create } from 'zustand';

interface FlowModulesStore {
  flowModules: Record<string, string[]>;
  setFlowModules: (flow: string, modules: string[]) => void;
  appendModule: (flow: string, module: string) => void;
  removeModule: (flow: string, module: string) => void;
  clearKey: (flow: string) => void;
}

export const useFlowModulesStore = create<FlowModulesStore>((set) => ({
  flowModules: {},

  setFlowModules: (flow: string, modules: string[]) =>
    set((state) => ({
      flowModules: { ...state.flowModules, [flow]: modules },
    })),

  appendModule: (flow: string, module: string) =>
    set((state) => ({
      flowModules: {
        ...state.flowModules,
        [flow]: [...(state.flowModules[flow] || []), module],
      },
    })),

  removeModule: (flow: string, module: string) =>
    set((state) => ({
      data: {
        ...state.flowModules,
        [flow]: (state.flowModules[flow] || []).filter((v) => v !== module),
      },
    })),

  clearKey: (flow: string) =>
    set((state) => {
      const newData = { ...state.flowModules };
      delete newData[flow];
      return { flowModules: newData };
    }),
}));