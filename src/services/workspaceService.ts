import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  PROJECT_REPOS,
  LOCAL_STATE_DIR_NAME,
  LOCAL_STATE_SUBDIR,
} from './constants';
import { executeFileCommand, pathExists, isRecord } from './utils';
import dayjs from 'dayjs';
import { DftProject } from '../webview/services/projectService';
import { inferDftFlow } from './diagnosticsService';

export function toConfigPathSegment(flow: string): string {
  const normalized = flow.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'default';
}

export function resolveProjectRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  const expectedRoots = [...PROJECT_REPOS];
  const matched = expectedRoots
    .map((name) => folders.find((folder) => folder.name.toLowerCase() === name))
    .filter((folder): folder is vscode.WorkspaceFolder => Boolean(folder));
  const parents = new Set(matched.map((folder) => path.dirname(folder.uri.fsPath)));
  if (matched.length >= 2 && parents.size === 1) {
    return [...parents][0];
  }

  return path.dirname(folders[0].uri.fsPath);
}

export function resolveProjectPath(repo: string): string | undefined {
  const projectRoot = resolveProjectRoot();
  if (projectRoot) {
    const workspacePath = path.join(projectRoot, 'dft-ide.code-workspace');
    try {
      const data = fs.readFileSync(workspacePath, 'utf-8');
      const workspaceConfig = JSON.parse(data);
      const targetFolder = workspaceConfig.folders.find((node: { name: string, path: string }) => node.name === repo);
      return targetFolder ? path.join(projectRoot, targetFolder.path) : undefined;
    } catch (error) {
      console.error('Failed to read file dft-ide.code-workspace:', error);
      return undefined;
    }
  }
  return undefined;
}

export function resolveLocalConfigDirectory(): string | undefined {
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    return undefined;
  }

  return path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR);
}

export function resolveConfigPath(flow: string): string | undefined {
  const dirPath = resolveLocalConfigDirectory();
  if (!dirPath) {
    return undefined;
  }
  const segments = flow.split(/[\\/]+/).map(toConfigPathSegment).filter(Boolean);
  if (segments.length === 0) {
    return path.join(dirPath, 'default.json');
  }
  const fileName = `${segments[segments.length - 1]}.json`;
  return path.join(dirPath, ...segments.slice(0, -1), fileName);
}

export function resolveExecutionCwd(title: string, command: string): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  const flow = inferDftFlow(title, command);
  const preferredName = flow === 'verification' ? 'verification' : flow;
  const preferredFolder = folders.find((folder) => folder.name.toLowerCase() === preferredName);
  if (preferredFolder) {
    return preferredFolder.uri.fsPath;
  }

  return resolveProjectRoot() ?? folders[0].uri.fsPath;
}

export function resolveDefaultProjectName(): string | undefined {
  const projectRoot = resolveProjectRoot();
  if (projectRoot) {
    return path.basename(projectRoot);
  }

  const workspaceName = vscode.workspace.name?.trim();
  return workspaceName || undefined;
}

export function toProjectStateDirectoryName(projectRoot: string): string {
  const normalizedRoot = path.resolve(projectRoot);
  const basename = path.basename(normalizedRoot).trim() || 'project';
  const safeName = basename.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${safeName}-${hashString(normalizedRoot.toLowerCase())}`;
}

export function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeFsPath(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

export function isProjectCurrentlyOpen(projectRoot: string): boolean {
  const currentRoot = resolveProjectRoot();
  if (!currentRoot) {
    return false;
  }

  return normalizeFsPath(currentRoot) === normalizeFsPath(projectRoot);
}

export function getCurrentWorkspaceProjectInfo(): {
  projectRoot: string | null;
  projectName: string | null;
  workspaceName: string | null;
  folders: Array<{ name: string; path: string }>;
} {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const projectRoot = resolveProjectRoot() ?? null;

  return {
    projectRoot,
    projectName: projectRoot ? path.basename(projectRoot) : null,
    workspaceName: vscode.workspace.name ?? null,
    folders: folders.map((folder) => ({
      name: folder.name,
      path: folder.uri.fsPath,
    })),
  };
}

export async function resolveProjectWorkspaceUri(rootPath: string): Promise<vscode.Uri> {
  const normalized = path.resolve(rootPath);
  const uri = vscode.Uri.file(normalized);

  if (normalized.toLowerCase().endsWith('.code-workspace')) {
    await vscode.workspace.fs.stat(uri);
    return uri;
  }

  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.type !== vscode.FileType.Directory) {
    throw new Error(`Project path is not a directory: ${rootPath}`);
  }

  const workspaceUri = vscode.Uri.file(path.join(normalized, 'dft-ide.code-workspace'));
  try {
    await vscode.workspace.fs.stat(workspaceUri);
    return workspaceUri;
  } catch {
    return uri;
  }
}

export async function openProjectWorkspace(rootPath: string): Promise<{ opened: boolean; targetPath: string; alreadyOpen: boolean }> {
  const targetUri = await resolveProjectWorkspaceUri(rootPath);
  const targetRoot = targetUri.fsPath.toLowerCase().endsWith('.code-workspace')
    ? path.dirname(targetUri.fsPath)
    : targetUri.fsPath;

  if (isProjectCurrentlyOpen(targetRoot)) {
    await vscode.commands.executeCommand('dftIde.openFlow', 'Common');
    return {
      opened: false,
      targetPath: targetUri.fsPath,
      alreadyOpen: true,
    };
  }

  await vscode.commands.executeCommand('vscode.openFolder', targetUri, false);
  return {
    opened: true,
    targetPath: targetUri.fsPath,
    alreadyOpen: false,
  };
}

export async function openProjectFromPicker(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: false,
    canSelectFolders: true,
    openLabel: '打开项目'
  });

  if (!picked || picked.length === 0) {
    return;
  }

  await openProjectWorkspace(picked[0].fsPath);
}

export async function createProject(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: false,
    canSelectFolders: true,
    openLabel: '选择项目根目录'
  });

  if (!picked || picked.length === 0) {
    return;
  }

  const selectedRoot = picked[0];
  const projectRoot = vscode.Uri.joinPath(selectedRoot, 'dft-ide-workspace');

  const legacyRoot = vscode.Uri.joinPath(projectRoot, 'data');
  const hibistRoot = vscode.Uri.joinPath(projectRoot, 'hibist');
  const sailorRoot = vscode.Uri.joinPath(projectRoot, 'sailor');
  const verificationRoot = vscode.Uri.joinPath(projectRoot, 'verification');
  const dataRoot = vscode.Uri.joinPath(projectRoot, 'data');

  await vscode.workspace.fs.createDirectory(projectRoot);
  await vscode.workspace.fs.createDirectory(legacyRoot);
  await vscode.workspace.fs.createDirectory(hibistRoot);
  await vscode.workspace.fs.createDirectory(sailorRoot);
  await vscode.workspace.fs.createDirectory(verificationRoot);
  await vscode.workspace.fs.createDirectory(dataRoot);

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(legacyRoot, 'README.md'),
    Buffer.from('# DFT IDE Data Workspace\n')
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(hibistRoot, 'hibist.cfg.json'),
    Buffer.from(JSON.stringify({ tool: 'hibist', stage: '85' }, null, 2))
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(sailorRoot, 'sailor.cfg.json'),
    Buffer.from(JSON.stringify({ tool: 'sailor', stage: '85' }, null, 2))
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(verificationRoot, 'verification.cfg.json'),
    Buffer.from(JSON.stringify({ tool: 'sailor', stage: '85' }, null, 2))
  );

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(dataRoot, 'normalized-table.json'),
    Buffer.from(
      JSON.stringify(
        [
          {
            pin_name: 'temp_en',
            pin_attribute: 'dft_ip_tsensor0_ctrl',
            ctrl_type: 'share_func',
            default_value: 0,
            ip_sim: 1
          }
        ],
        null,
        2
      )
    )
  );

  const workspaceFile = vscode.Uri.joinPath(projectRoot, 'dft-ide.code-workspace');
  const workspaceContent = {
    folders: [
      { name: 'hibist', path: 'hibist' },
      { name: 'sailor', path: 'sailor' },
      { name: 'verification', path: 'verification' },
      { name: 'data', path: 'data' }
    ],
    settings: {
      'workbench.startupEditor': 'none'
    }
  };

  await vscode.workspace.fs.writeFile(
    workspaceFile,
    Buffer.from(JSON.stringify(workspaceContent, null, 2))
  );

  const action = await vscode.window.showInformationMessage(
    'DFT IDE 本地项目已创建，是否立即打开？',
    '打开'
  );

  if (action === '打开') {
    await vscode.commands.executeCommand('vscode.openFolder', workspaceFile, false);
  }
}

export async function getLocalConfigInfo(): Promise<{
  configuredPath: string;
  effectivePath: string | null;
  defaultPath: string | null;
  isDefault: boolean;
  lastSelectedProject?: string;
  filterStarProject?: boolean;
}> {
  const configuredPath = vscode.workspace.getConfiguration('dftIde').get<string>('localProjectsRoot', '').trim();
  const projectRoot = resolveProjectRoot();
  const defaultPath = projectRoot ? path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR) : null;
  const effectivePath = resolveLocalConfigDirectory() ?? null;
  const lastSelectedProject = vscode.workspace.getConfiguration('dftIde').get<string>('lastSelectedProject', '').trim();
  const filterStarProject = vscode.workspace.getConfiguration('dftIde').get<boolean>('filterStarProject', false);

  if (effectivePath) {
    await ensureLocalConfigDirectory(effectivePath);
  }
  if (projectRoot) {
    await ensureLocalStateIgnored(projectRoot, effectivePath ?? undefined);
  }

  return {
    configuredPath,
    effectivePath,
    defaultPath,
    isDefault: !configuredPath,
    lastSelectedProject,
    filterStarProject,
  };
}

export async function updateLocalConfigPath(localPath: string): Promise<void> {
  await vscode.workspace.getConfiguration('dftIde').update(
    'localProjectsRoot',
    localPath || undefined,
    vscode.ConfigurationTarget.Global
  );

  const effectivePath = resolveLocalConfigDirectory();
  if (effectivePath) {
    await ensureLocalConfigDirectory(effectivePath);
  }

  const projectRoot = resolveProjectRoot();
  if (projectRoot) {
    await ensureLocalStateIgnored(projectRoot, effectivePath ?? undefined);
  }
}

export async function initProjectWorkspace(project: DftProject): Promise<string> {
  const projectLocalRoot = project.rootPath.trim();
  if (!projectLocalRoot) {
    throw new Error('Please set the project local root before entering a project.');
  }

  const projectName = project.name;
  const projectDirName = toSafeProjectDirectoryName(project.name);
  const projectPath = path.join(path.resolve(projectLocalRoot), projectDirName);
  const projectRoot = vscode.Uri.file(projectPath);
  await vscode.workspace.fs.createDirectory(projectRoot);

  const repoProjectPrefix = toGitLabProjectPrefix(projectName);
  const repos: Array<{ key: string; gitlabProjectName: string; localPath: string }> = [];
  const folders: Array<{ name: string; path: string }> = [];
  await setGitCredentialHelper();
  for (const repo of PROJECT_REPOS) {
    const repoItem = project.repos.find((item) => item.key === repo);
    if (!repoItem) continue;
    const repoUri = vscode.Uri.joinPath(projectRoot, repoItem.gitlabProjectName);
    try {
      await vscode.workspace.fs.stat(repoUri);
    } catch (error) {
      // Use the git CLI directly so cloning stays in the current VS Code window.
      if (!repoItem.http_url_to_repo) {
        throw new Error(`Missing clone URL for ${repoItem.gitlabProjectName}.`);
      }
      await cloneRepoWithTerminal(repoItem.http_url_to_repo, projectPath);
    }
    await writeFileIfMissing(
      vscode.Uri.joinPath(repoUri, 'README.md'),
      `# ${repoProjectPrefix}_${repo}\n\nLocal placeholder for the GitLab repository \`${repoProjectPrefix}_${repo}\`.\n`
    );
    repos.push({
      key: repo,
      gitlabProjectName: repoItem.gitlabProjectName,
      localPath: repoUri.fsPath,
    });
    folders.push({
      name: repo,
      path: repoItem.gitlabProjectName,
    });
  }

  const localStateUri = vscode.Uri.joinPath(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR);
  await vscode.workspace.fs.createDirectory(localStateUri);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(localStateUri, 'obs'));
  await writeDefaultLocalState(localStateUri, repos);

  await ensureLocalStateIgnored(projectRoot.fsPath, localStateUri.fsPath);

  const workspaceFile = vscode.Uri.joinPath(projectRoot, 'dft-ide.code-workspace');
  const workspaceContent = {
    folders: folders,
    settings: {
      'workbench.startupEditor': 'none'
    }
  };
  await writeFileIfMissing(workspaceFile, JSON.stringify(workspaceContent, null, 2));

  await vscode.workspace.getConfiguration('dftIde').update(
    'lastSelectedProject',
    project.id,
    vscode.ConfigurationTarget.Global
  );

  return projectPath;
}

export async function prepareProjectWorkspace(
  projectName: string,
  projectKey: string
): Promise<{ rootPath: string; workspacePath: string; repos: Array<{ key: string; gitlabProjectName: string; localPath: string }> }> {
  const localProjectsRoot = vscode.workspace.getConfiguration('dftIde').get<string>('localProjectsRoot', '').trim();
  if (!localProjectsRoot) {
    throw new Error('Please set the local projects root before preparing a project.');
  }

  const projectDirName = toSafeProjectDirectoryName(projectKey || projectName);
  const projectRoot = vscode.Uri.file(path.join(path.resolve(localProjectsRoot), projectDirName));
  await vscode.workspace.fs.createDirectory(projectRoot);

  const repoProjectPrefix = toGitLabProjectPrefix(projectName);
  const repos: Array<{ key: string; gitlabProjectName: string; localPath: string }> = [];
  for (const repo of PROJECT_REPOS) {
    const repoUri = vscode.Uri.joinPath(projectRoot, repo);
    await vscode.workspace.fs.createDirectory(repoUri);
    await writeFileIfMissing(
      vscode.Uri.joinPath(repoUri, 'README.md'),
      `# ${repoProjectPrefix}_${repo}\n\nLocal placeholder for the GitLab repository \`${repoProjectPrefix}_${repo}\`.\n`
    );
    repos.push({
      key: repo,
      gitlabProjectName: `${repoProjectPrefix}_${repo}`,
      localPath: repoUri.fsPath,
    });
  }

  const localStateUri = vscode.Uri.joinPath(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR);
  await vscode.workspace.fs.createDirectory(localStateUri);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(localStateUri, 'obs'));
  await ensureLocalStateIgnored(projectRoot.fsPath, localStateUri.fsPath);

  const workspaceFile = vscode.Uri.joinPath(projectRoot, 'dft-ide.code-workspace');
  const workspaceContent = {
    folders: PROJECT_REPOS.map((repo) => ({ name: repo, path: repo })),
    settings: {
      'workbench.startupEditor': 'none'
    }
  };
  await vscode.workspace.fs.writeFile(workspaceFile, Buffer.from(JSON.stringify(workspaceContent, null, 2)));

  vscode.window.showInformationMessage(`DFT IDE 项目初始化完成：${projectName}`);

  return {
    rootPath: projectRoot.fsPath,
    workspacePath: workspaceFile.fsPath,
    repos,
  };
}

export async function cloneRepoWithTerminal(repoUrl: string, projectPath: string) {
  const terminal = vscode.window.createTerminal({
    name: 'Git Clone',
    cwd: projectPath
  });

  await new Promise<void>((resolve, reject) => {
    if ('onDidEndTerminalShellExecution' in vscode.window) {
      const disposable = vscode.window.onDidEndTerminalShellExecution(e => {
        if (e.terminal === terminal) {
          disposable.dispose();
          if (e.exitCode === 0) {
            terminal.dispose();
            resolve();
          } else {
            reject(new Error('Failed to clone the Git repository. See terminal logs for specific error details'));
          }
        }
      });
      terminal.sendText(`git clone ${repoUrl}`);
    } else {
      let output = '';
      const windowWithTerminalData = vscode.window as typeof vscode.window & {
        onDidWriteTerminalData: (
          listener: (event: { terminal: vscode.Terminal; data: string }) => unknown
        ) => vscode.Disposable;
      };
      const disposable = windowWithTerminalData.onDidWriteTerminalData(e => {
        if (e.terminal === terminal) {
          output += e.data;
          const lines = output.replace(/(\r\n|\r)/g, '\n').split('\n');
          const cloneFinishedIndex = lines.indexOf('CLONE_FINISHED');
          if (cloneFinishedIndex > 0) {
            disposable.dispose();
            const result = lines[cloneFinishedIndex - 1].toLowerCase();
            if (result.includes('receiving objects:') || result.includes('unpacking objects:')) {
              terminal.dispose();
              resolve();
            } else if (result.includes('fatal:')) {
              reject(new Error(result));
            } else {
              reject(new Error('Failed to clone the Git repository. See terminal logs for specific error details'));
            }
          }
        }
      });
      terminal.sendText(`git clone ${repoUrl} ; echo "CLONE_FINISHED"`);
    }
  });
}

export async function setGitCredentialHelper() {
  if (process.platform !== 'linux') return;
  try {
    const stdout = await executeFileCommand('git', ['config', '--global', '--get', 'credential.helper']);
    if (!stdout.trim()) {
      throw new Error('No credential helper configured');
    }
  } catch {
    try {
      await executeFileCommand('git', ['config', '--global', 'credential.helper', 'cache --timeout=43200']);
    } catch (error) {
      console.error('Failed to set git credential helper:', error);
    }
  }
}

export async function writeDefaultLocalState(localStateUri: vscode.Uri, repos: {
  key: string,
  gitlabProjectName: string,
  localPath: string,
}[]) {
  for (const repo of repos) {
    const fileName = repo.key === 'data' ? 'common' : repo.key;

    const stateUri = vscode.Uri.joinPath(localStateUri, fileName + '.json');
    let content = '{}';
    try {
      const bytes = await vscode.workspace.fs.readFile(stateUri);
      content = Buffer.from(bytes).toString('utf-8');
    } catch {
      content = '{}';
    }
    const stateObject = JSON.parse(content);

    if (repo.key === 'data') {
      for (const repoKey of PROJECT_REPOS) {
        const localPath = repos.find(obj => obj.key === repoKey)?.localPath;
        if (!localPath) continue;

        let item = stateObject[repoKey];
        if (item == null) {
          item = {}
        }
        if (!item.designTree) {
          const designTreePath = path.join(localPath, 'design_tree.xlsx');
          const isExists = await pathExists(designTreePath);
          if (isExists) {
            item.designTree = designTreePath;
          } else if (repoKey !== 'data') {
            item.designTree = localPath;
          }
        }
        if (!item.normTable) {
          const normTablePath = path.join(localPath, 'normalized_table.xlsx');
          const isExists = await pathExists(normTablePath);
          if (isExists) {
            item.normTable = normTablePath;
          } else if (repoKey !== 'data') {
            item.normTable = localPath;
          }
        }
        stateObject[repoKey] = item;
      }

      await writeFile(stateUri, JSON.stringify(stateObject, null, 2));
    } else {
      if (!stateObject.project) {
        const cshrcFilePath = path.join(repo.localPath, 'project.cshrc');
        const isExists = await pathExists(cshrcFilePath);
        if (isExists) {
          stateObject.project = cshrcFilePath;
          await writeFile(stateUri, JSON.stringify(stateObject, null, 2));
        }
      }
    }

  }
}

export async function writeFile(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
}

export async function writeFileIfMissing(uri: vscode.Uri, content: string): Promise<void> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
  }
}

export function toSafeProjectDirectoryName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dft-project';
}

export function toGitLabProjectPrefix(value: string): string {
  return value.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dft-project';
}

export async function ensureLocalConfigDirectory(dirPath: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
}

export async function ensureLocalStateIgnored(projectRoot: string, effectivePath?: string): Promise<void> {
  const ignoreEntries = new Set<string>([`${LOCAL_STATE_DIR_NAME}/`]);
  if (effectivePath) {
    const relative = path.relative(projectRoot, effectivePath).replace(/\\/g, '/');
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      ignoreEntries.add(relative.endsWith('/') ? relative : `${relative}/`);
    }
  }

  const gitignoreUri = vscode.Uri.file(path.join(projectRoot, '.gitignore'));
  let content = '';
  try {
    const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
    content = Buffer.from(bytes).toString('utf-8');
  } catch {
    content = '';
  }

  const lines = new Set(content.split(/\r?\n/).map((line) => line.trim()));
  const missing = [...ignoreEntries].filter((entry) => !lines.has(entry));
  if (missing.length === 0) {
    return;
  }

  const prefix = content && !content.endsWith('\n') ? '\n' : '';
  const nextContent = `${content}${prefix}\n# DFT IDE local user state\n${missing.join('\n')}\n`;
  await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(nextContent, 'utf-8'));
}

export function normalizeProjectRepo(value: unknown): 'hibist' | 'sailor' | 'data' | 'verification' | undefined {
  return value === 'hibist' || value === 'sailor' || value === 'data' || value === 'verification' ? value : undefined;
}

export function normalizeConfigFlow(value: unknown): 'hibist' | 'sailor' | 'verification' | undefined {
  return value === 'hibist' || value === 'sailor' || value === 'verification' ? value : undefined;
}

export function getProjectRepoRoot(repo: 'hibist' | 'sailor' | 'data' | 'verification'): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const matchedFolder = folders.find((folder) => isRepoFolderName(folder.name, repo));
  if (matchedFolder) {
    return matchedFolder.uri.fsPath;
  }

  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    throw new Error('No DFT project workspace is open.');
  }

  return path.join(projectRoot, repo);
}

export async function getFlowConfigsDirectory(flow: 'hibist' | 'sailor' | 'verification', stage?: string): Promise<string> {
  const repoRoot = await resolveProjectRepoRoot(flow);
  return stage ? path.join(repoRoot, normalizeStageName(stage), flow, 'cfg') : path.join(repoRoot, flow, 'cfg');
}

export function normalizeStageName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Stage name is required.');
  }
  const stage = value.trim();
  if (!stage || stage === '.' || stage === '..' || path.basename(stage) !== stage || !/^[A-Za-z0-9._-]+$/.test(stage)) {
    throw new Error(`Invalid stage name: ${String(value)}`);
  }
  return stage;
}

export async function resolveProjectRepoRoot(repo: 'hibist' | 'sailor' | 'data' | 'verification'): Promise<string> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const matchedFolder = folders.find((folder) => isRepoFolderName(folder.name, repo));
  if (matchedFolder) {
    return matchedFolder.uri.fsPath;
  }

  const projectRoot = resolveProjectRoot();
  if (projectRoot) {
    const siblingRepo = await findSiblingRepoDirectory(projectRoot, repo);
    if (siblingRepo) {
      return siblingRepo;
    }
    const direct = path.join(projectRoot, repo);
    if (await pathExists(direct)) {
      return direct;
    }
    const bySuffix = await findRepoDirectory(projectRoot, repo);
    if (bySuffix) {
      return bySuffix;
    }
  }

  const localProjectsRoot = vscode.workspace.getConfiguration('dftIde').get<string>('localProjectsRoot', '').trim();
  if (localProjectsRoot) {
    const projectId = vscode.workspace.getConfiguration('dftIde').get<string>('lastSelectedProject', '').trim();
    const candidates = await findLocalProjectRoots(localProjectsRoot, projectId);
    for (const candidate of candidates) {
      const repoDir = await findRepoDirectory(candidate, repo);
      if (repoDir) {
        return repoDir;
      }
    }
  }

  if (projectRoot) {
    return path.join(projectRoot, repo);
  }

  throw new Error('No DFT project workspace or local project root is available.');
}

export function isRepoFolderName(name: string, repo: 'hibist' | 'sailor' | 'data' | 'verification'): boolean {
  const normalized = name.toLowerCase();
  return normalized === repo || normalized.endsWith(`_${repo}`);
}

export async function findSiblingRepoDirectory(currentPath: string, repo: 'hibist' | 'sailor' | 'data' | 'verification'): Promise<string | undefined> {
  const currentName = path.basename(currentPath).toLowerCase();
  if (!PROJECT_REPOS.some((item) => isRepoFolderName(currentName, item))) {
    return undefined;
  }
  return findRepoDirectory(path.dirname(currentPath), repo);
}

export async function findLocalProjectRoots(localProjectsRoot: string, projectId: string): Promise<string[]> {
  const root = path.resolve(localProjectsRoot);
  const normalizedProjectId = projectId ? toConfigPathSegment(projectId) : '';
  const roots: string[] = [];

  if (normalizedProjectId) {
    const direct = path.join(root, normalizedProjectId);
    if (await pathExists(direct)) {
      roots.push(direct);
    }
  }

  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(root));
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }
      const fullPath = path.join(root, name);
      if (!normalizedProjectId || toConfigPathSegment(name).includes(normalizedProjectId)) {
        if (!roots.some((item) => normalizeFsPath(item) === normalizeFsPath(fullPath))) {
          roots.push(fullPath);
        }
      }
    }
  } catch {
    // Keep the direct candidate only.
  }

  return roots;
}

export async function findRepoDirectory(projectRoot: string, repo: 'hibist' | 'sailor' | 'data' | 'verification'): Promise<string | undefined> {
  const direct = path.join(projectRoot, repo);
  if (await pathExists(direct)) {
    return direct;
  }

  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(projectRoot));
    const match = entries.find(([name, type]) =>
      type === vscode.FileType.Directory && name.toLowerCase().endsWith(`_${repo}`)
    );
    return match ? path.join(projectRoot, match[0]) : undefined;
  } catch {
    return undefined;
  }
}

export function getSyncedArtifactPath(
  common: Record<string, unknown> | null,
  flow: string | undefined,
  key: 'designTree' | 'normTable'
): string | undefined {
  const normalizedFlow = normalizeProjectRepo(flow);
  if (!normalizedFlow || !common) {
    return undefined;
  }

  const syncedArtifacts = common.syncedArtifacts;
  if (!isRecord(syncedArtifacts)) {
    return undefined;
  }

  const flowArtifacts = syncedArtifacts[normalizedFlow];
  if (!isRecord(flowArtifacts)) {
    return undefined;
  }

  const value = flowArtifacts[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

type TerminalDataEvent = { terminal: vscode.Terminal; data: string };
type TerminalShellEndEvent = { terminal: vscode.Terminal; exitCode?: number };
type WindowWithTerminalEvents = typeof vscode.window & {
  onDidWriteTerminalData?: (
    listener: (event: TerminalDataEvent) => unknown
  ) => vscode.Disposable;
  onDidEndTerminalShellExecution?: (
    listener: (event: TerminalShellEndEvent) => unknown
  ) => vscode.Disposable;
};

const activeDefaultConfigRuns = new Set<string>();
const defaultConfigTimeoutMs = 60 * 60 * 1000;

export interface TransformLog {
  requestId?: string;
  flow: 'hibist' | 'sailor' | 'verification';
  scriptPath: string;
  configPath: string;
  designTree?: string;
  normTable?: string;
  module?: string;
  isAllSelected?: boolean;
  stage?: string;
  landerAssistant?: string;
  timemilles?: string;
  timestamp?: string;
  time?: string;
  logFile?: string;
  success?: boolean;
}

function quoteCshArg(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function getPipelineShellPath(): string {
  const configured = vscode.workspace.getConfiguration('dftIde').get<string>('pipeline.shellPath', 'csh');
  return configured.trim() || 'csh';
}

async function waitForDefaultConfigTerminalReady(terminal: vscode.Terminal): Promise<void> {
  const terminalApi = vscode.window as WindowWithTerminalEvents;
  if (!terminalApi.onDidWriteTerminalData) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let disposable: vscode.Disposable | undefined;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        disposable?.dispose();
        resolve();
      }
    }, 1500);

    disposable = terminalApi.onDidWriteTerminalData!((event) => {
      if (event.terminal !== terminal || settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      disposable?.dispose();
      resolve();
    });
  });
}

export async function doConfigTransform(transformLog: TransformLog): Promise<TransformLog> {
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const timemilles = Date.now().toString();
  const logsDirectory = path.join(transformLog.configPath, '.logs');
  await ensureLocalConfigDirectory(logsDirectory);
  const logFile = path.join(logsDirectory, `${transformLog.flow}-${transformLog.requestId ?? 'request'}-${timemilles}.log`);
  transformLog = { ...transformLog, logFile, timestamp, timemilles };

  const runKey = `${transformLog.flow}:${transformLog.stage ?? ''}`;
  if (activeDefaultConfigRuns.has(runKey)) {
    throw new Error(`${transformLog.flow} 默认配置生成任务正在运行，请等待当前任务完成。`);
  }
  activeDefaultConfigRuns.add(runKey);

  const terminalApi = vscode.window as WindowWithTerminalEvents;
  if (!terminalApi.onDidWriteTerminalData && !terminalApi.onDidEndTerminalShellExecution) {
    activeDefaultConfigRuns.delete(runKey);
    throw new Error('当前 VS Code 环境不支持 terminal 执行完成监控，无法可靠生成默认配置。');
  }

  const marker = `__DFT_IDE_DEFAULT_CONFIG_END__|${transformLog.requestId ?? timemilles}|`;
  const terminal = vscode.window.createTerminal({
    name: `DFT IDE Default Config / ${transformLog.flow} / ${transformLog.requestId ?? timemilles}`,
    cwd: transformLog.configPath,
    shellPath: getPipelineShellPath(),
  });

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let output = '';
      const usesDataMarker = Boolean(terminalApi.onDidWriteTerminalData);
      const disposables: vscode.Disposable[] = [];
      const settle = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        disposables.forEach((item) => item.dispose());
        activeDefaultConfigRuns.delete(runKey);
        if (error) {
          reject(error);
        } else {
          // terminal.dispose();
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        settle(new Error('生成默认配置超时，terminal 仍在运行，请检查脚本输出。'));
      }, defaultConfigTimeoutMs);

      if (terminalApi.onDidWriteTerminalData) {
        disposables.push(terminalApi.onDidWriteTerminalData((event) => {
          if (event.terminal !== terminal) {
            return;
          }
          output = `${output}${event.data}`.slice(-20000);
          const normalized = output.replace(/(\r\n|\r)/g, '\n');
          const markerIndex = normalized.lastIndexOf(marker);
          if (normalized.split((marker)).length - 1 <= 0) {
            return;
          }
          const exitCodeText = normalized.slice(markerIndex + marker.length).match(/-?\d+/);
          if (exitCodeText === undefined) {
            return;
          }
          const exitCode = Number(exitCodeText);
          if (exitCode === 0) {
            settle();
          } else {
            settle(new Error(`生成默认配置脚本执行失败，退出码 ${exitCode}。`));
          }
        }));
      }

      if (terminalApi.onDidEndTerminalShellExecution) {
        disposables.push(terminalApi.onDidEndTerminalShellExecution((event) => {
          if (event.terminal !== terminal || event.exitCode === undefined) {
            return;
          }
          if (!usesDataMarker && event.exitCode === 0) {
            settle();
            return;
          }
          if (event.exitCode !== 0) {
            settle(new Error(`生成默认配置 terminal 执行失败，退出码 ${event.exitCode}。`));
          }
        }));
      }

      const command = getFlowTransformCommand(transformLog, marker);
      void waitForDefaultConfigTerminalReady(terminal).then(() => {
        terminal.sendText(command);
      });
      terminal.show();
    });
  } catch (error) {
    activeDefaultConfigRuns.delete(runKey);
    throw error;
  }
  return transformLog;
}

function getFlowTransformCommand(transformLog: TransformLog, marker: string): string {
  switch (transformLog.flow) {
    case 'verification':
      if (!transformLog.landerAssistant) {
        throw new Error('请选择 LANDER_ASSISTANT.json。');
      }
      return [
        `${quoteCshArg(transformLog.scriptPath)} ${quoteCshArg(transformLog.landerAssistant)} | tee ${quoteCshArg(transformLog.logFile!)}`,
        'set dft_ide_default_config_status = $status',
        `echo "${marker}$dft_ide_default_config_status"`,
      ].join('; ');
    default:
      if (!transformLog.designTree || !transformLog.normTable || !transformLog.module) {
        throw new Error('缺少 design tree、归一化表格或 module。');
      }
      if(transformLog.isAllSelected){
        return [
          `${quoteCshArg(transformLog.scriptPath)} ${quoteCshArg(transformLog.designTree)} ${quoteCshArg(transformLog.normTable)} | tee ${quoteCshArg(transformLog.logFile!)}`,
          'set dft_ide_default_config_status = $status',
          `echo "${marker}$dft_ide_default_config_status"`,
        ].join('; ');
      } else {
        return [
          `${quoteCshArg(transformLog.scriptPath)} ${quoteCshArg(transformLog.designTree)} ${quoteCshArg(transformLog.normTable)} ${quoteCshArg(transformLog.module)} | tee ${quoteCshArg(transformLog.logFile!)}`,
          'set dft_ide_default_config_status = $status',
          `echo "${marker}$dft_ide_default_config_status"`,
        ].join('; ');
      }
      
  }
}

export async function isDirectoryExists(dir: string) {
  try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(dir));
      return stat.type === vscode.FileType.Directory;
  } catch (error) {
      return false;
  }
}

export async function copyDirectory(srcDir: string, destDir: string) {
  try {
      await vscode.workspace.fs.copy(vscode.Uri.file(srcDir), vscode.Uri.file(destDir), { overwrite: true });
  } catch (error) {
      console.error('stage 复制目录失败:', error);
      throw error;
  }
}

export async function getNormalizeTablePath(flow: string): Promise<{ designTree: string; normTable: string }> {
  const normalizedFlow = normalizeProjectRepo(flow);
  if (!normalizedFlow || normalizedFlow === 'data') {
    throw new Error(`不支持的转换流程：${flow}`);
  }

  const filePath = resolveConfigPath('common');
  if (!filePath) {
    throw new Error('未找到 Common 配置文件。');
  }

  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf-8'));
  if (!isRecord(parsed)) {
    throw new Error('Common 配置格式无效。');
  }

  const flowConfig = isRecord(parsed[normalizedFlow]) ? parsed[normalizedFlow] : undefined;
  const designTree = getSyncedArtifactPath(parsed, normalizedFlow, 'designTree')
    ?? (typeof flowConfig?.designTree === 'string' ? flowConfig.designTree.trim() : '');
  const normTable = getSyncedArtifactPath(parsed, normalizedFlow, 'normTable')
    ?? (typeof flowConfig?.normTable === 'string' ? flowConfig.normTable.trim() : '');

  if (!designTree || !normTable) {
    throw new Error(`Common 配置中缺少 ${normalizedFlow} 的 design tree 或归一化表格。`);
  }
  return { designTree, normTable };
}
