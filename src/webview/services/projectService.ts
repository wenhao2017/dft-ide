export type ProjectRepoKey = 'data' | 'design' | 'verification';

export interface ProjectRepoStatus {
  key: ProjectRepoKey;
  gitlabProjectName: string;
  status: 'ready' | 'missing' | 'unknown';
}

export interface DftProject {
  id: string;
  name: string;
  rootPath: string;
  owner: string;
  role: string;
  updatedAt: string;
  stage: string;
  description: string;
  repos: ProjectRepoStatus[];
}

export interface ProjectDashboard {
  projects: DftProject[];
  currentProjectId: string | null;
  currentUser: string;
}

const mockProjects: DftProject[] = [
  {
    id: 'apollo-dft',
    name: 'Apollo DFT',
    rootPath: 'D:/Downloads/apollo-dft',
    owner: 'DFT Platform',
    role: 'DFT Lead',
    updatedAt: '2026-04-26 09:30',
    stage: '85',
    description: '主芯片 DFT 配置、设计流程与验证数据。',
    repos: [
      { key: 'data', gitlabProjectName: 'Apollo-DFT_data', status: 'ready' },
      { key: 'design', gitlabProjectName: 'Apollo-DFT_design', status: 'ready' },
      { key: 'verification', gitlabProjectName: 'Apollo-DFT_verification', status: 'ready' },
    ],
  },
  {
    id: 'nova-mbist',
    name: 'Nova MBIST',
    rootPath: 'D:/Downloads/nova-mbist',
    owner: 'Memory Team',
    role: 'Designer',
    updatedAt: '2026-04-24 18:10',
    stage: '95',
    description: 'MBIST 环境配置、仿真用例和报告归档。',
    repos: [
      { key: 'data', gitlabProjectName: 'Nova-MBIST_data', status: 'ready' },
      { key: 'design', gitlabProjectName: 'Nova-MBIST_design', status: 'ready' },
      { key: 'verification', gitlabProjectName: 'Nova-MBIST_verification', status: 'ready' },
    ],
  },
  {
    id: 'atlas-regression',
    name: 'Atlas Regression',
    rootPath: 'D:/dft/projects/atlas-regression',
    owner: 'Verification Team',
    role: 'Verifier',
    updatedAt: '2026-04-20 14:45',
    stage: '75',
    description: '回归任务配置、集群资源和日志入口。',
    repos: [
      { key: 'data', gitlabProjectName: 'Atlas-Regression_data', status: 'ready' },
      { key: 'design', gitlabProjectName: 'Atlas-Regression_design', status: 'ready' },
      { key: 'verification', gitlabProjectName: 'Atlas-Regression_verification', status: 'ready' },
    ],
  },
];

function getApiBase(): string | null {
  const configured = (window as unknown as { DFT_IDE_API_BASE?: string }).DFT_IDE_API_BASE;
  return configured?.replace(/\/$/, '') ?? null;
}

export async function fetchProjectDashboard(): Promise<ProjectDashboard> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return {
      projects: mockProjects,
      currentProjectId: mockProjects[0]?.id ?? null,
      currentUser: 'w00445630',
    };
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/dashboard`);
  if (!response.ok) {
    throw new Error(`Project API failed: ${response.status}`);
  }

  return response.json() as Promise<ProjectDashboard>;
}

export async function selectProject(projectId: string): Promise<DftProject> {
  const apiBase = getApiBase();
  if (!apiBase) {
    const project = mockProjects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/select`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Select project failed: ${response.status}`);
  }

  return response.json() as Promise<DftProject>;
}

export interface ExecutionData {
  flow: string;
  status: 'success' | 'error' | 'cancelled';
  logs: string[];
  metrics?: Record<string, unknown>;
  executedAt: number;
}

export async function uploadExecutionData(projectId: string, data: ExecutionData): Promise<{ success: boolean; id?: string }> {
  const apiBase = getApiBase();
  if (!apiBase) {
    console.log('[Mock] Uploading execution data for project:', projectId, data);
    return { success: true, id: `mock-id-${Date.now()}` };
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/executions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Upload execution data failed: ${response.status}`);
  }

  return response.json() as Promise<{ success: boolean; id?: string }>;
}
