import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { obsService } from '../src/services/obsService';
import { ObsLocalModificationError, ObsTrackingService } from '../src/services/obsTrackingService';

interface ObsTrackingServiceInternals {
  globalIndexUri?: vscode.Uri;
  flushIndex(): Promise<void>;
  loadIndex(): Promise<void>;
}

function internals(value: ObsTrackingService): ObsTrackingServiceInternals {
  return value as unknown as ObsTrackingServiceInternals;
}

describe('ObsTrackingService', () => {
  let tempDir: string;
  let service: ObsTrackingService;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dft-obs-tracking-'));
    service = new ObsTrackingService();
    vi.spyOn(obsService, 'getFileVersions').mockResolvedValue([]);

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
    vi.mocked(obsService.getFileVersions).mockResolvedValue([{
      id: 17,
      version: 'V17',
      versionId: 'v17',
      isLatest: true,
    }]);
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
      version: 'V17',
      versionId: 'v17',
      etag: 'etag-17',
    });
    expect(metadata.artifact.fileName).toBe('gen_cfg.py');
    expect(metadata.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('tracks the latest download by MD5 when OBS does not return a version id', async () => {
    const destination = vscode.Uri.file(path.join(tempDir, 'main.py'));
    const md5 = 'e10adc3949ba59abbe56e057f20f883e';
    vi.spyOn(obsService, 'getFileDetailInfo').mockResolvedValue({
      exists: true,
      filepath: '/ECOSCR/Kirin/main.py',
      md5,
      etag: md5,
    });
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from('print("latest")\n'));
      return {
        spaceName,
        remoteFilePath: remotePath,
        localDestUri,
        versionId: 'latest',
        etag: md5,
      };
    });

    const result = await service.downloadFile('ECOSCR', '/ECOSCR/Kirin/main.py', destination);

    const metadataPath = path.join(tempDir, '.main.py.obs.json');
    const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    expect(result.versionId).toBeUndefined();
    expect(metadata.source).toMatchObject({
      remotePath: '/ECOSCR/Kirin/main.py',
      etag: md5,
    });
    expect(metadata.source).not.toHaveProperty('versionId');
  });

  it('detects an update by MD5 even when the version id is unchanged', async () => {
    const destination = vscode.Uri.file(path.join(tempDir, 'main.py'));
    const originalMd5 = 'e10adc3949ba59abbe56e057f20f883e';
    const remoteMd5 = '25d55ad283aa400af464c76d713c07ad';
    vi.spyOn(obsService, 'getFileDetailInfo').mockResolvedValue({
      exists: true,
      filepath: '/Kirin/main.py',
      versionId: 'current',
      md5: originalMd5,
      etag: originalMd5,
    });
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from('original'));
      return {
        spaceName,
        remoteFilePath: remotePath,
        localDestUri,
        versionId: 'current',
        etag: originalMd5,
      };
    });
    await service.downloadFile('ECOSCR', '/Kirin/main.py', destination);
    vi.spyOn(obsService, 'listChildren').mockResolvedValue([{
      name: 'main.py',
      path: '/Kirin/main.py',
      type: 'file',
      versionId: 'current',
      md5: remoteMd5,
      etag: remoteMd5,
    }]);

    const updates = await service.checkForUpdates({ manual: true });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ remoteEtag: remoteMd5, remoteDeleted: false });
  });

  it('migrates a legacy version-only sidecar to MD5 without reporting a false update', async () => {
    const destination = vscode.Uri.file(path.join(tempDir, 'legacy.py'));
    const content = 'legacy content';
    const md5 = crypto.createHash('md5').update(content).digest('hex');
    vi.spyOn(obsService, 'getFileDetailInfo').mockResolvedValue({
      exists: true,
      filepath: '/legacy.py',
      versionId: 'v1',
    });
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from(content));
      return { spaceName, remoteFilePath: remotePath, localDestUri, versionId: 'v1' };
    });
    await service.downloadFile('space', '/legacy.py', destination);
    vi.spyOn(obsService, 'listChildren').mockResolvedValue([{
      name: 'legacy.py',
      path: '/legacy.py',
      type: 'file',
      md5,
      etag: md5,
    }]);

    const updates = await service.checkForUpdates({ manual: true });

    expect(updates).toEqual([]);
    const metadata = JSON.parse(await fs.promises.readFile(path.join(tempDir, '.legacy.py.obs.json'), 'utf-8'));
    expect(metadata.source.etag).toBe(md5);
  });

  it('reports a remote deletion without deleting the local file', async () => {
    const destination = vscode.Uri.file(path.join(tempDir, 'deleted.py'));
    const md5 = 'e10adc3949ba59abbe56e057f20f883e';
    vi.spyOn(obsService, 'getFileDetailInfo')
      .mockResolvedValueOnce({ exists: true, filepath: '/deleted.py', md5, etag: md5 })
      .mockResolvedValue({ exists: false, filepath: '/deleted.py' });
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from('local copy'));
      return { spaceName, remoteFilePath: remotePath, localDestUri, versionId: 'latest', etag: md5 };
    });
    await service.downloadFile('space', '/deleted.py', destination);
    vi.spyOn(obsService, 'listChildren').mockResolvedValue([]);

    const updates = await service.checkForUpdates({ manual: true });

    expect(updates).toHaveLength(1);
    expect(updates[0].remoteDeleted).toBe(true);
    expect(await fs.promises.readFile(destination.fsPath, 'utf-8')).toBe('local copy');
  });

  it('restores an outside-workspace tracked file from the global index', async () => {
    const destination = vscode.Uri.file(path.join(tempDir, 'external.py'));
    const indexUri = vscode.Uri.file(path.join(tempDir, 'global-storage', 'obs-tracking', 'index.json'));
    const oldMd5 = 'e10adc3949ba59abbe56e057f20f883e';
    const newMd5 = '25d55ad283aa400af464c76d713c07ad';
    internals(service).globalIndexUri = indexUri;
    vi.spyOn(obsService, 'getFileDetailInfo').mockResolvedValue({
      exists: true,
      filepath: '/external.py',
      md5: oldMd5,
      etag: oldMd5,
    });
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from('external'));
      return { spaceName, remoteFilePath: remotePath, localDestUri, versionId: 'latest', etag: oldMd5 };
    });
    await service.downloadFile('space', '/external.py', destination);
    await internals(service).flushIndex();
    service.dispose();

    service = new ObsTrackingService();
    internals(service).globalIndexUri = indexUri;
    await internals(service).loadIndex();
    vi.spyOn(obsService, 'listChildren').mockResolvedValue([{
      name: 'external.py',
      path: '/external.py',
      type: 'file',
      md5: newMd5,
      etag: newMd5,
    }]);

    const updates = await service.checkForUpdates({ manual: true });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ artifactPath: destination.fsPath, remoteEtag: newMd5 });
  });

  it('does not check a sidecar created for a different OBS environment', async () => {
    const destination = vscode.Uri.file(path.join(tempDir, 'environment.py'));
    const md5 = 'e10adc3949ba59abbe56e057f20f883e';
    const originSpy = vi.spyOn(obsService, 'getTrackingOrigin').mockReturnValue({
      obsPage: 'https://dmas-beta.hisi.huawei.com',
      apiBasePath: '/file-system-server',
      groupName: 'dft',
    });
    vi.spyOn(obsService, 'getFileDetailInfo').mockResolvedValue({
      exists: true,
      filepath: '/environment.py',
      md5,
      etag: md5,
    });
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from('environment'));
      return { spaceName, remoteFilePath: remotePath, localDestUri, versionId: 'latest', etag: md5 };
    });
    await service.downloadFile('space', '/environment.py', destination);
    originSpy.mockReturnValue({
      obsPage: 'http://pandas.hisi.huawei.com',
      apiBasePath: '/file-system-server-dft',
      groupName: 'dft',
    });
    const listSpy = vi.spyOn(obsService, 'listChildren').mockResolvedValue([]);

    const updates = await service.checkForUpdates({ manual: true });

    expect(updates).toEqual([]);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('checks files in the same OBS directory with one children request', async () => {
    const md5ByPath: Record<string, string> = {
      '/scripts/a.py': 'e10adc3949ba59abbe56e057f20f883e',
      '/scripts/b.py': '25d55ad283aa400af464c76d713c07ad',
    };
    vi.spyOn(obsService, 'getFileDetailInfo').mockImplementation(async (_spaceName, remotePath) => ({
      exists: true,
      filepath: remotePath,
      md5: md5ByPath[remotePath],
      etag: md5ByPath[remotePath],
    }));
    vi.spyOn(obsService, 'downloadFile').mockImplementation(async (spaceName, remotePath, localDestUri) => {
      await vscode.workspace.fs.writeFile(localDestUri, Buffer.from(remotePath));
      return {
        spaceName,
        remoteFilePath: remotePath,
        localDestUri,
        versionId: 'latest',
        etag: md5ByPath[remotePath],
      };
    });
    await service.downloadFile('space', '/scripts/a.py', vscode.Uri.file(path.join(tempDir, 'a.py')));
    await service.downloadFile('space', '/scripts/b.py', vscode.Uri.file(path.join(tempDir, 'b.py')));
    const listSpy = vi.spyOn(obsService, 'listChildren').mockResolvedValue([
      { name: 'a.py', path: '/scripts/a.py', type: 'file', etag: md5ByPath['/scripts/a.py'] },
      { name: 'b.py', path: '/scripts/b.py', type: 'file', etag: md5ByPath['/scripts/b.py'] },
    ]);

    await service.checkForUpdates({ manual: true });

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(listSpy).toHaveBeenCalledWith('space', '/scripts');
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
