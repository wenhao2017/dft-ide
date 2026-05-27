export type ProjectRepoKey = 'data' | 'hibist' | 'sailor' | 'verification';

export interface ProjectRepoStatus {
  key: ProjectRepoKey;
  gitlabProjectName: string;
  http_url_to_repo?: string;
  status: 'ready' | 'missing' | 'unknown';
  name?: string;
}

export interface DftProject {
  id: string;
  ctmp_id?: number;
  name: string;
  rootPath: string;
  owner: string;
  role: string;
  canManageMembers?: boolean;
  updatedAt: string;
  stage: string;
  description: string;
  repos: ProjectRepoStatus[];
  local_root?: string;
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
    role: 'DFTM',
    canManageMembers: true,
    updatedAt: '2026-04-26 09:30',
    stage: '85',
    description: '主芯片 DFT 配置、设计流程与验证数据。',
    repos: [
      { key: 'data', gitlabProjectName: 'Apollo-DFT_data', status: 'ready' },
      { key: 'hibist', gitlabProjectName: 'Apollo-DFT_hibist', status: 'ready' },
      { key: 'sailor', gitlabProjectName: 'Apollo-DFT_sailor', status: 'ready' },
      { key: 'verification', gitlabProjectName: 'Apollo-DFT_verification', status: 'ready' },
    ],
  },
  {
    id: 'nova-mbist',
    name: 'Nova MBIST',
    rootPath: 'D:/Downloads/nova-mbist',
    owner: 'Memory Team',
    role: 'Member',
    updatedAt: '2026-04-24 18:10',
    stage: '95',
    description: 'MBIST 环境配置、仿真用例和报告归档。',
    repos: [
      { key: 'data', gitlabProjectName: 'Nova-MBIST_data', status: 'ready' },
      { key: 'hibist', gitlabProjectName: 'Nova-MBIST_hibist', status: 'ready' },
      { key: 'sailor', gitlabProjectName: 'Nova-MBIST_sailor', status: 'ready' },
      { key: 'verification', gitlabProjectName: 'Nova-MBIST_verification', status: 'ready' },
    ],
  },
  {
    id: 'atlas-regression',
    name: 'Atlas Regression',
    rootPath: 'D:/dft/projects/atlas-regression',
    owner: 'Verification Team',
    role: 'Member',
    updatedAt: '2026-04-20 14:45',
    stage: '75',
    description: '回归任务配置、集群资源和日志入口。',
    repos: [
      { key: 'data', gitlabProjectName: 'Atlas-Regression_data', status: 'ready' },
      { key: 'hibist', gitlabProjectName: 'Atlas-Regression_hibist', status: 'ready' },
      { key: 'sailor', gitlabProjectName: 'Atlas-Regression_sailor', status: 'ready' },
      { key: 'verification', gitlabProjectName: 'Atlas-Regression_verification', status: 'ready' },
    ],
  },
];

export type ProjectMemberRole = 'DFTM' | 'Member';

export interface ProjectMember {
  employeeId: string;
  role: ProjectMemberRole;
  ctmp: boolean;
  name?: string;
  updatedAt?: string;
}

export interface ProjectMembersResponse {
  members: ProjectMember[];
  canManage?: boolean;
}

const mockProjectMembers: Record<string, ProjectMember[]> = {
  'apollo-dft': [
    { employeeId: 'w00445630', role: 'DFTM', ctmp: true, name: 'Current User', updatedAt: '2026-04-26 09:30' },
    { employeeId: 'w00881234', role: 'Member', ctmp: false, name: 'Design Owner', updatedAt: '2026-04-25 15:20' },
    { employeeId: 'w00995678', role: 'Member', ctmp: false, name: 'Verification Owner', updatedAt: '2026-04-24 11:05' },
  ],
  'nova-mbist': [
    { employeeId: 'w00445630', role: 'Member', ctmp: true, name: 'Current User', updatedAt: '2026-04-24 18:10' },
    { employeeId: 'w00110022', role: 'DFTM', ctmp: true, name: 'Memory Lead', updatedAt: '2026-04-23 13:00' },
  ],
  'atlas-regression': [
    { employeeId: 'w00445630', role: 'Member', ctmp: false, name: 'Current User', updatedAt: '2026-04-20 14:45' },
    { employeeId: 'w00770088', role: 'DFTM', ctmp: true, name: 'Verification Lead', updatedAt: '2026-04-19 10:30' },
  ],
};

export function canManageProjectMembers(project: DftProject): boolean {
  return project.id !== '0' && (project.canManageMembers ?? project.role?.toUpperCase() === 'DFTM');
}

function normalizeProjectRepoKey(value: unknown): ProjectRepoKey | null {
  return value === 'data' || value === 'hibist' || value === 'sailor' || value === 'verification'
    ? value
    : null;
}

function getApiBase(): string | null {
  const configured = (window as unknown as { DFT_IDE_API_BASE?: string }).DFT_IDE_API_BASE;
  return configured?.replace(/\/$/, '') ?? null;
}

export async function initProject(project: DftProject): Promise<boolean> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return false;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/project/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project_name: project.name,
      ctmp_id: project.ctmp_id,
    }),
  });

  if (!response.ok) {
    throw new Error(`Project init failed: ${response.status}`);
  }

  return true;
}

export async function fetchProjectDashboard(currentUser:string | null): Promise<ProjectDashboard> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return {
      projects: mockProjects,
      currentProjectId: mockProjects[0]?.id ?? null,
      currentUser: 'w00445630',
    };
  }

  if (!currentUser) {
    return {
      projects: [],
      currentProjectId: '',
      currentUser: '',
    };
  }

  // const response = await fetch(`${apiBase}/api/dft-ide/projects/dashboard`);
  const url = new URL(`${apiBase}/api/dft-ide/projects/`);
  url.searchParams.append('user_id', currentUser);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Project API failed: ${response.status}`);
  }

  // return response.json() as Promise<ProjectDashboard>;
  const data = await response.json();
  const projectDashboard: ProjectDashboard = {
    projects: data.projects.map((project:DftProject) => ({
      id: project.id.toString(),
      ctmp_id: project.ctmp_id,
      name: project.name,
      role: project.role,
      rootPath: project.rootPath || '',
      local_root: project.local_root,
      owner: project.owner || '',
      canManageMembers: canManageProjectMembers(project),
      updatedAt: project.updatedAt || '',
      stage: project.stage || '',
      description: project.description || '',
      repos: (project.repos || [])
        .map((repo): ProjectRepoStatus | null => {
          const key = normalizeProjectRepoKey(repo.key);
          if (!key) return null;
          return {
            ...repo,
            key,
            gitlabProjectName: repo.gitlabProjectName || repo.name || '',
          };
        })
        .filter((repo): repo is ProjectRepoStatus => Boolean(repo)),
    })),
    currentProjectId: data.currentProjectId || (data.projects.length > 0 ? data.projects[0].id : null),
    currentUser: currentUser,
  };

  return projectDashboard;
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

export async function fetchProjectMembers(projectId: string): Promise<ProjectMembersResponse> {
  const apiBase = getApiBase();
  if (!apiBase) {
    const project = mockProjects.find((item) => item.id === projectId);
    return {
      members: mockProjectMembers[projectId] ?? [],
      canManage: project ? canManageProjectMembers(project) : false,
    };
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/members`);
  if (!response.ok) {
    throw new Error(`Fetch project members failed: ${response.status}`);
  }

  // return response.json() as Promise<ProjectMembersResponse>;
  const data = await response.json();
  const projectMembers: ProjectMembersResponse = {
    members: data as ProjectMember[],
  };

  return projectMembers;
}

export async function addProjectMember(projectId: string, member: ProjectMember): Promise<ProjectMember> {
  const apiBase = getApiBase();
  if (!apiBase) {
    const members = mockProjectMembers[projectId] ?? [];
    if (members.some((item) => item.employeeId === member.employeeId)) {
      throw new Error(`Member already exists: ${member.employeeId}`);
    }
    const next = { ...member, updatedAt: new Date().toLocaleString() };
    mockProjectMembers[projectId] = [...members, next];
    return next;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/members/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(member),
  });
  if (!response.ok) {
    throw new Error(`Add project member failed: ${response.status}`);
  }

  return response.json() as Promise<ProjectMember>;
}

export async function updateProjectMember(projectId: string, employeeId: string, member: ProjectMember): Promise<ProjectMember> {
  const apiBase = getApiBase();
  if (!apiBase) {
    const members = mockProjectMembers[projectId] ?? [];
    const next = { ...member, employeeId, updatedAt: new Date().toLocaleString() };
    mockProjectMembers[projectId] = members.map((item) => item.employeeId === employeeId ? next : item);
    return next;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/members/${encodeURIComponent(employeeId)}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(member),
  });
  if (!response.ok) {
    throw new Error(`Update project member failed: ${response.status}`);
  }

  return response.json() as Promise<ProjectMember>;
}

export async function deleteProjectMember(projectId: string, employeeId: string): Promise<{ success: boolean }> {
  const apiBase = getApiBase();
  if (!apiBase) {
    const members = mockProjectMembers[projectId] ?? [];
    const target = members.find((item) => item.employeeId === employeeId);
    if (!target) {
      throw new Error('Project member not found');
    }
    if (target?.ctmp) {
      throw new Error('CTMP member cannot be deleted');
    }
    mockProjectMembers[projectId] = members.filter((item) => item.employeeId !== employeeId);
    return { success: true };
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/members/${encodeURIComponent(employeeId)}/`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Delete project member failed: ${response.status}`);
  }

  return response.json() as Promise<{ success: boolean }>;
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

export async function updateProjectRootPath(projectId: string, employeeId: string, porjectRootPath : string): Promise<{ success: boolean }> {
  const apiBase = getApiBase();
  if (!apiBase) {
    console.log('[Mock] Uploading ProjectRootPath data for project:', projectId, porjectRootPath);
    return { success: true };
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/members/${encodeURIComponent(employeeId)}/local_root/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ local_root: porjectRootPath }),
  });
  if (!response.ok) {
    throw new Error(`Update project rootPath failed: ${response.status}`);
  }

  return response.json() as Promise<{ success: boolean}>;
}
