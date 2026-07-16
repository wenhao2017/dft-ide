import * as crypto from 'crypto';
import * as vscode from 'vscode';

// ==================== OBS 红区生产环境常量与密钥 ====================
export const PANDAS_HOMEPAGE_PROD = 'http://pandas.hisi.huawei.com';
export const OBS_BUCKET_NAME_RED = 'dft-files';
export const OBS_AES_KEY_RED = '3WB4oEodiKFUreBi';
export const OBS_AES_IV_RED = 'aQ5TOzDq4XsumbOn';

// ==================== DFT 访问 OBS 核心 API 端点 ====================
export const OBS_GET_SPACE_TOKEN = '/file-system-server-dft/api/v1/space/group/getSpaceToken';
export const OBS_DOWNLOAD_FILE = '/file-system-server-dft/api/v1/file/command/download';
export const OBS_GET_FILE_DETAILS = '/file-system-server-dft/api/v1/file/command/detail';
export const OBS_GET_PATH = '/file-system-server-dft/api/v1/file/command/children';
export const OBS_UPLOAD_FILE = '/file-system-server-dft/api/v1/file/command/upload';
export const OBS_MKDIR = '/file-system-server-dft/api/v1/file/command/mkdir';
export const OBS_GET_FILE_URL = '/file-system-server-dft/api/v1/file/command/url';
export const OBS_GET_FILE_VERSIONS = '/file-system-server-dft/api/v1/file/command/version/list';

export interface ObsFileVersionRecord {
  versionId: string;
  updatedAt: string;
  size?: string | number;
  modifier?: string;
  isLatest?: boolean;
}

export interface ObsFileDetailInfo {
  exists: boolean;
  filepath: string;
  versionId?: string;
  size?: number | string;
  updatedAt?: string;
  etag?: string;
}

export interface ObsChildItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: string | number;
  updatedAt?: string;
  versionId?: string;
}

export interface ObsDownloadFileOptions {
  versionId?: string;
  recordVersion?: boolean;
  versionManifestUri?: vscode.Uri;
}

export interface ObsDownloadedFileResult {
  spaceName: string;
  remoteFilePath: string;
  localDestUri: vscode.Uri;
  versionId?: string;
  updatedAt?: string;
  etag?: string;
}

export interface ObsDirectoryDownloadResult {
  totalFiles: number;
  successFiles: number;
  failedFiles: number;
  downloadedItems: ObsDownloadedFileResult[];
  manifestUri: vscode.Uri;
}

interface ObsApiResponse<T> {
  code?: number;
  message?: string;
  extrasMessage?: string;
  data?: T;
}

interface SpaceTokenData {
  spaceToken?: string;
}

export interface OpenObsViewerOptions {
  spaceName?: string;
  fallbackSpaceName?: string;
}

interface ObsConfig {
  obsPage: string;
  groupName: string;
  aesKey: string;
  aesIv: string;
  getSpaceTokenPath: string;
  viewerUrlTemplate: string;
  w3id: string;
}

const USER_AGENT = 'ObsOperator/1.0';

export class ObsService {
  async openViewer(options: OpenObsViewerOptions): Promise<{ url: string; spaceName: string }> {
    const config = this.getConfig();
    const spaceName = this.resolveSpaceName(options);
    const spaceToken = await this.getSpaceToken(config, spaceName);
    const url = this.buildViewerUrl(config, spaceName, spaceToken);

    await vscode.env.openExternal(vscode.Uri.parse(url));
    return { url, spaceName };
  }

  /**
   * 获取当前的 spaceName，支持外部传入默认回退值
   */
  getSpaceName(fallback?: string): string {
    return this.resolveSpaceName({ fallbackSpaceName: fallback });
  }

  /**
   * 获取当前文件详细信息（含版本号与修改时间）
   */
  async getFileDetailInfo(spaceName: string, filepath: string, versionId?: string): Promise<ObsFileDetailInfo> {
    const config = this.getConfig();
    const spaceToken = await this.getSpaceToken(config, spaceName);

    const normalizedPath = filepath.startsWith('/') ? filepath : `/${filepath}`;
    const queryParams: Record<string, string> = {
      spaceName: spaceName,
      filepath: normalizedPath,
    };
    if (versionId) {
      queryParams.versionId = versionId;
    }
    const url = this.buildUrl(config.obsPage, OBS_GET_FILE_DETAILS, queryParams);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'spaceName': spaceName,
        'spaceToken': spaceToken,
        ...(versionId ? { 'versionId': versionId } : {}),
      },
    });

    if (!response.ok) {
      return { exists: false, filepath: normalizedPath };
    }
    const body = (await response.json()) as ObsApiResponse<any>;
    if (body.code !== 1 || !body.data) {
      return { exists: false, filepath: normalizedPath };
    }
    const data = body.data;
    return {
      exists: true,
      filepath: normalizedPath,
      versionId: data.versionId || data.version || response.headers.get('x-obs-version-id') || undefined,
      size: data.size,
      updatedAt: data.updatedAt || data.updateTime || response.headers.get('last-modified') || undefined,
      etag: data.etag || response.headers.get('etag') || undefined,
    };
  }

  /**
   * §3.3 检查文件是否存在及详情
   */
  async getFileDetails(spaceName: string, filepath: string, versionId?: string): Promise<boolean> {
    const info = await this.getFileDetailInfo(spaceName, filepath, versionId);
    return info.exists;
  }

  /**
   * 查询文件多版本历史记录
   */
  async getFileVersions(spaceName: string, filepath: string): Promise<ObsFileVersionRecord[]> {
    const config = this.getConfig();
    const spaceToken = await this.getSpaceToken(config, spaceName);

    const normalizedPath = filepath.startsWith('/') ? filepath : `/${filepath}`;
    const url = this.buildUrl(config.obsPage, OBS_GET_FILE_VERSIONS, {
      spaceName: spaceName,
      filepath: normalizedPath,
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'spaceName': spaceName,
        'spaceToken': spaceToken,
      },
    });

    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as ObsApiResponse<ObsFileVersionRecord[] | { list?: ObsFileVersionRecord[] }>;
    if (body.code !== 1 || !body.data) {
      return [];
    }
    if (Array.isArray(body.data)) {
      return body.data;
    }
    return body.data.list || [];
  }

  /**
   * 获取 OBS 指定目录下子项列表
   */
  async listChildren(spaceName: string, remoteDirPath: string): Promise<ObsChildItem[]> {
    const config = this.getConfig();
    const spaceToken = await this.getSpaceToken(config, spaceName);

    const normalizedPath = remoteDirPath.startsWith('/') ? remoteDirPath : `/${remoteDirPath}`;
    const url = this.buildUrl(config.obsPage, OBS_GET_PATH, {
      spaceName: spaceName,
      filepath: normalizedPath,
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'spaceName': spaceName,
        'spaceToken': spaceToken,
      },
    });

    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as ObsApiResponse<any>;
    if (body.code !== 1 || !body.data) {
      return [];
    }
    const list = Array.isArray(body.data) ? body.data : (body.data.children || body.data.list || []);
    return list.map((item: any) => ({
      name: item.name || item.filename || '',
      path: item.path || item.filepath || `${normalizedPath.replace(/\/$/, '')}/${item.name}`,
      type: item.type === 'folder' || item.isDir ? 'folder' : 'file',
      size: item.size,
      updatedAt: item.updatedAt || item.updateTime,
      versionId: item.versionId || item.version,
    }));
  }

  /**
   * §4.2 下载最新或指定版本文件到本地，并自动记录版本号（用于“产生默认配置”或多版本追踪）
   */
  async downloadFile(
    spaceName: string,
    remoteFilePath: string,
    localDestUri: vscode.Uri,
    options?: ObsDownloadFileOptions
  ): Promise<ObsDownloadedFileResult> {
    const config = this.getConfig();
    const spaceToken = await this.getSpaceToken(config, spaceName);

    const normalizedPath = remoteFilePath.startsWith('/') ? remoteFilePath : `/${remoteFilePath}`;
    const queryParams: Record<string, string> = {
      spaceName: spaceName,
      filepath: normalizedPath,
    };
    if (options?.versionId) {
      queryParams.versionId = options.versionId;
    }
    const url = this.buildUrl(config.obsPage, OBS_DOWNLOAD_FILE, queryParams);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'spaceName': spaceName,
        'spaceToken': spaceToken,
        'Content-Type': 'application/octet-stream',
        ...(options?.versionId ? { 'versionId': options.versionId } : {}),
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errJson = (await response.json()) as { code?: number; message?: string };
        if (errJson.message === 'FILE_NOT_EXIST') {
          throw new Error(`OBS 空间 [${spaceName}] 中不存在该文件: ${normalizedPath}`);
        }
        throw new Error(errJson.message || `OBS 下载报错 (code: ${errJson.code})`);
      }
      throw new Error(`OBS 请求下载失败: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await vscode.workspace.fs.writeFile(localDestUri, Buffer.from(arrayBuffer));

    // 从 Header 或 Detail 中尝试获取并记录版本号
    const headerVersionId = response.headers.get('x-obs-version-id') || response.headers.get('version-id') || options?.versionId;
    const headerEtag = response.headers.get('etag') || undefined;
    const headerUpdatedAt = response.headers.get('last-modified') || new Date().toISOString();

    let resolvedVersionId = headerVersionId;
    if (!resolvedVersionId && options?.recordVersion !== false) {
      try {
        const detail = await this.getFileDetailInfo(spaceName, normalizedPath, options?.versionId);
        if (detail.versionId) {
          resolvedVersionId = detail.versionId;
        }
      } catch (e) {
        // 忽略非必须查询的网络异常
      }
    }

    const result: ObsDownloadedFileResult = {
      spaceName,
      remoteFilePath: normalizedPath,
      localDestUri,
      versionId: resolvedVersionId || options?.versionId || 'latest',
      etag: headerEtag,
      updatedAt: headerUpdatedAt,
    };

    // 默认或指定记录版本时，在下载文件同目录下生成版本元数据记录文件（如 .filename.version.json）
    if (options?.recordVersion ?? true) {
      const manifestUri = options?.versionManifestUri || vscode.Uri.file(`${localDestUri.fsPath}.version.json`);
      try {
        await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(JSON.stringify(result, null, 2), 'utf-8'));
      } catch (writeErr) {
        console.warn(`[DFT IDE] 写入版本记录文件失败: ${manifestUri.fsPath}`, writeErr);
      }
    }

    return result;
  }

  /**
   * 批量下载整个 OBS 目录（递归拉取目录下所有文件与子目录，并为每个文件记录版本号，生成汇总清单）
   */
  async downloadDirectory(
    spaceName: string,
    remoteDirPath: string,
    localDestDirUri: vscode.Uri,
    options?: { recordVersions?: boolean; versionIdMap?: Record<string, string> }
  ): Promise<ObsDirectoryDownloadResult> {
    await vscode.workspace.fs.createDirectory(localDestDirUri);

    const children = await this.listChildren(spaceName, remoteDirPath);
    const downloadedItems: ObsDownloadedFileResult[] = [];
    let successFiles = 0;
    let failedFiles = 0;

    for (const child of children) {
      if (child.type === 'file') {
        const childDestUri = vscode.Uri.file(`${localDestDirUri.fsPath}/${child.name}`);
        try {
          const targetVersionId = options?.versionIdMap?.[child.path] || child.versionId;
          const res = await this.downloadFile(spaceName, child.path, childDestUri, {
            versionId: targetVersionId,
            recordVersion: options?.recordVersions ?? true,
          });
          downloadedItems.push(res);
          successFiles++;
        } catch (err) {
          console.warn(`[DFT IDE] 批量下载 OBS 目录文件失败: ${child.path}`, err);
          failedFiles++;
        }
      } else if (child.type === 'folder') {
        const subDirDestUri = vscode.Uri.file(`${localDestDirUri.fsPath}/${child.name}`);
        try {
          const subResult = await this.downloadDirectory(spaceName, child.path, subDirDestUri, options);
          downloadedItems.push(...subResult.downloadedItems);
          successFiles += subResult.successFiles;
          failedFiles += subResult.failedFiles;
        } catch (err) {
          console.warn(`[DFT IDE] 批量下载 OBS 子目录失败: ${child.path}`, err);
        }
      }
    }

    const manifestUri = vscode.Uri.file(`${localDestDirUri.fsPath}/_obs_directory_versions.json`);
    if (options?.recordVersions ?? true) {
      const manifestContent = {
        spaceName,
        remoteDirPath,
        downloadedAt: new Date().toISOString(),
        totalFiles: successFiles + failedFiles,
        successFiles,
        failedFiles,
        files: downloadedItems,
      };
      try {
        await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(JSON.stringify(manifestContent, null, 2), 'utf-8'));
      } catch (err) {
        console.warn(`[DFT IDE] 写入目录多版本汇总清单失败: ${manifestUri.fsPath}`, err);
      }
    }

    return {
      totalFiles: successFiles + failedFiles,
      successFiles,
      failedFiles,
      downloadedItems,
      manifestUri,
    };
  }

  private getConfig(): ObsConfig {
    const config = vscode.workspace.getConfiguration('dftIde.obs');
    const page = config.get<string>('page', '').trim().replace(/\/+$/, '');
    const groupName = config.get<string>('groupName', '').trim();
    const aesKey = config.get<string>('aesKey', '');
    const aesIv = config.get<string>('aesIv', '');
    const getSpaceTokenPath = config.get<string>('getSpaceTokenPath', '').trim();
    return {
      obsPage: page || PANDAS_HOMEPAGE_PROD,
      groupName: groupName || 'dft',
      aesKey: aesKey || OBS_AES_KEY_RED,
      aesIv: aesIv || OBS_AES_IV_RED,
      getSpaceTokenPath: getSpaceTokenPath || OBS_GET_SPACE_TOKEN,
      viewerUrlTemplate: config.get<string>('viewerUrlTemplate', '').trim(),
      w3id: config.get<string>('w3id', '').trim(),
    };
  }

  private resolveSpaceName(options: OpenObsViewerOptions): string {
    const configured = vscode.workspace.getConfiguration('dftIde.obs').get<string>('spaceName', '').trim();
    const spaceName = configured || options.spaceName?.trim() || options.fallbackSpaceName?.trim();
    if (!spaceName) {
      throw new Error('OBS space name is empty. Select a project or open a DFT workspace first.');
    }
    return spaceName;
  }

  private async getSpaceToken(config: ObsConfig, spaceName: string): Promise<string> {
    this.assertTokenConfig(config);

    const url = this.buildUrl(config.obsPage, config.getSpaceTokenPath, {
      group: config.groupName,
      name: spaceName,
    });
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'fs-signature': this.createFsSignature(config),
      },
    });

    if (!response.ok) {
      throw new Error(`OBS SpaceToken request failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as ObsApiResponse<SpaceTokenData>;
    if (body.code !== 1 || !body.data?.spaceToken) {
      throw new Error(this.formatObsError('OBS SpaceToken request failed', body));
    }

    return body.data.spaceToken;
  }

  private assertTokenConfig(config: ObsConfig): void {
    const missing: string[] = [];
    if (!config.obsPage) missing.push('dftIde.obs.page');
    if (!config.groupName) missing.push('dftIde.obs.groupName');
    if (!config.aesKey) missing.push('dftIde.obs.aesKey');
    if (!config.aesIv) missing.push('dftIde.obs.aesIv');
    if (!config.getSpaceTokenPath) missing.push('dftIde.obs.getSpaceTokenPath');
    if (missing.length > 0) {
      throw new Error(`Missing OBS settings: ${missing.join(', ')}`);
    }
  }

  private createFsSignature(config: ObsConfig): string {
    const random = this.randomAlphaNum(10);
    const payload = `${config.groupName}.${Date.now()}.${random}`;
    const padded = this.zeroPad(Buffer.from(payload, 'utf-8'));
    const cipher = crypto.createCipheriv(
      'aes-128-cbc',
      this.fixedLengthBuffer(config.aesKey, 'AES key'),
      this.fixedLengthBuffer(config.aesIv, 'AES IV')
    );
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
  }

  private fixedLengthBuffer(value: string, label: string): Buffer {
    const buffer = Buffer.from(value, 'utf-8');
    if (buffer.length !== 16) {
      throw new Error(`OBS ${label} must be 16 bytes for AES-128-CBC.`);
    }
    return buffer;
  }

  private zeroPad(buffer: Buffer): Buffer {
    const blockSize = 16;
    const padding = (blockSize - (buffer.length % blockSize)) % blockSize;
    return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, 0)]);
  }

  private randomAlphaNum(length: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += alphabet[crypto.randomInt(alphabet.length)];
    }
    return result;
  }

  private buildViewerUrl(config: ObsConfig, spaceName: string, spaceToken: string): string {
    const template = config.viewerUrlTemplate || '{obsPage}?spaceName={spaceName}&spaceToken={spaceToken}&w3id={w3id}';
    const values: Record<string, string> = {
      obsPage: config.obsPage,
      spaceName,
      spaceToken,
      token: spaceToken,
      w3id: config.w3id,
      groupName: config.groupName,
    };

    return template.replace(/\{(obsPage|spaceName|spaceToken|token|w3id|groupName)\}/g, (_, key: string) =>
      key === 'obsPage' ? values[key] : encodeURIComponent(values[key] ?? '')
    );
  }

  private buildUrl(base: string, endpointPath: string, query: Record<string, string>): string {
    const baseWithSlash = base.endsWith('/') ? base : `${base}/`;
    const cleanPath = endpointPath.replace(/^\/+/, '');
    const url = new URL(cleanPath, baseWithSlash);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  private formatObsError(prefix: string, body: ObsApiResponse<unknown>): string {
    const details = [body.message, body.extrasMessage].filter(Boolean).join(' ');
    return details ? `${prefix}: ${details}` : `${prefix}: code=${body.code ?? 'unknown'}`;
  }
}

export const obsService = new ObsService();

