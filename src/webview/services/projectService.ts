export interface DftProject {
  id: string;
  name: string;
  rootPath: string;
  owner: string;
  updatedAt: string;
  stage: string;
  description: string;
}

export interface ProjectDashboard {
  projects: DftProject[];
  currentProjectId: string | null;
}

const mockProjects: DftProject[] = [
  {
    id: 'apollo-dft',
    name: 'Apollo DFT',
    rootPath: 'D:/dft/projects/apollo',
    owner: 'DFT Platform',
    updatedAt: '2026-04-26 09:30',
    stage: '85',
    description: '主芯片 DFT 配置、设计流程与验证数据。',
  },
  {
    id: 'nova-mbist',
    name: 'Nova MBIST',
    rootPath: 'D:/dft/projects/nova-mbist',
    owner: 'Memory Team',
    updatedAt: '2026-04-24 18:10',
    stage: '95',
    description: 'MBIST 环境配置、仿真用例和报告归档。',
  },
  {
    id: 'atlas-regression',
    name: 'Atlas Regression',
    rootPath: 'D:/dft/projects/atlas',
    owner: 'Verification Team',
    updatedAt: '2026-04-20 14:45',
    stage: '75',
    description: '回归任务配置、集群资源和日志入口。',
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
