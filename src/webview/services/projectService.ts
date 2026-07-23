export type ProjectRepoKey = 'data' | 'hibist' | 'sailor' | 'verification';

export function getProjectDomainLabel(domain?: ProjectDomain): string {
  return domain?.name ?? '未配置';
}

export interface ProjectRepoStatus {
  key: ProjectRepoKey;
  gitlabProjectName: string;
  web_url?: string;
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
  domain?: ProjectDomain;
  updatedAt: string;
  stage: string;
  description: string;
  repos: ProjectRepoStatus[];
  local_root?: string;
  is_star?: boolean;
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
    rootPath: 'D:/Downloads',
    owner: 'DFT Platform',
    role: 'DFTM',
    canManageMembers: true,
    domain: { key: '1', name: '联接' },
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
    rootPath: 'D:/Downloads',
    owner: 'Memory Team',
    role: 'Member',
    domain: { key: '2', name: '无线终端' },
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
    rootPath: 'D:/dft/projects',
    owner: 'Verification Team',
    role: 'Member',
    domain: { key: '3', name: '图灵' },
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

export interface UserInfo {
  id: number;
  username: string;
  public_email: string | null;
  name: string;
  state: string;
  locked: boolean;
  avatar_url: string;
  web_url: string;
}

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

export interface ProjectDomain {
  key: string;
  name: string;
  updatedAt?: string;
}

const mockDomains: ProjectDomain[] = [
  { key: 'Kirin', name: '麒麟', updatedAt: '2026-07-20 15:30' },
  { key: 'Network', name: '网络', updatedAt: '2026-07-20 15:30' },
  { key: 'Turing', name: '图灵', updatedAt: '2026-07-20 15:30' },
];

export function canManageProjectMembers(project: DftProject): boolean {
  return project.id !== '0' && (project.canManageMembers ?? project.role?.toUpperCase() === 'DFTM');
}

function normalizeProjectRepoKey(value: unknown): ProjectRepoKey | null {
  return value === 'data' || value === 'hibist' || value === 'sailor' || value === 'verification'
    ? value
    : null;
}

async function responseErrorHandler(response: Response, defaultError: string): Promise<void> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => undefined) as { detail?: string } | undefined;
    const errorMessage = errorData?.detail || `${defaultError}: ${response.status}`;
    throw new Error(errorMessage);
  }
}

function getApiBase(): string | null {
  const configured = (window as unknown as { DFT_IDE_API_BASE?: string }).DFT_IDE_API_BASE;
  return configured?.replace(/\/$/, '') ?? null;
}

export async function createProject(currentUser: string, project: {
  name: string;
  description: string;
}): Promise<boolean> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return false;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/project/create/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: currentUser,
      project_name: project.name,
      description: project.description,
    }),
  });

  await responseErrorHandler(response, 'Project create failed');

  return true;
}

export async function initProject(currentUser: string, project: DftProject): Promise<boolean> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return false;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/project/init/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: currentUser,
      project_name: project.name,
      ctmp_id: project.ctmp_id,
    }),
  });

  await responseErrorHandler(response, 'Project init failed');

  return true;
}

export async function fetchProjectDashboard(currentUser:string): Promise<ProjectDashboard> {
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

  await responseErrorHandler(response, 'Fetch projects failed');

  // return response.json() as Promise<ProjectDashboard>;
  const data = await response.json();
  const projectDashboard: ProjectDashboard = {
    projects: data.projects.map((project:DftProject & { domainCfg?: unknown; domain_cfg?: unknown }) => ({
      id: project.id.toString(),
      ctmp_id: project.ctmp_id,
      name: project.name,
      role: project.role,
      rootPath: project.local_root,
      is_star: project.is_star,
      owner: project.owner || '',
      canManageMembers: canManageProjectMembers(project),
      domain: project.domain,
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
  await responseErrorHandler(response, 'Select project failed');

  return response.json() as Promise<DftProject>;
}

export async function updateProjectDomain(projectId: string, domain: ProjectDomain): Promise<void> {
  const apiBase = getApiBase();
  if (!apiBase) {
    const project = mockProjects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    if (!canManageProjectMembers(project)) {
      throw new Error('只有 DFTM 角色可以管理项目领域');
    }
    project.domain = domain;
    return;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/domain/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  });
  await responseErrorHandler(response, 'Update project domain failed');
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

  const response = await fetch(`${apiBase}/api/dft-ide/projects/${projectId}/members/`);
  await responseErrorHandler(response, 'Fetch project members failed');

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
  await responseErrorHandler(response, 'Add project member failed');

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
  await responseErrorHandler(response, 'Update project member failed');

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
  await responseErrorHandler(response, 'Delete project member failed');

  return response.json() as Promise<{ success: boolean }>;
}

export async function fetchUsers(): Promise<UserInfo[]> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return [];
  }

  const response = await fetch(`${apiBase}/api/dft-ide/users/?state=active`);
  await responseErrorHandler(response, 'Fetch users failed');

  return response.json() as Promise<UserInfo[]>;
}

export async function fetchSingleUser(employeeId: string): Promise<UserInfo | null> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return null;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/users/${employeeId}/`);
  if (!response.ok) {
    // throw new Error(`Fetch user ${employeeId} failed: ${response.status}`);
    return null;
  }

  return response.json() as Promise<UserInfo>;
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

  await responseErrorHandler(response, 'Upload execution data failed');

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
  await responseErrorHandler(response, 'Update project rootPath failed');

  return response.json() as Promise<{ success: boolean}>;
}

// -------------------------------------------- 项目收藏 --------------------------------------------
export async function updateProjectStar(projectId: string, ctmpId: number | undefined, employeeId: string, isStar: boolean): Promise<{ success: boolean }> {
  const apiBase = getApiBase();
  if (!apiBase) {
    console.log('[Mock] Staring project:', projectId, ctmpId, isStar);
    return { success: true };
  }

  const response = await fetch(`${apiBase}/api/dft-ide/project/star/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      ctmp_id: ctmpId,
      user_id: employeeId,
      is_star: isStar
    }),
  });
  await responseErrorHandler(response, 'Star project failed');

  return response.json() as Promise<{ success: boolean }>;
}

// -------------------------------------------- 领域管理 --------------------------------------------
export async function fetchDomains(): Promise<ProjectDomain[]> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return mockDomains;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/domains/`);
  await responseErrorHandler(response, 'Fetch domains failed');

  return response.json() as Promise<ProjectDomain[]>;
}

export async function addDomain(domain: ProjectDomain): Promise<ProjectDomain> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return domain;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/domains/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(domain),
  });
  await responseErrorHandler(response, 'Add domain failed');

  return response.json() as Promise<ProjectDomain>;
}

export async function updateDomain(key: string, domain: ProjectDomain): Promise<ProjectDomain> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return domain;
  }

  const response = await fetch(`${apiBase}/api/dft-ide/domains/${key}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(domain),
  });
  await responseErrorHandler(response, 'Update domain failed');

  return response.json() as Promise<ProjectDomain>;
}

export async function deleteDomain(key: string): Promise<{ success: boolean }> {
  const apiBase = getApiBase();
  if (!apiBase) {
    return { success: true };
  }

  const response = await fetch(`${apiBase}/api/dft-ide/domains/${key}/`, {
    method: 'DELETE',
  });
  await responseErrorHandler(response, 'Delete domain failed');

  return response.json() as Promise<{ success: boolean }>;
}
