import * as vscode from "vscode";

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
}

/**
 * Git 变更文件
 */
export interface GitChangedFile {
  path: string;
  uri: vscode.Uri;
  type: GitFileChangeType;
}

/**
 * DFT IDE 使用的 Git 服务接口
 */
export interface DftGitService {
  getCurrentGitInfo(resource?: vscode.Uri): Promise<GitInfo | undefined>;
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

    if (matchedRepo) {
      return matchedRepo;
    }
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
  /**
   * 获取当前 Git 仓库基础信息
   */
  async getCurrentGitInfo(resource?: vscode.Uri): Promise<GitInfo | undefined> {
    const repo = await getRepository(resource);

    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found in current workspace.");
      return undefined;
    }

    const changedFiles = collectChangedFiles(repo);

    const head = repo.state?.HEAD;

    return {
      repoRoot: repo.rootUri.fsPath,
      branch: head?.name,
      commit: head?.commit,
      upstream: head?.upstream
        ? `${head.upstream.remote}/${head.upstream.name}`
        : undefined,
      hasChanges: changedFiles.length > 0,
      changedFiles,
    };
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

    const repoRoot = repo.rootUri.fsPath;
    const changedFiles = collectChangedFiles(repo);

    const normalizedTargets = paths.map((p) => {
      if (p.includes(":") || p.startsWith("/") || p.startsWith("\\")) {
        return p.replace(/\\/g, "/").toLowerCase();
      }

      return vscode.Uri.joinPath(repo.rootUri, p).fsPath
        .replace(/\\/g, "/")
        .toLowerCase();
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

    await repo.add(files);
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
  async createBranch(
    branchName: string,
    checkout = true,
    resource?: vscode.Uri
  ): Promise<void> {
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
};
