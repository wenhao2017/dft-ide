import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { obsService, ObsChildItem, ObsDownloadedFileResult } from './obsService';
import { resolveLocalConfigDirectory } from './workspaceService';

const METADATA_SUFFIX = '.obs.json';
const INDEX_SCHEMA_VERSION = 1;
const METADATA_SCHEMA_VERSION = 1;
const DEFAULT_CHECK_INTERVAL_MINUTES = 3;
const DEFAULT_STARTUP_DELAY_SECONDS = 10;
const DEFAULT_CONCURRENCY = 4;

export type ObsTrackingPolicy = 'latest' | 'pinned';

export interface ObsTrackedMetadata {
  schemaVersion: number;
  artifact: {
    fileName: string;
    sha256: string;
    size: number;
  };
  source: {
    spaceName: string;
    remotePath: string;
    versionId?: string;
    etag?: string;
    updatedAt?: string;
  };
  downloadedAt: string;
  policy: ObsTrackingPolicy;
}

export interface ObsTrackedDownloadOptions {
  versionId?: string;
  policy?: ObsTrackingPolicy;
  force?: boolean;
  overwriteUntracked?: boolean;
}

export interface ObsTrackedDirectoryDownloadResult {
  totalFiles: number;
  successFiles: number;
  failedFiles: number;
  downloadedItems: ObsDownloadedFileResult[];
  errors: Array<{ remotePath: string; error: string }>;
}

export interface ObsPendingUpdate {
  artifactPath: string;
  metadataPath: string;
  metadata: ObsTrackedMetadata;
  remoteVersionId?: string;
  remoteEtag?: string;
  remoteUpdatedAt?: string;
  remoteSize?: number;
}

interface ObsIndexEntry {
  artifactPath: string;
  metadataPath: string;
  metadataMtime: number;
  metadataSize: number;
  metadata: ObsTrackedMetadata;
  lastCheckedAt?: number;
  lastNotifiedVersionId?: string;
  snoozedUntil?: number;
}

interface ObsLocalIndexFile {
  schemaVersion: number;
  entries: ObsIndexEntry[];
}

interface UpdateQuickPickItem extends vscode.QuickPickItem {
  update: ObsPendingUpdate;
}

interface SnoozeQuickPickItem extends vscode.QuickPickItem {
  durationMs?: number;
  ignoreCurrentVersion?: boolean;
}

export class ObsLocalModificationError extends Error {
  constructor(public readonly artifactPath: string) {
    super(`OBS tracked file has local modifications: ${artifactPath}`);
    this.name = 'ObsLocalModificationError';
  }
}

export class ObsTrackingService implements vscode.Disposable {
  private readonly entries = new Map<string, ObsIndexEntry>();
  private readonly pendingUpdates = new Map<string, ObsPendingUpdate>();
  private readonly fileOperations = new Map<string, Promise<ObsDownloadedFileResult>>();
  private readonly disposables: vscode.Disposable[] = [];
  private statusBarItem: vscode.StatusBarItem | undefined;
  private bootstrapPromise: Promise<void> | undefined;
  private checkPromise: Promise<ObsPendingUpdate[]> | undefined;
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private startupHandle: ReturnType<typeof setTimeout> | undefined;
  private flushHandle: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private workspaceGeneration = 0;

  initialize(context: vscode.ExtensionContext): void {
    if (this.bootstrapPromise) {
      return;
    }

    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.statusBarItem.command = 'dftIde.manageObsUpdates';
    this.statusBarItem.tooltip = '查看 OBS 文件更新';
    this.disposables.push(this.statusBarItem);

    this.disposables.push(
      vscode.commands.registerCommand('dftIde.checkObsUpdates', () => this.checkForUpdates({ manual: true })),
      vscode.commands.registerCommand('dftIde.manageObsUpdates', () => this.showUpdatePicker()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.handleWorkspaceChanged()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('dftIde.obs')) {
          obsService.clearTokenCache();
          this.configureSchedule();
        }
      })
    );

    const watcher = vscode.workspace.createFileSystemWatcher(`**/.*${METADATA_SUFFIX}`);
    watcher.onDidCreate((uri) => void this.refreshMetadataUri(uri));
    watcher.onDidChange((uri) => void this.refreshMetadataUri(uri));
    watcher.onDidDelete((uri) => this.removeMetadataUri(uri));
    this.disposables.push(watcher);

    context.subscriptions.push(this);
    this.bootstrapPromise = this.bootstrap();
  }

  dispose(): void {
    this.disposed = true;
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    if (this.startupHandle) clearTimeout(this.startupHandle);
    if (this.flushHandle) clearTimeout(this.flushHandle);
    void this.flushIndex();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  getMetadataUri(artifactUri: vscode.Uri): vscode.Uri {
    const fileName = path.basename(artifactUri.fsPath);
    return vscode.Uri.file(path.join(path.dirname(artifactUri.fsPath), `.${fileName}${METADATA_SUFFIX}`));
  }

  async downloadFile(
    spaceName: string,
    remoteFilePath: string,
    localDestUri: vscode.Uri,
    options: ObsTrackedDownloadOptions = {}
  ): Promise<ObsDownloadedFileResult> {
    const key = normalizeLocalPath(localDestUri.fsPath);
    const previous = this.fileOperations.get(key);
    const operation = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() =>
      this.performDownloadFile(spaceName, remoteFilePath, localDestUri, options)
    );
    this.fileOperations.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.fileOperations.get(key) === operation) {
        this.fileOperations.delete(key);
      }
    }
  }

  private async performDownloadFile(
    spaceName: string,
    remoteFilePath: string,
    localDestUri: vscode.Uri,
    options: ObsTrackedDownloadOptions
  ): Promise<ObsDownloadedFileResult> {
    if (localDestUri.scheme !== 'file') {
      throw new Error('Tracked OBS downloads require a local file destination.');
    }

    const normalizedRemotePath = normalizeRemotePath(remoteFilePath);
    const metadataUri = this.getMetadataUri(localDestUri);
    const existingMetadata = await this.tryReadMetadata(metadataUri);
    const targetExists = await uriExists(localDestUri);

    if (targetExists && existingMetadata && !options.force) {
      const currentHash = await sha256File(localDestUri.fsPath);
      if (currentHash !== existingMetadata.artifact.sha256) {
        throw new ObsLocalModificationError(localDestUri.fsPath);
      }
    } else if (targetExists && !existingMetadata && !options.overwriteUntracked && !options.force) {
      throw new Error(`Refusing to overwrite an untracked local file: ${localDestUri.fsPath}`);
    }

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(localDestUri.fsPath)));
    const tempUri = temporarySiblingUri(localDestUri, 'download');
    const tempMetadataUri = temporarySiblingUri(metadataUri, 'metadata');

    try {
      let targetVersionId = options.versionId;
      if (!targetVersionId) {
        const detail = await obsService.getFileDetailInfo(spaceName, normalizedRemotePath);
        if (!detail.exists) {
          throw new Error(`OBS file does not exist or its version cannot be resolved: ${normalizedRemotePath}`);
        }
        targetVersionId = detail.versionId;
      }
      const result = await obsService.downloadFile(spaceName, normalizedRemotePath, tempUri, {
        versionId: targetVersionId,
      });
      const resolvedVersionId = normalizeOptionalVersion(result.versionId) ?? targetVersionId;
      if (!resolvedVersionId) {
        throw new Error(`OBS download did not return a version id: ${normalizedRemotePath}`);
      }
      const stat = await vscode.workspace.fs.stat(tempUri);
      const sha256 = await sha256File(tempUri.fsPath);
      const metadata: ObsTrackedMetadata = {
        schemaVersion: METADATA_SCHEMA_VERSION,
        artifact: {
          fileName: path.basename(localDestUri.fsPath),
          sha256,
          size: stat.size,
        },
        source: {
          spaceName,
          remotePath: normalizedRemotePath,
          versionId: resolvedVersionId,
          etag: result.etag,
          updatedAt: result.updatedAt,
        },
        downloadedAt: new Date().toISOString(),
        policy: options.policy ?? existingMetadata?.policy ?? 'latest',
      };

      await vscode.workspace.fs.writeFile(
        tempMetadataUri,
        Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8')
      );
      await vscode.workspace.fs.rename(tempUri, localDestUri, { overwrite: true });
      await vscode.workspace.fs.rename(tempMetadataUri, metadataUri, { overwrite: true });
      this.entries.delete(normalizeLocalPath(metadataUri.fsPath));
      await this.refreshMetadataUri(metadataUri);

      this.pendingUpdates.delete(normalizeLocalPath(localDestUri.fsPath));
      this.updateStatusBar();
      return {
        ...result,
        localDestUri,
        remoteFilePath: normalizedRemotePath,
        versionId: metadata.source.versionId,
      };
    } catch (error) {
      await safeDelete(tempUri);
      await safeDelete(tempMetadataUri);
      throw error;
    }
  }

  async downloadDirectory(
    spaceName: string,
    remoteDirPath: string,
    localDestDirUri: vscode.Uri,
    options: ObsTrackedDownloadOptions & { versionIdMap?: Record<string, string> } = {}
  ): Promise<ObsTrackedDirectoryDownloadResult> {
    const remoteFiles: Array<{ item: ObsChildItem; destination: vscode.Uri }> = [];
    const visited = new Set<string>();
    await this.collectDirectoryFiles(spaceName, normalizeRemotePath(remoteDirPath), localDestDirUri, remoteFiles, visited, 0);

    const downloadedItems: ObsDownloadedFileResult[] = [];
    const errors: Array<{ remotePath: string; error: string }> = [];
    await runWithConcurrency(remoteFiles, this.getMaxConcurrency(), async ({ item, destination }) => {
      try {
        const result = await this.downloadFile(spaceName, item.path, destination, {
          ...options,
          versionId: options.versionIdMap?.[normalizeRemotePath(item.path)] ?? item.versionId ?? options.versionId,
        });
        downloadedItems.push(result);
      } catch (error) {
        errors.push({
          remotePath: item.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return {
      totalFiles: remoteFiles.length,
      successFiles: downloadedItems.length,
      failedFiles: errors.length,
      downloadedItems,
      errors,
    };
  }

  async checkForUpdates(options: { manual?: boolean } = {}): Promise<ObsPendingUpdate[]> {
    if (this.checkPromise) {
      return this.checkPromise;
    }
    this.checkPromise = this.performUpdateCheck(options).finally(() => {
      this.checkPromise = undefined;
    });
    return this.checkPromise;
  }

  private async bootstrap(): Promise<void> {
    await this.loadIndex();
    await this.discoverMetadataFiles();
    this.configureSchedule();
  }

  private async handleWorkspaceChanged(): Promise<void> {
    this.workspaceGeneration++;
    this.entries.clear();
    this.pendingUpdates.clear();
    this.updateStatusBar();
    await this.loadIndex();
    await this.discoverMetadataFiles();
    this.configureSchedule();
  }

  private configureSchedule(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    if (this.startupHandle) clearTimeout(this.startupHandle);
    this.intervalHandle = undefined;
    this.startupHandle = undefined;

    const config = vscode.workspace.getConfiguration('dftIde.obs');
    if (!config.get<boolean>('autoCheckUpdates', true) || this.disposed) {
      return;
    }

    const intervalMinutes = clamp(config.get<number>('checkIntervalMinutes', DEFAULT_CHECK_INTERVAL_MINUTES), 1, 60);
    const startupDelaySeconds = clamp(config.get<number>('startupCheckDelaySeconds', DEFAULT_STARTUP_DELAY_SECONDS), 3, 300);
    this.startupHandle = setTimeout(() => {
      void this.checkForUpdates().catch((error) => this.logBackgroundError(error));
    }, startupDelaySeconds * 1_000);
    this.intervalHandle = setInterval(() => {
      void this.checkForUpdates().catch((error) => this.logBackgroundError(error));
    }, intervalMinutes * 60_000);
  }

  private async performUpdateCheck(options: { manual?: boolean }): Promise<ObsPendingUpdate[]> {
    await this.bootstrapPromise;
    const generation = this.workspaceGeneration;
    const tracked = [...this.entries.values()].filter((entry) => entry.metadata.policy === 'latest');
    if (tracked.length === 0) {
      if (options.manual) {
        void vscode.window.showInformationMessage('当前工作区没有受管的 OBS 文件。');
      }
      return [];
    }

    const grouped = new Map<string, ObsIndexEntry[]>();
    for (const entry of tracked) {
      const source = entry.metadata.source;
      const remoteDir = path.posix.dirname(normalizeRemotePath(source.remotePath));
      const key = `${source.spaceName}\n${remoteDir}`;
      const group = grouped.get(key) ?? [];
      group.push(entry);
      grouped.set(key, group);
    }

    const updates: ObsPendingUpdate[] = [];
    const failures: string[] = [];
    const checkedArtifacts = new Set<string>();
    await runWithConcurrency([...grouped.entries()], this.getMaxConcurrency(), async ([key, group]) => {
      const [spaceName, remoteDir] = key.split('\n');
      try {
        const children = await obsService.listChildren(spaceName, remoteDir);
        const byPath = new Map(
          children.filter((item) => item.type === 'file').map((item) => [normalizeRemotePath(item.path), item])
        );
        const now = Date.now();
        for (const entry of group) {
          const remotePath = normalizeRemotePath(entry.metadata.source.remotePath);
          let remote = byPath.get(remotePath);
          if (!remote) {
            const detail = await obsService.getFileDetailInfo(spaceName, remotePath);
            if (detail.exists) {
              remote = {
                name: path.posix.basename(remotePath),
                path: remotePath,
                type: 'file',
                size: detail.size,
                updatedAt: detail.updatedAt,
                versionId: detail.versionId,
                etag: detail.etag,
              };
            }
          }
          checkedArtifacts.add(normalizeLocalPath(entry.artifactPath));
          entry.lastCheckedAt = now;
          if (remote && hasRemoteUpdate(entry.metadata, remote)) {
            updates.push({
              artifactPath: entry.artifactPath,
              metadataPath: entry.metadataPath,
              metadata: entry.metadata,
              remoteVersionId: remote.versionId,
              remoteEtag: remote.etag,
              remoteUpdatedAt: remote.updatedAt,
              remoteSize: toNumber(remote.size),
            });
          }
        }
      } catch (error) {
        failures.push(`${spaceName}${remoteDir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    if (generation !== this.workspaceGeneration || this.disposed) {
      return [];
    }

    for (const artifactKey of checkedArtifacts) {
      this.pendingUpdates.delete(artifactKey);
    }
    for (const update of updates) {
      this.pendingUpdates.set(normalizeLocalPath(update.artifactPath), update);
    }
    this.updateStatusBar();
    this.scheduleFlush();

    if (updates.length > 0) {
      const notify = updates.filter((update) => this.shouldNotify(update));
      if (notify.length > 0 || options.manual) {
        for (const update of notify) {
          const entry = this.entries.get(normalizeLocalPath(update.metadataPath));
          if (entry) entry.lastNotifiedVersionId = updateIdentity(update);
        }
        this.scheduleFlush();
        void this.showUpdateNotification(options.manual ? updates : notify);
      }
    } else if (options.manual) {
      const suffix = failures.length > 0 ? `，但有 ${failures.length} 个远端目录检查失败` : '';
      void vscode.window.showInformationMessage(`未发现 OBS 文件更新${suffix}。`);
    }

    if (options.manual && failures.length > 0) {
      console.warn('[DFT IDE] 部分 OBS 更新检查失败:', failures);
    } else if (failures.length > 0) {
      console.warn('[DFT IDE] OBS 后台更新检查有部分目录失败:', failures);
    }
    return updates;
  }

  private shouldNotify(update: ObsPendingUpdate): boolean {
    const entry = this.entries.get(normalizeLocalPath(update.metadataPath));
    if (!entry || (entry.snoozedUntil ?? 0) > Date.now()) {
      return false;
    }
    return entry.lastNotifiedVersionId !== updateIdentity(update);
  }

  private async showUpdateNotification(updates: ObsPendingUpdate[]): Promise<void> {
    const action = await vscode.window.showInformationMessage(
      `检测到 ${updates.length} 个 OBS 文件存在新版本。`,
      '查看更新',
      '全部更新',
      '稍后提醒'
    );
    if (action === '查看更新') {
      await this.showUpdatePicker();
    } else if (action === '全部更新') {
      await this.updateFiles(updates);
    } else if (action === '稍后提醒') {
      const choice = await vscode.window.showQuickPick<SnoozeQuickPickItem>([
        { label: '30 分钟', description: '30 分钟内不再自动提示', durationMs: 30 * 60_000 },
        { label: '2 小时', description: '2 小时内不再自动提示', durationMs: 2 * 60 * 60_000 },
        { label: '1 天', description: '24 小时内不再自动提示', durationMs: 24 * 60 * 60_000 },
        { label: '7 天', description: '7 天内不再自动提示', durationMs: 7 * 24 * 60 * 60_000 },
        {
          label: '当前版本不再提醒',
          description: '远端出现更新版本后会再次提示',
          ignoreCurrentVersion: true,
        },
      ], {
        title: '暂停 OBS 更新提醒',
        placeHolder: '选择暂停提醒的时间',
      });
      if (!choice) return;
      const until = choice.durationMs ? Date.now() + choice.durationMs : undefined;
      for (const update of updates) {
        const entry = this.entries.get(normalizeLocalPath(update.metadataPath));
        if (entry) {
          entry.snoozedUntil = until;
          entry.lastNotifiedVersionId = choice.ignoreCurrentVersion
            ? updateIdentity(update)
            : undefined;
        }
      }
      this.scheduleFlush();
    }
  }

  private async showUpdatePicker(): Promise<void> {
    let updates = [...this.pendingUpdates.values()];
    if (updates.length === 0) {
      updates = await this.checkForUpdates({ manual: true });
    }
    if (updates.length === 0) {
      return;
    }

    const items: UpdateQuickPickItem[] = updates.map((update) => ({
      label: `$(cloud-download) ${path.basename(update.artifactPath)}`,
      description: `${update.metadata.source.versionId ?? '未知'} → ${update.remoteVersionId ?? '最新'}`,
      detail: `${update.metadata.source.spaceName}:${update.metadata.source.remotePath}\n${update.artifactPath}`,
      picked: true,
      update,
    }));
    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: '选择要更新的 OBS 文件',
      title: 'DFT IDE · OBS 文件更新',
    });
    if (selected && selected.length > 0) {
      await this.updateFiles(selected.map((item) => item.update));
    }
  }

  private async updateFiles(updates: ObsPendingUpdate[]): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在更新 ${updates.length} 个 OBS 文件`,
        cancellable: true,
      },
      async (progress, token) => {
        const conflicts: ObsPendingUpdate[] = [];
        const failures: Array<{ update: ObsPendingUpdate; error: unknown }> = [];
        let completed = 0;

        for (const update of updates) {
          if (token.isCancellationRequested) break;
          progress.report({
            message: path.basename(update.artifactPath),
            increment: 100 / Math.max(1, updates.length),
          });
          try {
            await this.downloadFile(
              update.metadata.source.spaceName,
              update.metadata.source.remotePath,
              vscode.Uri.file(update.artifactPath),
              {
                versionId: update.remoteVersionId,
                policy: update.metadata.policy,
              }
            );
            completed++;
          } catch (error) {
            if (error instanceof ObsLocalModificationError) {
              conflicts.push(update);
            } else {
              failures.push({ update, error });
            }
          }
        }

        if (conflicts.length > 0 && !token.isCancellationRequested) {
          const choice = await vscode.window.showWarningMessage(
            `${conflicts.length} 个 OBS 文件存在本地修改，未自动覆盖。`,
            '覆盖并更新',
            '保留本地文件'
          );
          if (choice === '覆盖并更新') {
            for (const update of conflicts) {
              try {
                await this.downloadFile(
                  update.metadata.source.spaceName,
                  update.metadata.source.remotePath,
                  vscode.Uri.file(update.artifactPath),
                  {
                    versionId: update.remoteVersionId,
                    policy: update.metadata.policy,
                    force: true,
                  }
                );
                completed++;
              } catch (error) {
                failures.push({ update, error });
              }
            }
          }
        }

        if (completed > 0 || failures.length > 0) {
          const suffix = failures.length > 0 ? `，${failures.length} 个失败` : '';
          void vscode.window.showInformationMessage(`OBS 文件更新完成：${completed} 个成功${suffix}。`);
        }
      }
    );
  }

  private async collectDirectoryFiles(
    spaceName: string,
    remoteDirPath: string,
    localDestDirUri: vscode.Uri,
    output: Array<{ item: ObsChildItem; destination: vscode.Uri }>,
    visited: Set<string>,
    depth: number
  ): Promise<void> {
    if (depth > 100) {
      throw new Error(`OBS directory nesting is too deep: ${remoteDirPath}`);
    }
    const visitKey = `${spaceName}\n${normalizeRemotePath(remoteDirPath)}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);
    await vscode.workspace.fs.createDirectory(localDestDirUri);

    const children = await obsService.listChildren(spaceName, remoteDirPath);
    for (const child of children) {
      const safeName = safeRemoteChildName(child.name || path.posix.basename(child.path));
      const destination = vscode.Uri.file(path.join(localDestDirUri.fsPath, safeName));
      if (child.type === 'folder') {
        await this.collectDirectoryFiles(spaceName, child.path, destination, output, visited, depth + 1);
      } else {
        output.push({ item: { ...child, path: normalizeRemotePath(child.path) }, destination });
      }
    }
  }

  private async discoverMetadataFiles(): Promise<void> {
    const uris = await vscode.workspace.findFiles(
      `**/.*${METADATA_SUFFIX}`,
      '**/{.git,node_modules,out,.dft-ide}/**'
    );
    const discovered = new Set(uris.map((uri) => normalizeLocalPath(uri.fsPath)));
    await runWithConcurrency(uris, 8, async (uri) => this.refreshMetadataUri(uri));
    for (const key of [...this.entries.keys()]) {
      if (!discovered.has(key)) this.entries.delete(key);
    }
    this.scheduleFlush();
  }

  private async refreshMetadataUri(uri: vscode.Uri): Promise<void> {
    if (!isMetadataFileName(path.basename(uri.fsPath))) return;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const key = normalizeLocalPath(uri.fsPath);
      const cached = this.entries.get(key);
      if (cached && cached.metadataMtime === stat.mtime && cached.metadataSize === stat.size) {
        return;
      }
      const metadata = await this.readMetadata(uri);
      const artifactPath = path.join(path.dirname(uri.fsPath), metadata.artifact.fileName);
      this.entries.set(key, {
        artifactPath,
        metadataPath: uri.fsPath,
        metadataMtime: stat.mtime,
        metadataSize: stat.size,
        metadata,
        lastCheckedAt: cached?.lastCheckedAt,
        lastNotifiedVersionId: cached?.lastNotifiedVersionId,
        snoozedUntil: cached?.snoozedUntil,
      });
      this.pendingUpdates.delete(normalizeLocalPath(artifactPath));
      this.updateStatusBar();
      this.scheduleFlush();
    } catch (error) {
      this.entries.delete(normalizeLocalPath(uri.fsPath));
      console.warn(`[DFT IDE] 忽略无效的 OBS 元数据文件: ${uri.fsPath}`, error);
    }
  }

  private removeMetadataUri(uri: vscode.Uri): void {
    const key = normalizeLocalPath(uri.fsPath);
    const entry = this.entries.get(key);
    if (entry) this.pendingUpdates.delete(normalizeLocalPath(entry.artifactPath));
    this.entries.delete(key);
    this.updateStatusBar();
    this.scheduleFlush();
  }

  private async readMetadata(uri: vscode.Uri): Promise<ObsTrackedMetadata> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const value = JSON.parse(Buffer.from(bytes).toString('utf-8')) as unknown;
    if (!isTrackedMetadata(value)) {
      throw new Error('Unsupported OBS metadata schema.');
    }
    return value;
  }

  private async tryReadMetadata(uri: vscode.Uri): Promise<ObsTrackedMetadata | undefined> {
    try {
      return await this.readMetadata(uri);
    } catch {
      return undefined;
    }
  }

  private async loadIndex(): Promise<void> {
    const indexUri = this.getIndexUri();
    if (!indexUri) return;
    try {
      const bytes = await vscode.workspace.fs.readFile(indexUri);
      const value = JSON.parse(Buffer.from(bytes).toString('utf-8')) as ObsLocalIndexFile;
      if (value.schemaVersion !== INDEX_SCHEMA_VERSION || !Array.isArray(value.entries)) return;
      for (const entry of value.entries) {
        if (isIndexEntry(entry)) {
          this.entries.set(normalizeLocalPath(entry.metadataPath), entry);
        }
      }
    } catch {
      // The index is an optional cache and is rebuilt from tracked sidecars.
    }
  }

  private scheduleFlush(): void {
    if (this.flushHandle) clearTimeout(this.flushHandle);
    this.flushHandle = setTimeout(() => {
      this.flushHandle = undefined;
      void this.flushIndex();
    }, 1_000);
  }

  private async flushIndex(): Promise<void> {
    const indexUri = this.getIndexUri();
    if (!indexUri) return;
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(indexUri.fsPath)));
      const tempUri = temporarySiblingUri(indexUri, 'index');
      const content: ObsLocalIndexFile = {
        schemaVersion: INDEX_SCHEMA_VERSION,
        entries: [...this.entries.values()],
      };
      await vscode.workspace.fs.writeFile(tempUri, Buffer.from(JSON.stringify(content), 'utf-8'));
      await vscode.workspace.fs.rename(tempUri, indexUri, { overwrite: true });
    } catch (error) {
      console.warn('[DFT IDE] 写入 OBS 本地索引失败:', error);
    }
  }

  private getIndexUri(): vscode.Uri | undefined {
    const localConfigDir = resolveLocalConfigDirectory();
    return localConfigDir
      ? vscode.Uri.file(path.join(localConfigDir, 'obs', 'index.json'))
      : undefined;
  }

  private getMaxConcurrency(): number {
    return clamp(
      vscode.workspace.getConfiguration('dftIde.obs').get<number>('maxConcurrentRequests', DEFAULT_CONCURRENCY),
      1,
      8
    );
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem) return;
    const count = this.pendingUpdates.size;
    if (count === 0) {
      this.statusBarItem.hide();
      return;
    }
    this.statusBarItem.text = `$(cloud-download) OBS ${count}`;
    this.statusBarItem.tooltip = `${count} 个 OBS 文件可更新，点击查看`;
    this.statusBarItem.show();
  }

  private logBackgroundError(error: unknown): void {
    console.warn('[DFT IDE] OBS 后台更新检查失败，将在下个周期重试:', error);
  }
}

function isMetadataFileName(fileName: string): boolean {
  return fileName.startsWith('.') && fileName.endsWith(METADATA_SUFFIX) && fileName.length > METADATA_SUFFIX.length + 1;
}

function isTrackedMetadata(value: unknown): value is ObsTrackedMetadata {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ObsTrackedMetadata>;
  return item.schemaVersion === METADATA_SCHEMA_VERSION
    && (item.policy === 'latest' || item.policy === 'pinned')
    && Boolean(item.artifact && typeof item.artifact.fileName === 'string'
      && path.basename(item.artifact.fileName) === item.artifact.fileName
      && typeof item.artifact.sha256 === 'string'
      && typeof item.artifact.size === 'number')
    && Boolean(item.source && typeof item.source.spaceName === 'string'
      && typeof item.source.remotePath === 'string')
    && typeof item.downloadedAt === 'string';
}

function isIndexEntry(value: unknown): value is ObsIndexEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ObsIndexEntry>;
  return typeof entry.artifactPath === 'string'
    && typeof entry.metadataPath === 'string'
    && typeof entry.metadataMtime === 'number'
    && typeof entry.metadataSize === 'number'
    && isTrackedMetadata(entry.metadata);
}

function normalizeRemotePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeLocalPath(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function normalizeOptionalVersion(value: string | undefined): string | undefined {
  return value && value !== 'latest' ? value : undefined;
}

function safeRemoteChildName(value: string): string {
  const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  if (!value
    || value === '.'
    || value === '..'
    || path.basename(value) !== value
    || /[<>:"/\\|?*\x00-\x1f]/.test(value)
    || /[. ]$/.test(value)
    || windowsReserved.test(value)) {
    throw new Error(`Unsafe OBS child name: ${value}`);
  }
  return value;
}

function temporarySiblingUri(uri: vscode.Uri, purpose: string): vscode.Uri {
  const random = crypto.randomBytes(6).toString('hex');
  return vscode.Uri.file(path.join(path.dirname(uri.fsPath), `.${path.basename(uri.fsPath)}.${purpose}-${process.pid}-${random}.tmp`));
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function safeDelete(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // Best-effort cleanup for interrupted downloads.
  }
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function hasRemoteUpdate(metadata: ObsTrackedMetadata, remote: ObsChildItem): boolean {
  const local = metadata.source;
  if (remote.versionId && local.versionId) return remote.versionId !== local.versionId;
  if (remote.etag && local.etag) return remote.etag !== local.etag;
  if (remote.updatedAt && local.updatedAt) {
    const remoteTime = Date.parse(remote.updatedAt);
    const localTime = Date.parse(local.updatedAt);
    if (Number.isFinite(remoteTime) && Number.isFinite(localTime)) return remoteTime > localTime;
  }
  const remoteSize = toNumber(remote.size);
  return remoteSize !== undefined && remoteSize !== metadata.artifact.size;
}

function updateIdentity(update: ObsPendingUpdate): string {
  return update.remoteVersionId ?? update.remoteEtag ?? update.remoteUpdatedAt ?? `size:${update.remoteSize ?? 'unknown'}`;
}

function toNumber(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index]);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
  await Promise.all(workers);
}

export const obsTrackingService = new ObsTrackingService();
