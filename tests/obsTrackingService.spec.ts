import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { obsService } from '../src/services/obsService';
import { ObsLocalModificationError, ObsTrackingService } from '../src/services/obsTrackingService';

describe('ObsTrackingService', () => {
  let tempDir: string;
  let service: ObsTrackingService;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dft-obs-tracking-'));
    service = new ObsTrackingService();

    vi.mocked(vscode.workspace.fs.createDirectory).mockImplementation(async (uri) => {
      await fs.promises.mkdir(uri.fsPath, { recursive: true });
    });
    vi.mocked(vscode.workspace.fs.stat).mockImplementation(async (uri) => {
      const stat = await fs.promises.stat(uri.fsPath);
      return {
        type: stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
        ctime: stat.ctimeMs,
        mtime: stat.mtimeMs,
        size: stat.size,
      };
    });
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri) => fs.promises.readFile(uri.fsPath));
    vi.mocked(vscode.workspace.fs.writeFile).mockImplementation(async (uri, content) => {
      await fs.promises.writeFile(uri.fsPath, content);
    });
    vi.mocked(vscode.workspace.fs.rename).mockImplementation(async (source, target) => {
      await fs.promises.rm(target.fsPath, { force: true });
      await fs.promises.rename(source.fsPath, target.fsPath);
    });
    vi.mocked(vscode.workspace.fs.delete).mockImplementation(async (uri) => {
      await fs.promises.rm(uri.fsPath, { force: true, recursive: true });
    });
  });

  afterEach(async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as unknown as { workspaceFolders: typeof workspaceFolders }).workspaceFolders = [];
    service.dispose();
    (vscode.workspace as unknown as { workspaceFolders: typeof workspaceFolders }).workspaceFolders = workspaceFolders;
    vi.restoreAllMocks();
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('writes a hidden per-file metadata sidecar for a tracked download', async () => {
    const destination = vscode.Uri.file(path.join(tempDir, 'gen_cfg.py'));
    vi.spyOn(obsService, 'getFileDetailInfo').mockResolvedValue({
      exists: true,
      filepath: '/scripts/hibist/gen_cfg.py',
      versionId: 'v17',
    });
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from('print("ok")\n'));
      return {
        spaceName,
        remoteFilePath: remotePath,
        localDestUri,
        versionId: 'v17',
        etag: 'etag-17',
        updatedAt: '2026-07-16T08:30:00Z',
      };
    });

    await service.downloadFile('DFX_MTC001', '/scripts/hibist/gen_cfg.py', destination);

    const metadataPath = path.join(tempDir, '.gen_cfg.py.obs.json');
    const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    expect(await fs.promises.readFile(destination.fsPath, 'utf-8')).toBe('print("ok")\n');
    expect(metadata.source).toMatchObject({
      spaceName: 'DFX_MTC001',
      remotePath: '/scripts/hibist/gen_cfg.py',
      versionId: 'v17',
      etag: 'etag-17',
    });
    expect(metadata.artifact.fileName).toBe('gen_cfg.py');
    expect(metadata.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not overwrite a locally modified tracked file without force', async () => {
    const destination = vscode.Uri.file(path.join(tempDir, 'gen_cfg.py'));
    vi.spyOn(obsService, 'getFileDetailInfo').mockResolvedValue({
      exists: true,
      filepath: '/gen_cfg.py',
      versionId: 'v1',
    });
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from('remote content'));
      return { spaceName, remoteFilePath: remotePath, localDestUri, versionId: 'v1' };
    });
    await service.downloadFile('space', '/gen_cfg.py', destination);
    await fs.promises.writeFile(destination.fsPath, 'local edit');

    await expect(service.downloadFile('space', '/gen_cfg.py', destination)).rejects.toBeInstanceOf(
      ObsLocalModificationError
    );
    expect(await fs.promises.readFile(destination.fsPath, 'utf-8')).toBe('local edit');
  });
});
