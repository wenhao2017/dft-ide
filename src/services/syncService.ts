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

export async function getRepoGitInfoForWebview(repo: 'hibist' | 'sailor' | 'data' | 'verification'): Promise<{
  repo: 'hibist' | 'sailor' | 'data' | 'verification';
  repoRoot?: string;
  branch?: string;
  upstream?: string;
  hasChanges?: boolean;
  changedCount?: number;
  changedFiles?: Array<{ path: string; type: string }>;
  error?: string;
}> {
  try {
    const repoRoot = getProjectRepoRoot(repo);
    const info = await gitService.getCurrentGitInfo(vscode.Uri.file(repoRoot));
    return {
      repo,
      repoRoot,
      branch: info?.branch,
      upstream: info?.upstream,
      hasChanges: info?.hasChanges,
      changedCount: info?.changedFiles.length ?? 0,
      changedFiles: info?.changedFiles.map((file) => ({
        path: file.path,
        type: file.type
      })) ?? []
    };
  } catch (error) {
    return {
      repo,
      error: error instanceof Error ? error.message : String(error)
    };
  }
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
