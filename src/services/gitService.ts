import * as vscode from "vscode";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * VS Code 内置 Git 扩展的 ID
 */
const VS_CODE_GIT_EXTENSION_ID = "vscode.git";

/**
 * 变更文件状态
 */
export type GitFileChangeType =
  | "index"
  | "workingTree"
  | "merge"
  | "unknown";

/**
 * Git 基础信息
 */
export interface GitInfo {
  repoRoot: string;
  branch?: string;
  commit?: string;
  upstream?: string;
  hasChanges: boolean;
  changedFiles: GitChangedFile[];
  stagedCount: number;
  unstagedCount: number;
  conflictCount: number;
  ahead: number;
  behind: number;
  remoteChecked: boolean;
  operationInProgress: boolean;
}

/**
 * Git 提交信息
 */
export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

/**
 * Git 变更文件
 */
export interface GitChangedFile {
  path: string;
  uri: vscode.Uri;
  type: GitFileChangeType;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * DFT IDE 使用的 Git 服务接口
 */
export interface DftGitService {
  initGitRepository(resource?: vscode.Uri): Promise<boolean>;
  getCurrentGitInfo(resource?: vscode.Uri): Promise<GitInfo | undefined>;
  refreshCurrentGitInfo(resource?: vscode.Uri): Promise<GitInfo | undefined>;
  getCurrentRepository(resource?: vscode.Uri): Promise<any | undefined>;
  getChangedFiles(resource?: vscode.Uri): Promise<GitChangedFile[]>;
  hasChangedFiles(paths: string[], resource?: vscode.Uri): Promise<boolean>;
  openSourceControl(): Promise<void>;
  openFileDiff(file: vscode.Uri, resource?: vscode.Uri): Promise<void>;
  addFiles(files: vscode.Uri[], resource?: vscode.Uri): Promise<void>;
  commit(message: string, resource?: vscode.Uri): Promise<void>;
  pull(resource?: vscode.Uri): Promise<void>;
  push(resource?: vscode.Uri): Promise<void>;
  fetch(resource?: vscode.Uri): Promise<void>;
  checkout(branchName: string, resource?: vscode.Uri): Promise<void>;
  createBranch(branchName: string, checkout?: boolean, resource?: vscode.Uri): Promise<void>;
  getBranches(resource?: vscode.Uri): Promise<string[]>;
  mergeBranch(branchName: string, resource?: vscode.Uri): Promise<void>;
  stashSave(message?: string, resource?: vscode.Uri): Promise<void>;
  stashApply(stashName: string, resource?: vscode.Uri): Promise<void>;
  getStashList(resource?: vscode.Uri): Promise<string[]>;
  getCommitInfo(commitHash: string, resource?: vscode.Uri): Promise<CommitInfo | undefined>;
  mergeRemoteBranch(branchName: string, resource?: vscode.Uri): Promise<void>;
  getUnmergedFiles(resource?: vscode.Uri): Promise<vscode.Uri[]>;
  isMergeInProgress(resource?: vscode.Uri): Promise<boolean>;
  abortMerge(resource?: vscode.Uri): Promise<void>;
  resolveConflictFile(file: vscode.Uri, resolution: 'local' | 'cloud', resource?: vscode.Uri): Promise<void>;
  openMergeConflict(file: vscode.Uri, resource?: vscode.Uri): Promise<void>;
}

function countChangedFiles(changedFiles: GitChangedFile[], type: GitFileChangeType): number {
  return new Set(changedFiles.filter((file) => file.type === type).map((file) => file.path)).size;
}

async function buildGitInfo(repo: any, remoteChecked: boolean): Promise<GitInfo> {
  if (typeof repo.status === 'function') {
    await repo.status();
  }
  const changedFiles = collectChangedFiles(repo);
  const head = repo.state?.HEAD;
  let mergeInProgress = false;
  try {
    await runGit(repo.rootUri.fsPath, ['rev-parse', '--verify', '-q', 'MERGE_HEAD']);
    mergeInProgress = true;
  } catch {
    // rev-parse exits non-zero when there is no active merge.
  }
  return {
    repoRoot: repo.rootUri.fsPath,
    branch: head?.name,
    commit: head?.commit,
    upstream: head?.upstream ? `${head.upstream.remote}/${head.upstream.name}` : undefined,
    hasChanges: changedFiles.length > 0,
    changedFiles,
    stagedCount: countChangedFiles(changedFiles, 'index'),
    unstagedCount: countChangedFiles(changedFiles, 'workingTree'),
    conflictCount: countChangedFiles(changedFiles, 'merge'),
    ahead: typeof head?.ahead === 'number' ? head.ahead : 0,
    behind: typeof head?.behind === 'number' ? head.behind : 0,
    remoteChecked,
    operationInProgress: Boolean(repo.state?.rebaseCommit || repo.state?.sequencerState || mergeInProgress),
  };
}

async function runGit(repoRoot: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf-8',
    timeout: 120_000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

/**
 * 获取 VS Code Git API
 */
async function getGitApi(): Promise<any | undefined> {
  const gitExtension = vscode.extensions.getExtension(VS_CODE_GIT_EXTENSION_ID);

  if (!gitExtension) {
    vscode.window.showWarningMessage(
      "VS Code Git extension is not available. Please make sure the built-in Git extension is enabled."
    );
    return undefined;
  }

  const git = gitExtension.isActive
    ? gitExtension.exports
    : await gitExtension.activate();

  if (!git || typeof git.getAPI !== "function") {
    vscode.window.showWarningMessage("VS Code Git API is not available.");
    return undefined;
  }

  return git.getAPI(1);
}

/**
 * 判断一个路径是否在另一个路径下面
 */
function isInsidePath(child: string, parent: string): boolean {
  const normalizedChild = child.replace(/\\/g, "/").toLowerCase();
  const normalizedParent = parent.replace(/\\/g, "/").toLowerCase();

  return (
    normalizedChild === normalizedParent ||
    normalizedChild.startsWith(normalizedParent.endsWith("/")
      ? normalizedParent
      : normalizedParent + "/")
  );
}

/**
 * 根据当前资源选择对应仓库
 */
async function getRepository(resource?: vscode.Uri): Promise<any | undefined> {
  const api = await getGitApi();

  if (!api) {
    return undefined;
  }

  const repositories: any[] = api.repositories || [];

  if (repositories.length === 0) {
    return undefined;
  }

  if (resource) {
    const matchedRepo = repositories.find((repo) => {
      return isInsidePath(resource.fsPath, repo.rootUri.fsPath);
    });

    // An explicit resource must never silently operate on another repository.
    // This matters in a four-repository workspace where one repository may be
    // missing or temporarily unavailable.
    return matchedRepo;
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const activeFile = activeEditor.document.uri;

    const matchedRepo = repositories.find((repo) => {
      return isInsidePath(activeFile.fsPath, repo.rootUri.fsPath);
    });

    if (matchedRepo) {
      return matchedRepo;
    }
  }

  return repositories[0];
}

/**
 * 读取 changed file 的 fsPath
 */
function getChangeUri(change: any): vscode.Uri | undefined {
  if (change.uri) {
    return change.uri;
  }

  if (change.resourceUri) {
    return change.resourceUri;
  }

  return undefined;
}

/**
 * 提取 Git 变更文件
 */
function collectChangedFiles(repo: any): GitChangedFile[] {
  const result: GitChangedFile[] = [];

  const pushChanges = (changes: any[], type: GitFileChangeType) => {
    for (const change of changes || []) {
      const uri = getChangeUri(change);

      if (!uri) {
        continue;
      }

      result.push({
        path: uri.fsPath,
        uri,
        type,
      });
    }
  };

  pushChanges(repo.state?.indexChanges || [], "index");
  pushChanges(repo.state?.workingTreeChanges || [], "workingTree");
  pushChanges(repo.state?.mergeChanges || [], "merge");

  return result;
}

/**
 * DFT IDE Git Service
 *
 * 说明：
 * 1. 不重新实现 Git 管理系统
 * 2. 只封装 VS Code 内置 Git 扩展能力
 * 3. Webview 前端不要直接调用 Git，应该通过 extension.ts 转发到这里
 */
export const gitService: DftGitService = {
  async initGitRepository(resource?: vscode.Uri): Promise<boolean> {
    try {
      // 获取当前工作区根目录
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage("No workspace folder is open.");
        return false;
      }
      // 确定要初始化的目录
      const targetUri = resource || workspaceFolders[0].uri;
      const targetPath = targetUri.fsPath;

      // 检查是否已经是 Git 仓库
      const existingRepo = await getRepository(targetUri);
      if (existingRepo) {
        vscode.window.showInformationMessage(`Directory "${targetPath}" is already a Git repository.`);
        return true;
      }
      // 执行 git init 命令
      const result = await vscode.commands.executeCommand("git.init", targetUri);
      if (result) {
        vscode.window.showInformationMessage(`Git repository initialized successfully in "${targetPath}"`);
        return true;
      } else {
        vscode.window.showErrorMessage(`Failed to initialize Git repository in "${targetPath}"`);
        return false;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error initializing Git repository: ${getErrorMessage(error)}`);
      return false;
    }
  },

  /**
   * 获取当前 Git 仓库基础信息
   */
  async getCurrentGitInfo(resource?: vscode.Uri): Promise<GitInfo | undefined> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found in current workspace.");
      return undefined;
    }

    return buildGitInfo(repo, false);
  },

  async refreshCurrentGitInfo(resource?: vscode.Uri): Promise<GitInfo | undefined> {
    const repo = await getRepository(resource);
    if (!repo) {
      return undefined;
    }
    await repo.fetch();
    return buildGitInfo(repo, true);
  },

  /**
   * 获取当前 Git Repository 对象
   *
   * 注意：
   * 这个对象来自 VS Code Git Extension API。
   * 建议只在 extension 侧使用，不要暴露给 Webview。
   */
  async getCurrentRepository(resource?: vscode.Uri): Promise<any | undefined> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found in current workspace.");
      return undefined;
    }

    return repo;
  },

  /**
   * 获取当前仓库变更文件
   */
  async getChangedFiles(resource?: vscode.Uri): Promise<GitChangedFile[]> {
    const repo = await getRepository(resource);

    if (!repo) {
      return [];
    }

    return collectChangedFiles(repo);
  },

  /**
   * 判断指定路径中是否有文件发生变更
   *
   * paths 可以是：
   * - 绝对路径
   * - 仓库内相对路径
   * - 目录路径
   */
  async hasChangedFiles(paths: string[], resource?: vscode.Uri): Promise<boolean> {
    const repo = await getRepository(resource);

    if (!repo) {
      return false;
    }
    await repo.status(); // 强制刷新状态
    const repoRoot = repo.rootUri.fsPath;
    const changedFiles = collectChangedFiles(repo);

    const normalizedTargets = paths.map((p) => {
      if (p.includes(":") || p.startsWith("/") || p.startsWith("\\")) {
        return p.replace(/\\/g, "/").toLowerCase();
      }

      return vscode.Uri.joinPath(repo.rootUri, p).fsPath.replace(/\\/g, "/").toLowerCase();
    });

    return changedFiles.some((file) => {
      const changedPath = file.path.replace(/\\/g, "/").toLowerCase();

      return normalizedTargets.some((target) => {
        return changedPath === target || changedPath.startsWith(target + "/");
      });
    });
  },

  /**
   * 打开 VS Code Source Control 面板
   */
  async openSourceControl(): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.scm");
  },

  /**
   * 打开某个文件相对于 HEAD 的 diff
   */
  async openFileDiff(file: vscode.Uri, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource || file);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    if (typeof repo.diffWithHEAD === "function") {
      await repo.diffWithHEAD(file.fsPath);
      return;
    }

    await vscode.commands.executeCommand("workbench.view.scm");
  },

  /**
   * git add 指定文件
   */
  async addFiles(files: vscode.Uri[], resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource || files[0]);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    if (files.length === 0) {
      return;
    }

    await repo.add(files.map(uri => uri.fsPath));
  },

  /**
   * git commit
   */
  async commit(message: string, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    const commitMessage = message.trim();

    if (!commitMessage) {
      vscode.window.showWarningMessage("Commit message cannot be empty.");
      return;
    }

    await repo.commit(commitMessage);
  },

  /**
   * git pull
   */
  async pull(resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    await repo.pull();
  },

  /**
   * git push
   */
  async push(resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    await repo.push();
  },

  /**
   * git fetch
   */
  async fetch(resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    await repo.fetch();
  },

  async getBranches(resource?: vscode.Uri): Promise<string[]> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return [];
    }

    const branches = await repo.getBranches(resource);
    return branches.filter((b: any) => b.name && b.type === 0);
  },

  /**
   * 将指定分支合并到当前分支
   */
  async mergeBranch(branchName: string, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    const name = branchName.trim();

    if (!name) {
      vscode.window.showWarningMessage("Branch name cannot be empty.");
      return;
    }

    try {
      await repo.merge(name);
      vscode.window.showInformationMessage(`Branch "${name}" merged successfully.`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to merge branch "${name}":${getErrorMessage(error)}`);
    }
  },

  /**
   * 切换分支
   */
  async checkout(branchName: string, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    const name = branchName.trim();

    if (!name) {
      vscode.window.showWarningMessage("Branch name cannot be empty.");
      return;
    }

    await repo.checkout(name);
  },

  /**
   * 创建分支
   */
  async createBranch(branchName: string, checkout = true, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    const name = branchName.trim();

    if (!name) {
      vscode.window.showWarningMessage("Branch name cannot be empty.");
      return;
    }

    await repo.createBranch(name, checkout);
  },

  /**
   * 保存当前工作区的修改为 stash
   */
  async stashSave(message?: string, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    try {
      await repo.stashSave(message);
      vscode.window.showInformationMessage("Changes have been stashed.");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to stash changes: ${getErrorMessage(error)}`);
    }
  },

  /**
   * 应用指定的 stash
   */
  async stashApply(stashName: string, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }

    const name = stashName.trim();

    if (!name) {
      vscode.window.showWarningMessage("Stash name cannot be empty.");
      return;
    }

    try {
      await repo.stashApply(name);
      vscode.window.showInformationMessage(`Stash "${name}" applied successfully.`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to apply stash "${name}":${getErrorMessage(error)}`);
    }
  },

  /**
   * 获取当前仓库的 stash 列表
   */
  async getStashList(resource?: vscode.Uri): Promise<string[]> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return [];
    }

    try {
      const stashes = await repo.stashList();
      return stashes.map((s: any) => s.name);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to get stash list: ${getErrorMessage(error)}`);
      return [];
    }
  },


  /**
   * 获取某个提交的详细信息
   */
  async getCommitInfo(commitHash: string, resource?: vscode.Uri): Promise<CommitInfo | undefined> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return undefined;
    }

    const hash = commitHash.trim();

    if (!hash) {
      vscode.window.showWarningMessage("Commit hash cannot be empty.");
      return undefined;
    }

    try {
      const commit = await repo.getCommit(hash);

      if (!commit) {
        vscode.window.showWarningMessage(`Commit "${hash}" not found.`);
        return undefined;
      }

      return {
        hash: commit.hash,
        author: commit.author,
        date: commit.date,
        message: commit.message,
      };
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to get commit info for "${hash}":${getErrorMessage(error)}`);
      return undefined;
    }
  },

  async mergeRemoteBranch(branchName: string, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);
    if (!repo) {
      throw new Error('No Git repository found.');
    }
    const name = branchName.trim();
    if (!name) {
      throw new Error('The cloud branch is not configured.');
    }
    await repo.merge(name);
  },

  async getUnmergedFiles(resource?: vscode.Uri): Promise<vscode.Uri[]> {
    const repo = await getRepository(resource);
    if (!repo) {
      return [];
    }
    const output = await runGit(repo.rootUri.fsPath, ['diff', '--name-only', '--diff-filter=U', '-z']);
    return output
      .split('\0')
      .filter(Boolean)
      .map((relativePath) => vscode.Uri.file(path.join(repo.rootUri.fsPath, relativePath)));
  },

  async isMergeInProgress(resource?: vscode.Uri): Promise<boolean> {
    const repo = await getRepository(resource);
    if (!repo) {
      return false;
    }
    try {
      await runGit(repo.rootUri.fsPath, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
      return true;
    } catch {
      return false;
    }
  },

  async abortMerge(resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource);
    if (!repo) {
      throw new Error('No Git repository found.');
    }
    await runGit(repo.rootUri.fsPath, ['merge', '--abort']);
  },

  async resolveConflictFile(file: vscode.Uri, resolution: 'local' | 'cloud', resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource || file);
    if (!repo) {
      throw new Error('No Git repository found.');
    }
    const relativePath = path.relative(repo.rootUri.fsPath, file.fsPath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('The conflict file is outside the selected repository.');
    }
    const side = resolution === 'local' ? '--ours' : '--theirs';
    await runGit(repo.rootUri.fsPath, ['checkout', side, '--', relativePath]);
    await repo.add([file.fsPath]);
  },

  async openMergeConflict(file: vscode.Uri, resource?: vscode.Uri): Promise<void> {
    const repo = await getRepository(resource || file);
    if (!repo) {
      throw new Error('No Git repository found.');
    }
    const change = (repo.state?.mergeChanges ?? []).find((item: any) => {
      const uri = getChangeUri(item);
      return uri?.fsPath === file.fsPath;
    });
    if (change?.command?.command) {
      await vscode.commands.executeCommand(change.command.command, ...(change.command.arguments ?? []));
      return;
    }
    await vscode.commands.executeCommand('vscode.open', file);
  }
};
