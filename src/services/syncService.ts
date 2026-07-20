import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { gitService } from './gitService';
import { pathExists, readJsonFile, isRecord } from './utils';
import {
  resolveConfigPath,
  getProjectRepoRoot,
  normalizeProjectRepo,
  resolveProjectRoot,
} from './workspaceService';
import { mergeConfigFile } from './configService';
import { resolveDesignTreeFilePath } from './designTreeService';
import {
  buildCommonSyncArtifacts,
  isSpreadsheetFile,
} from './commonSyncArtifacts';
import {
  buildWorkbookDiffItemsInWorker,
  copyWorkbookArtifactIfChangedInWorker,
  mergeWorkbookArtifactInWorker,
} from './commonWorkbookWorkerClient';

const repoLabels: Record<'hibist' | 'sailor' | 'data' | 'verification', string> = {
  hibist: 'Hibist 仓库',
  sailor: 'Sailor 仓库',
  data: 'Data 公共仓',
  verification: '验证仓库',
};

export type ProjectRepoKey = 'hibist' | 'sailor' | 'data' | 'verification';
export type FriendlyRepoState =
  | 'checking'
  | 'synced'
  | 'cloudUpdates'
  | 'localChanges'
  | 'localCommits'
  | 'bothChanged'
  | 'conflict'
  | 'operationInProgress'
  | 'noRemote'
  | 'unavailable';

export interface RepoGitInfoForWebview {
  repo: 'hibist' | 'sailor' | 'data' | 'verification';
  repoRoot?: string;
  branch?: string;
  upstream?: string;
  commit?: string;
  hasChanges?: boolean;
  changedCount?: number;
  changedFiles?: Array<{ path: string; type: string }>;
  stagedCount?: number;
  unstagedCount?: number;
  conflictCount?: number;
  ahead?: number;
  behind?: number;
  remoteChecked?: boolean;
  operationInProgress?: boolean;
  friendlyState?: FriendlyRepoState;
  statusText?: string;
  checkedAt?: string;
  error?: string;
}

export function classifyFriendlyRepoState(info: {
  upstream?: string;
  hasChanges?: boolean;
  conflictCount?: number;
  ahead?: number;
  behind?: number;
  remoteChecked?: boolean;
  operationInProgress?: boolean;
}): { state: FriendlyRepoState; text: string } {
  if (info.conflictCount) return { state: 'conflict', text: `有 ${info.conflictCount} 个文件需要处理` };
  if (info.operationInProgress) return { state: 'operationInProgress', text: '有未完成的仓库操作' };
  if (!info.upstream) return { state: 'noRemote', text: '尚未连接云端分支' };
  if (!info.remoteChecked) return { state: 'checking', text: '正在检查云端状态' };
  const ahead = info.ahead ?? 0;
  const behind = info.behind ?? 0;
  if ((ahead > 0 && behind > 0) || (behind > 0 && info.hasChanges)) {
    return { state: 'bothChanged', text: '本地和云端都有更新' };
  }
  if (behind > 0) return { state: 'cloudUpdates', text: `云端有更新（${behind} 项）` };
  if (info.hasChanges) return { state: 'localChanges', text: '本地有修改未上传' };
  if (ahead > 0) return { state: 'localCommits', text: `有 ${ahead} 项内容等待上传` };
  return { state: 'synced', text: '已是最新' };
}

export async function getRepoGitInfoForWebview(repo: ProjectRepoKey, refreshRemote = false): Promise<RepoGitInfoForWebview> {
  try {
    const repoRoot = getProjectRepoRoot(repo);
    const resource = vscode.Uri.file(repoRoot);
    let info;
    let refreshError: string | undefined;
    if (refreshRemote) {
      try {
        info = await gitService.refreshCurrentGitInfo(resource);
      } catch (error) {
        refreshError = error instanceof Error ? error.message : String(error);
        info = await gitService.getCurrentGitInfo(resource);
      }
    } else {
      info = await gitService.getCurrentGitInfo(resource);
    }
    if (!info) {
      return {
        repo,
        repoRoot,
        friendlyState: 'unavailable',
        statusText: '未识别到本地仓库',
        remoteChecked: false,
        checkedAt: new Date().toISOString(),
        error: '未找到对应的 Git 仓库，请确认项目工作区已包含此仓库。',
      };
    }
    const classification = classifyFriendlyRepoState({
      upstream: info.upstream,
      hasChanges: info.hasChanges,
      conflictCount: info.conflictCount,
      ahead: info.ahead,
      behind: info.behind,
      remoteChecked: refreshRemote && !refreshError,
      operationInProgress: info.operationInProgress,
    });
    const changedFiles = Array.from(
      new Map(
        [...info.changedFiles]
          .sort((left, right) => {
            const priority = { index: 0, workingTree: 1, merge: 2, unknown: -1 } as const;
            return priority[left.type] - priority[right.type];
          })
          .map((file) => [file.path.toLocaleLowerCase(), { path: file.path, type: file.type }])
      ).values()
    );
    return {
      repo,
      repoRoot,
      branch: info.branch,
      upstream: info.upstream,
      commit: info.commit,
      hasChanges: info.hasChanges,
      changedCount: changedFiles.length,
      changedFiles,
      stagedCount: info.stagedCount,
      unstagedCount: info.unstagedCount,
      conflictCount: info.conflictCount,
      ahead: info.ahead,
      behind: info.behind,
      remoteChecked: refreshRemote && !refreshError,
      operationInProgress: info.operationInProgress,
      friendlyState: refreshError ? 'unavailable' : classification.state,
      statusText: refreshError ? '暂时无法检查云端' : classification.text,
      checkedAt: new Date().toISOString(),
      error: refreshError,
    };
  } catch (error) {
    return {
      repo,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

type GuidedConflictPhase = 'resolving' | 'readyToUpload' | 'completed' | 'aborted' | 'error';

export interface GuidedConflictStatus {
  repo: ProjectRepoKey;
  phase: GuidedConflictPhase;
  localCheckpointCreated: boolean;
  cloudContentFetched: boolean;
  conflicts: Array<{ path: string; name: string; spreadsheet: boolean }>;
  message: string;
  error?: string;
}

const guidedConflictSessions = new Map<ProjectRepoKey, GuidedConflictStatus>();
const repoOperationQueues = new Map<ProjectRepoKey, Promise<void>>();

async function withRepoOperation<T>(repo: ProjectRepoKey, task: () => Promise<T>): Promise<T> {
  const previous = repoOperationQueues.get(repo) ?? Promise.resolve();
  let release!: () => void;
  const marker = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => marker);
  repoOperationQueues.set(repo, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (repoOperationQueues.get(repo) === queued) repoOperationQueues.delete(repo);
  }
}

function assertDataWritePermission(repo: ProjectRepoKey, canManageData: boolean): void {
  if (repo === 'data' && !canManageData) {
    throw new Error('只有 DFTM 管理员可以向 Data 公共仓库上传内容。');
  }
}

function uniqueChangedFiles(files: Array<{ path: string; uri: vscode.Uri }>): Array<{ path: string; uri: vscode.Uri }> {
  return Array.from(new Map(files.map((file) => [file.path, file])).values());
}

export async function performFriendlyRepoAction(
  repo: ProjectRepoKey,
  action: 'update' | 'uploadCommits' | 'submitAndUpload',
  options: { canManageData: boolean; message?: string }
): Promise<{ success: boolean; cancelled?: boolean; message: string; info: RepoGitInfoForWebview }> {
  return withRepoOperation(repo, async () => {
    const resource = vscode.Uri.file(getProjectRepoRoot(repo));
    let info = await gitService.refreshCurrentGitInfo(resource);
    if (!info) throw new Error('未找到本地仓库。');
    if (info.conflictCount > 0 || info.operationInProgress) {
      throw new Error('仓库中有尚未处理完成的修改，请先完成处理。');
    }

    if (action === 'update') {
      if (info.hasChanges || (info.ahead > 0 && info.behind > 0)) {
        throw new Error('本地和云端都有修改，请使用“开始处理”按引导完成合并。');
      }
      if (info.behind > 0) await gitService.pull(resource);
      return {
        success: true,
        message: info.behind > 0 ? '云端内容已更新到本地。' : '当前已经是最新内容。',
        info: await getRepoGitInfoForWebview(repo, true),
      };
    }

    assertDataWritePermission(repo, options.canManageData);
    if (info.behind > 0) {
      throw new Error('云端已有其他人上传的新内容，请先处理云端更新。');
    }

    if (action === 'submitAndUpload' && info.hasChanges) {
      const files = uniqueChangedFiles(info.changedFiles);
      const detail = files.slice(0, 12).map((file) => `• ${vscode.workspace.asRelativePath(file.uri)}`).join('\n')
        + (files.length > 12 ? `\n…另有 ${files.length - 12} 个文件` : '');
      const choice = await vscode.window.showWarningMessage(
        `将把 ${files.length} 个本地修改提交并上传到 ${repoLabels[repo]}。`,
        { modal: true, detail },
        '提交并上传',
        '查看修改'
      );
      if (choice === '查看修改') {
        await gitService.openSourceControl();
        return { success: false, cancelled: true, message: '已打开修改详情。', info: await getRepoGitInfoForWebview(repo, false) };
      }
      if (choice !== '提交并上传') {
        return { success: false, cancelled: true, message: '已取消上传。', info: await getRepoGitInfoForWebview(repo, false) };
      }
      await gitService.addFiles(files.map((file) => file.uri), resource);
      await gitService.commit(buildRepoCloudCommitMessage(repo, options.message), resource);
      info = (await gitService.getCurrentGitInfo(resource)) ?? info;
    }

    if (info.ahead > 0 || action === 'submitAndUpload') {
      await gitService.push(resource);
    }
    return {
      success: true,
      message: '本地内容已上传到云端。',
      info: await getRepoGitInfoForWebview(repo, true),
    };
  });
}

async function refreshGuidedConflicts(repo: ProjectRepoKey): Promise<GuidedConflictStatus | undefined> {
  const session = guidedConflictSessions.get(repo);
  if (!session || session.phase === 'completed' || session.phase === 'aborted') return session;
  const conflicts = await gitService.getUnmergedFiles(vscode.Uri.file(getProjectRepoRoot(repo)));
  session.conflicts = conflicts.map((uri) => ({
    path: uri.fsPath,
    name: path.basename(uri.fsPath),
    spreadsheet: isSpreadsheetFile(uri.fsPath),
  }));
  if (session.conflicts.length === 0 && session.phase === 'resolving') {
    session.phase = 'readyToUpload';
    session.message = '所有重叠修改都已处理，可以完成合并并上传。';
  }
  return session;
}

export async function startGuidedRepoSync(
  repo: ProjectRepoKey,
  options: { canManageData: boolean; message?: string }
): Promise<GuidedConflictStatus> {
  return withRepoOperation(repo, async () => {
    assertDataWritePermission(repo, options.canManageData);
    const resource = vscode.Uri.file(getProjectRepoRoot(repo));
    let info = await gitService.refreshCurrentGitInfo(resource);
    if (!info) throw new Error('未找到本地仓库。');
    const existingConflicts = await gitService.getUnmergedFiles(resource);
    const mergeInProgress = await gitService.isMergeInProgress(resource);
    if (info.operationInProgress && !mergeInProgress) {
      throw new Error('仓库中有未完成的操作，请先在“查看修改详情”中完成或取消。');
    }
    if (mergeInProgress && existingConflicts.length === 0) {
      const recoveredSession: GuidedConflictStatus = {
        repo,
        phase: 'readyToUpload',
        localCheckpointCreated: false,
        cloudContentFetched: true,
        conflicts: [],
        message: '重叠修改已经处理完成，可以完成合并并上传。',
      };
      guidedConflictSessions.set(repo, recoveredSession);
      return recoveredSession;
    }
    let checkpointCreated = false;

    if (existingConflicts.length === 0 && info.hasChanges) {
      const files = uniqueChangedFiles(info.changedFiles);
      const choice = await vscode.window.showWarningMessage(
        `需要先保护 ${files.length} 个本地修改，再获取云端内容。这个保存点暂时不会上传。`,
        { modal: true },
        '保存本地修改并继续',
        '查看修改'
      );
      if (choice === '查看修改') {
        await gitService.openSourceControl();
        throw new Error('请查看本地修改，确认后重新开始处理。');
      }
      if (choice !== '保存本地修改并继续') throw new Error('已取消处理。');
      await gitService.addFiles(files.map((file) => file.uri), resource);
      await gitService.commit(options.message?.trim() || `chore(dft-ide): save local ${repo} changes before cloud update`, resource);
      checkpointCreated = true;
      info = (await gitService.refreshCurrentGitInfo(resource)) ?? info;
    }

    if (existingConflicts.length === 0 && info.behind > 0) {
      if (!info.upstream) throw new Error('当前工作版本尚未连接云端分支。');
      try {
        await gitService.mergeRemoteBranch(info.upstream, resource);
      } catch (error) {
        const conflicts = await gitService.getUnmergedFiles(resource);
        if (conflicts.length === 0) throw error;
      }
    }

    const conflicts = await gitService.getUnmergedFiles(resource);
    const session: GuidedConflictStatus = {
      repo,
      phase: conflicts.length > 0 ? 'resolving' : 'readyToUpload',
      localCheckpointCreated: checkpointCreated,
      cloudContentFetched: true,
      conflicts: conflicts.map((uri) => ({ path: uri.fsPath, name: path.basename(uri.fsPath), spreadsheet: isSpreadsheetFile(uri.fsPath) })),
      message: conflicts.length > 0
        ? `还有 ${conflicts.length} 个文件需要确认。`
        : '本地和云端内容已合并，可以上传结果。',
    };
    guidedConflictSessions.set(repo, session);
    return session;
  });
}

export async function getGuidedRepoSyncStatus(repo: ProjectRepoKey): Promise<GuidedConflictStatus | undefined> {
  return refreshGuidedConflicts(repo);
}

export async function openNextGuidedConflict(repo: ProjectRepoKey): Promise<GuidedConflictStatus> {
  const session = await refreshGuidedConflicts(repo);
  if (!session) throw new Error('当前没有正在处理的修改。');
  await gitService.openSourceControl();
  const next = session.conflicts[0];
  if (next) {
    const uri = vscode.Uri.file(next.path);
    if (next.spreadsheet) {
      await vscode.commands.executeCommand('vscode.openWith', uri, 'dftIde.spreadsheet');
      void vscode.window.showInformationMessage('这是 Excel 冲突文件，请在 Common 引导中选择保留本地或云端版本。');
    } else {
      await gitService.openMergeConflict(uri, vscode.Uri.file(getProjectRepoRoot(repo)));
      void vscode.window.showInformationMessage('请在编辑器中确认本地和云端内容，并完成这个文件的冲突处理。');
    }
  }
  return session;
}

export async function resolveGuidedSpreadsheetConflict(
  repo: ProjectRepoKey,
  filePath: string,
  resolution: 'local' | 'cloud'
): Promise<GuidedConflictStatus> {
  const session = await refreshGuidedConflicts(repo);
  const conflict = session?.conflicts.find((item) => item.path === filePath && item.spreadsheet);
  if (!session || !conflict) throw new Error('没有找到对应的 Excel 冲突文件。');
  await gitService.resolveConflictFile(vscode.Uri.file(filePath), resolution, vscode.Uri.file(getProjectRepoRoot(repo)));
  return (await refreshGuidedConflicts(repo))!;
}

export async function completeGuidedRepoSync(repo: ProjectRepoKey, canManageData: boolean): Promise<GuidedConflictStatus> {
  return withRepoOperation(repo, async () => {
    assertDataWritePermission(repo, canManageData);
    const session = await refreshGuidedConflicts(repo);
    if (!session) throw new Error('当前没有正在处理的修改。');
    if (session.conflicts.length > 0) throw new Error(`还有 ${session.conflicts.length} 个文件需要处理。`);
    const resource = vscode.Uri.file(getProjectRepoRoot(repo));
    if (await gitService.isMergeInProgress(resource)) {
      await gitService.commit(`chore(dft-ide): combine local and cloud ${repo} updates`, resource);
    }
    const info = await gitService.refreshCurrentGitInfo(resource);
    if (info && info.behind > 0) throw new Error('云端又有了新的内容，请重新检查后继续。');
    if (info && info.ahead > 0) await gitService.push(resource);
    session.phase = 'completed';
    session.message = '合并结果已上传，本地和云端内容一致。';
    return session;
  });
}

export async function abortGuidedRepoSync(repo: ProjectRepoKey): Promise<GuidedConflictStatus> {
  return withRepoOperation(repo, async () => {
    const session = guidedConflictSessions.get(repo);
    if (!session) throw new Error('当前没有正在处理的修改。');
    if (session.phase !== 'resolving') {
      throw new Error('内容已经合并完成；如不希望上传，请先查看修改详情并由管理员决定后续处理。');
    }
    const choice = await vscode.window.showWarningMessage(
      '放弃后会撤销本次云端合并，本地保存点仍会保留。',
      { modal: true },
      '确认放弃'
    );
    if (choice !== '确认放弃') return session;
    const resource = vscode.Uri.file(getProjectRepoRoot(repo));
    if (await gitService.isMergeInProgress(resource)) await gitService.abortMerge(resource);
    session.phase = 'aborted';
    session.message = '已放弃本次合并，本地修改仍然保留。';
    return session;
  });
}

export type RepoCloudSubmitResult = {
  success: boolean;
  state: 'clean' | 'committed' | 'pushed' | 'needsPull' | 'conflict' | 'gitOperationInProgress' | 'noRepo' | 'noRemote' | 'error';
  repo: 'hibist' | 'sailor' | 'data' | 'verification';
  repoRoot?: string;
  branch?: string;
  upstream?: string;
  changedCount?: number;
  conflictFiles?: Array<{ path: string; type: string }>;
  commitMessage?: string;
  error?: string;
};

export async function submitRepoToCloud(
  repo: 'hibist' | 'sailor' | 'data' | 'verification',
  options: { message?: string; pullBeforePush?: boolean }
): Promise<RepoCloudSubmitResult> {
  const repoRoot = getProjectRepoRoot(repo);
  const resource = vscode.Uri.file(repoRoot);
  await vscode.workspace.fs.stat(resource);

  let gitInfo = await gitService.getCurrentGitInfo(resource);
  if (!gitInfo) {
    return {
      success: false,
      state: 'noRepo',
      repo,
      repoRoot,
      error: `${repo} repository is not a Git repository.`
    };
  }

  const repository = await gitService.getCurrentRepository(resource);
  if (isGitOperationInProgress(repository)) {
    return {
      success: false,
      state: 'gitOperationInProgress',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      error: 'Git is already in the middle of another operation. Please finish it in VS Code Git first.'
    };
  }

  const conflictFiles = gitInfo.changedFiles.filter((file) => file.type === 'merge');
  if (conflictFiles.length > 0) {
    return {
      success: false,
      state: 'conflict',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      conflictFiles: conflictFiles.map((file) => ({ path: file.path, type: file.type })),
      error: 'Conflict files must be resolved before submitting to cloud.'
    };
  }

  if (!hasRemote(repository, gitInfo)) {
    return {
      success: false,
      state: 'noRemote',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      error: 'No remote repository is configured for this flow repository.'
    };
  }

  if (!gitInfo.hasChanges && !hasOutgoingCommits(repository)) {
    return {
      success: true,
      state: 'clean',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: 0
    };
  }

  const commitMessage = buildRepoCloudCommitMessage(repo, options.message);
  let committed = false;

  if (gitInfo.hasChanges) {
    await gitService.addFiles(gitInfo.changedFiles.map((file) => file.uri), resource);
    await gitService.commit(commitMessage, resource);
    committed = true;
  }

  if (options.pullBeforePush) {
    try {
      await gitService.pull(resource);
    } catch (error) {
      gitInfo = await gitService.getCurrentGitInfo(resource);
      const postPullConflicts = gitInfo?.changedFiles.filter((file) => file.type === 'merge') ?? [];
      if (postPullConflicts.length > 0) {
        return {
          success: false,
          state: 'conflict',
          repo,
          repoRoot,
          branch: gitInfo?.branch,
          upstream: gitInfo?.upstream,
          changedCount: gitInfo?.changedFiles.length ?? 0,
          conflictFiles: postPullConflicts.map((file) => ({ path: file.path, type: file.type })),
          commitMessage: committed ? commitMessage : undefined,
          error: 'Remote sync created conflicts. Resolve them and continue submitting.'
        };
      }
      throw error;
    }
  }

  try {
    await gitService.push(resource);
    return {
      success: true,
      state: 'pushed',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      commitMessage: committed ? commitMessage : undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (isRemoteBehindError(errorMessage)) {
      return {
        success: false,
        state: 'needsPull',
        repo,
        repoRoot,
        branch: gitInfo.branch,
        upstream: gitInfo.upstream,
        changedCount: gitInfo.changedFiles.length,
        commitMessage: committed ? commitMessage : undefined,
        error: 'Remote has newer commits. Sync remote changes and continue.'
      };
    }
    return {
      success: false,
      state: 'error',
      repo,
      repoRoot,
      branch: gitInfo.branch,
      upstream: gitInfo.upstream,
      changedCount: gitInfo.changedFiles.length,
      commitMessage: committed ? commitMessage : undefined,
      error: errorMessage
    };
  }
}

export async function syncCommonArtifactsToRepo(
  targetRepo: 'hibist' | 'sailor' | 'data' | 'verification',
  source: { designTree: string; normTable: string },
  commitMessage: string,
  push: boolean
): Promise<{ files: Array<{ label: string; path: string; overwritten: boolean }> }> {
  const repoRoot = getProjectRepoRoot(targetRepo);
  // 检查文件夹是否存在，如果不存在则创建
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(repoRoot));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(repoRoot));
    } else {
        throw error;
    }
  }

  const commonPath = resolveConfigPath('common');
  if (!commonPath) {
    throw new Error('Common local-state path is not available.');
  }

  const common = await readJsonFile(commonPath);
  const copiedFiles: Array<{ label: string; path: string; overwritten: boolean }> = [];

  const designTreeTarget = path.join(repoRoot, 'design_tree.mock.json');
  const designTreeSource = resolveDesignTreeFilePath({ ...(common ?? {}), designTree: source.designTree });
  const designTreeCopied = await copyDesignTreeArtifact(designTreeSource, common, designTreeTarget);
  copiedFiles.push({ label: 'Design tree', path: designTreeTarget, overwritten: designTreeCopied });

  if (source.normTable) {
    const normTableSource = path.isAbsolute(source.normTable)
      ? source.normTable
      : path.resolve(resolveProjectRoot() ?? repoRoot, source.normTable);
    const ext = path.extname(normTableSource) || '.json';
    const normTableTarget = path.join(repoRoot, `normalized-table${ext}`);
    const overwritten = await copyFileArtifact(normTableSource, normTableTarget);
    copiedFiles.push({ label: 'Normalized table', path: normTableTarget, overwritten });
  }

  const nextCommon = await mergeConfigFile(commonPath, {
    syncedArtifacts: {
      ...(isRecord(common?.syncedArtifacts) ? common?.syncedArtifacts : {}),
      [targetRepo]: {
        designTree: designTreeTarget,
        normTable: copiedFiles.find((file) => file.label === 'Normalized table')?.path,
        updatedAt: new Date().toISOString()
      }
    }
  });
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(commonPath),
    Buffer.from(JSON.stringify(nextCommon, null, 2), 'utf-8')
  );

  const fileUris = copiedFiles.map((file) => vscode.Uri.file(file.path));
  const filePath = fileUris.map(uri => uri.fsPath);

  const haschangeFiles = await gitService.hasChangedFiles(filePath, vscode.Uri.file(repoRoot));
  if (!haschangeFiles){
    throw new Error("文件没有变更，无需同步");
  }
  await gitService.addFiles(fileUris, vscode.Uri.file(repoRoot));
  await gitService.commit(commitMessage, vscode.Uri.file(repoRoot));
  if (push) {
    await gitService.push(vscode.Uri.file(repoRoot));
  }

  return { files: copiedFiles.map((file) => ({ ...file, path: vscode.workspace.asRelativePath(file.path) })) };
}

export interface SyncPrecheckOptions {
  targetRepo: 'hibist' | 'sailor' | 'data' | 'verification';
  sourceDesignTree: string;
  sourceNormTable: string;
  targetDesignTree: string;
  targetNormTable: string;
  direction: string;
}

export async function prepareCommonArtifactSyncToRepo(options: SyncPrecheckOptions) {
  const { targetRepo, sourceDesignTree, sourceNormTable, targetDesignTree, targetNormTable, direction } = options;
  const repoRoot = getProjectRepoRoot(targetRepo);
  const artifacts = buildCommonSyncArtifacts(repoRoot, [
    { label: 'Design tree', sourcePath: sourceDesignTree, targetPath: targetDesignTree },
    { label: 'Normalized table', sourcePath: sourceNormTable, targetPath: targetNormTable },
  ], resolveProjectRoot());

  if (artifacts.length === 0) {
    throw new Error('Please choose at least one source XLS/XLSX file.');
  }

  const sourceLabel = direction === 'dataToTarget' ? 'Data' : 'Target flow';
  const targetLabel = targetRepo === 'data' ? 'Data' : repoLabels[targetRepo];
  const design = artifacts.find((item) => item.key === 'designTree');
  const norm = artifacts.find((item) => item.key === 'normTable');
  const diffGroups = await Promise.all(
    artifacts.map(async (artifact) => buildWorkbookDiffItemsInWorker(artifact))
  );
  const diffItems = diffGroups.flat();
  const designDiffCount = diffItems.filter((item) => item.fileType === 'designTree').length;
  const normTableDiffCount = diffItems.filter((item) => item.fileType === 'normTable').length;

  return {
    success: true,
    precheck: {
      direction: `${sourceLabel} -> ${targetLabel}`,
      sourceRepo: direction === 'dataToTarget' ? 'data' : 'target',
      targetRepo,
      designTreeSource: design?.source ?? '',
      designTreeTarget: design?.target ?? '',
      designTreeHiddenDir: '',
      designTreeDiffCount: designDiffCount,
      normTableSource: norm?.source ?? '',
      normTableTarget: norm?.target ?? '',
      normTableHiddenDir: '',
      normTableDiffCount: normTableDiffCount,
      files: artifacts.map(({ label, source, target, exists }) => ({ label, source, target, overwritten: exists })),
    },
    diffSummary: {
      designTree: designDiffCount,
      normTable: normTableDiffCount,
    },
    diffItems,
    availableStrategies: ['overwrite', 'autoMerge', 'manualMerge'],
  };
}

export interface SyncApplyOptions {
  targetRepo: 'hibist' | 'sailor' | 'data' | 'verification';
  strategy: string;
  direction: string;
  sourceDesignTree: string;
  sourceNormTable: string;
  targetDesignTree: string;
  targetNormTable: string;
  decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>;
  stageAfterApply?: boolean;
}

export async function applyCommonArtifactSyncToRepo(options: SyncApplyOptions) {
  const {
    targetRepo,
    strategy,
    direction,
    sourceDesignTree,
    sourceNormTable,
    targetDesignTree,
    targetNormTable,
    decisions,
    stageAfterApply
  } = options;

  const repoRoot = getProjectRepoRoot(targetRepo);
  const artifacts = buildCommonSyncArtifacts(repoRoot, [
    { label: 'Design tree', sourcePath: sourceDesignTree, targetPath: targetDesignTree },
    { label: 'Normalized table', sourcePath: sourceNormTable, targetPath: targetNormTable },
  ], resolveProjectRoot());

  if (artifacts.length === 0) {
    throw new Error('Please choose at least one source XLS/XLSX file.');
  }

  const changedFiles: Array<{ label: string; path: string; overwritten: boolean }> = [];

  if (strategy === 'overwrite') {
    for (const artifact of artifacts) {
      const changed = await copyWorkbookArtifactIfChangedInWorker(artifact);
      if (!changed) {
        continue;
      }
      changedFiles.push({
        label: artifact.label,
        path: artifact.target,
        overwritten: artifact.exists,
      });
    }
  } else {
    for (const artifact of artifacts) {
      const changed = await mergeWorkbookArtifactInWorker(artifact, strategy, decisions);
      if (!changed) {
        continue;
      }
      changedFiles.push({
        label: artifact.label,
        path: artifact.target,
        overwritten: artifact.exists,
      });
    }
  }

  if (stageAfterApply) {
    await gitService.addFiles(
      changedFiles.map((file) => vscode.Uri.file(file.path)),
      vscode.Uri.file(repoRoot)
    );
  }

  const resolvedStrategyText = strategy === 'overwrite' ? '直接覆盖' : strategy === 'autoMerge' ? '自动合并' : '手动合并';
  const unresolvedCount = strategy === 'manualMerge'
    ? decisions.length
    : strategy === 'autoMerge'
      ? 0
      : 0;

  const report = {
    strategy: resolvedStrategyText,
    direction,
    backupDir: '',
    changedXls: changedFiles.map((file) => vscode.workspace.asRelativePath(file.path)),
    generatedCsv: [],
    unresolvedCount,
    result: strategy === 'overwrite'
      ? '同步完成：已将真实 XLS/XLSX 源文件复制到目标路径。'
      : '同步完成：已基于真实 Excel 内容完成合并，并直接写入目标 XLS/XLSX 文件。',
  };

  return {
    success: true,
    report,
    artifacts,
    files: changedFiles.map((file) => ({
        label: file.label,
        path: vscode.workspace.asRelativePath(file.path),
        overwritten: file.overwritten,
      })),
  };
}

async function copyDesignTreeArtifact(
  sourcePath: string | undefined,
  common: Record<string, unknown> | null,
  targetPath: string
): Promise<boolean> {
  if (sourcePath) {
    return copyFileArtifact(sourcePath, targetPath);
  }

  const draft = common?.designTreeDraft;
  if (!isRecord(draft)) {
    throw new Error('Design tree file is not configured and no Common draft design tree was found.');
  }

  const overwritten = await pathExists(targetPath);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(targetPath),
    Buffer.from(JSON.stringify(draft, null, 2), 'utf-8')
  );
  return overwritten;
}

async function copyFileArtifact(sourcePath: string, targetPath: string): Promise<boolean> {
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(sourcePath));
  const overwritten = await pathExists(targetPath);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), bytes);
  return overwritten;
}

function hasRemote(repository: any, info: { upstream?: string }): boolean {
  if (info.upstream) {
    return true;
  }
  const remotes = repository?.state?.remotes;
  return Array.isArray(remotes) && remotes.length > 0;
}

function hasOutgoingCommits(repository: any): boolean {
  const ahead = repository?.state?.HEAD?.ahead;
  return typeof ahead === 'number' && ahead > 0;
}

function isGitOperationInProgress(repository: any): boolean {
  const state = repository?.state;
  return Boolean(state?.rebaseCommit || state?.sequencerState);
}

function isRemoteBehindError(message: string): boolean {
  return /non-fast-forward|fetch first|rejected|remote contains work|Updates were rejected|failed to push/i.test(message);
}

function buildRepoCloudCommitMessage(repo: 'hibist' | 'sailor' | 'data' | 'verification', customMessage?: string): string {
  const trimmed = customMessage?.trim();
  if (trimmed) {
    return trimmed;
  }
  const label = repo === 'hibist' ? 'hibist' : repo === 'sailor' ? 'sailor' : repo === 'data' ? 'data' : 'verification';
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `chore(dft-ide): submit ${label} flow to cloud [${now}]`;
}
