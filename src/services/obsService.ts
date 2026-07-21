import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { environmentDefaults, getEnvironmentSetting } from '../config/environment';

export const OBS_BUCKET_NAME_RED = environmentDefaults.obs.bucketName;

// ==================== DFT 访问 OBS 核心 API 端点 ====================
export const OBS_GET_SPACE_TOKEN = '/api/v1/space/group/getSpaceToken';
export const OBS_DOWNLOAD_FILE = '/api/v1/file/command/download';
export const OBS_GET_FILE_DETAILS = '/api/v1/file/command/detail';
export const OBS_GET_PATH = '/api/v1/file/command/children';
export const OBS_UPLOAD_FILE = '/api/v1/file/command/upload';
export const OBS_MKDIR = '/api/v1/file/command/mkdir';
export const OBS_GET_FILE_URL = '/api/v1/file/command/url';
export const OBS_GET_FILE_VERSIONS = '/api/v1/file/command/queryFileVersionList';

export interface ObsFileVersionRecord {
  id: number;
  version: string;
  versionId?: string;
  updatedAt?: string;
  size?: string | number;
  modifier?: string;
  isLatest?: boolean;
}

export interface ObsFileDetailInfo {
  exists: boolean;
  filepath: string;
  fileName?: string;
  fileType?: string;
  parentPath?: string;
  md5?: string;
  updaterName?: string;
  version?: string;
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
  version?: string;
  versionId?: string;
  md5?: string;
  etag?: string;
}

export interface ObsDownloadFileOptions {
  versionId?: string;
  knownVersion?: string;
  knownEtag?: string;
  knownUpdatedAt?: string;
}

export interface ObsDownloadedFileResult {
  spaceName: string;
  remoteFilePath: string;
  localDestUri: vscode.Uri;
  version?: string;
  versionId?: string;
  updatedAt?: string;
  etag?: string;
}

export interface ObsTrackingOrigin {
  obsPage: string;
  apiBasePath: string;
  groupName: string;
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

interface ObsFileItemData {
  fileType?: string;
  fileName?: string;
  fullPath?: string;
  parentPath?: string;
  md5?: string;
  updaterName?: string;
  subFile?: ObsFileItemData[];
  name?: string;
  filename?: string;
  path?: string;
  filepath?: string;
  type?: string;
  isDir?: boolean;
  isDirectory?: boolean;
  size?: string | number;
  updatedAt?: string;
  updateTime?: string;
  versionId?: string;
  version?: string;
  etag?: string;
  [key: string]: unknown;
}

export interface OpenObsViewerOptions {
  spaceName?: string;
  fallbackSpaceName?: string;
}

interface ObsConfig {
  obsPage: string;
  apiBasePath: string;
  groupName: string;
  aesKey: string;
  aesIv: string;
  viewerUrlTemplate: string;
  w3id: string;
  requestTimeoutMs: number;
  tokenCacheMs: number;
}

const USER_AGENT = 'ObsOperator/1.0';

export class ObsService {
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();
  private readonly tokenRequests = new Map<string, Promise<string>>();

  clearTokenCache(): void {
    this.tokenCache.clear();
    this.tokenRequests.clear();
  }

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

  getTrackingOrigin(): ObsTrackingOrigin {
    const config = this.getConfig();
    return {
      obsPage: config.obsPage,
      apiBasePath: config.apiBasePath,
      groupName: config.groupName,
    };
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
    const url = this.buildObsUrl(config, OBS_GET_FILE_DETAILS, queryParams);

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'spaceName': spaceName,
        'spaceToken': spaceToken,
        ...(versionId ? { 'versionId': versionId } : {}),
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorBody = (await response.json()) as ObsApiResponse<ObsFileItemData>;
        if (errorBody.message === 'FILE_NOT_EXIST') {
          return { exists: false, filepath: normalizedPath };
        }
        throw new Error(this.formatObsError('OBS file detail failed', errorBody));
      }
      throw new Error(`OBS file detail failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as ObsApiResponse<ObsFileItemData>;
    if (body.code !== 1 || !body.data) {
      if (body.message === 'FILE_NOT_EXIST') {
        return { exists: false, filepath: normalizedPath };
      }
      throw new Error(this.formatObsError('OBS file detail failed', body));
    }
    const data = body.data;
    const md5 = data.md5 || undefined;
    return {
      exists: true,
      filepath: data.fullPath || normalizedPath,
      fileName: data.fileName,
      fileType: data.fileType,
      parentPath: data.parentPath,
      md5,
      updaterName: data.updaterName,
      version: data.version || undefined,
      versionId: data.versionId || data.version || response.headers.get('x-obs-version-id') || undefined,
      size: data.size,
      updatedAt: data.updatedAt || data.updateTime || response.headers.get('last-modified') || undefined,
      etag: md5 || data.etag || response.headers.get('etag') || undefined,
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
    const url = this.buildObsUrl(config, OBS_GET_FILE_VERSIONS, {
      spaceName: spaceName,
      filepath: normalizedPath,
    });

    const response = await this.fetchWithTimeout(url, {
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
    const url = this.buildObsUrl(config, OBS_GET_PATH, {
      spaceName: spaceName,
      filepath: normalizedPath,
    });

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'spaceName': spaceName,
        'spaceToken': spaceToken,
      },
    });

    if (!response.ok) {
      throw new Error(`OBS list children failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as ObsApiResponse<
      ObsFileItemData[] | { children?: ObsFileItemData[]; list?: ObsFileItemData[] }
    >;
    if (body.code !== 1 || !body.data) {
      throw new Error(this.formatObsError('OBS list children failed', body));
    }
    const list = Array.isArray(body.data) ? body.data : (body.data.children || body.data.list || []);
    return list.map((item) => {
      const rawPath = String(
        item.fullPath || item.path || item.filepath || item.fileName || item.name || item.filename || ''
      );
      const fallbackName = rawPath.split('/').filter(Boolean).pop() || '';
      const name = item.fileName || item.name || item.filename || fallbackName;
      const childPath = rawPath.startsWith('/')
        ? rawPath
        : `${normalizedPath.replace(/\/$/, '')}/${rawPath.replace(/^\/+/, '')}`;
      const fileType = item.fileType?.toUpperCase();
      const md5 = item.md5 || undefined;
      return {
        name,
        path: childPath,
        type: fileType === 'FOLDER' || item.type?.toLowerCase() === 'folder' || item.isDir || item.isDirectory
          ? 'folder'
          : 'file',
        size: item.size,
        updatedAt: item.updatedAt || item.updateTime,
        version: item.version || undefined,
        versionId: item.versionId || item.version,
        md5,
        etag: md5 || item.etag,
      };
    });
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
    const url = this.buildObsUrl(config, OBS_DOWNLOAD_FILE, queryParams);

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'spaceName': spaceName,
        'spaceToken': spaceToken,
        'Content-Type': 'application/octet-stream',
        ...(options?.versionId ? { 'versionId': options.versionId } : {}),
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const errJson = (await response.json()) as { code?: number; message?: string; extrasMessage?: string };
      if (errJson.message === 'FILE_NOT_EXIST') {
        throw new Error(`OBS 空间 [${spaceName}] 中不存在该文件: ${normalizedPath}`);
      }
      const details = [errJson.extrasMessage, errJson.message].filter(Boolean).join(' ');
      throw new Error(details || `OBS 下载返回了非文件响应 (code: ${errJson.code ?? 'unknown'})`);
    }
    if (!response.ok) {
      throw new Error(`OBS 请求下载失败: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await vscode.workspace.fs.writeFile(localDestUri, Buffer.from(arrayBuffer));

    // 从 Header 或 Detail 中尝试获取并记录版本号
    const headerVersionId = response.headers.get('x-obs-version-id') || response.headers.get('version-id') || options?.versionId;
    const headerEtag = response.headers.get('etag') || options?.knownEtag || undefined;
    const headerUpdatedAt = response.headers.get('last-modified') || options?.knownUpdatedAt || undefined;

    let resolvedVersionId = headerVersionId;
    let resolvedVersion = options?.knownVersion;
    let resolvedEtag = headerEtag;
    let resolvedUpdatedAt = headerUpdatedAt;
    if (!resolvedEtag) {
      try {
        const detail = await this.getFileDetailInfo(spaceName, normalizedPath, options?.versionId);
        if (detail.versionId) {
          resolvedVersionId = detail.versionId;
        }
        resolvedVersion = resolvedVersion || detail.version;
        resolvedEtag = resolvedEtag || detail.etag || detail.md5;
        resolvedUpdatedAt = resolvedUpdatedAt || detail.updatedAt;
      } catch (e) {
        // 忽略非必须查询的网络异常
      }
    }

    const result: ObsDownloadedFileResult = {
      spaceName,
      remoteFilePath: normalizedPath,
      localDestUri,
      version: resolvedVersion,
      versionId: resolvedVersionId || options?.versionId || 'latest',
      etag: resolvedEtag,
      updatedAt: resolvedUpdatedAt || new Date().toISOString(),
    };

    return result;
  }

  private getConfig(): ObsConfig {
    const config = vscode.workspace.getConfiguration('dftIde.obs');
    const page = getEnvironmentSetting('dftIde.obs', 'page', environmentDefaults.obs.page)
      .trim()
      .replace(/\/+$/, '');
    const apiBasePath = getEnvironmentSetting(
      'dftIde.obs',
      'apiBasePath',
      environmentDefaults.obs.apiBasePath
    ).trim();
    const groupName = config.get<string>('groupName', '').trim();
    const aesKey = getEnvironmentSetting('dftIde.obs', 'aesKey', environmentDefaults.obs.aesKey);
    const aesIv = getEnvironmentSetting('dftIde.obs', 'aesIv', environmentDefaults.obs.aesIv);
    return {
      obsPage: page || environmentDefaults.obs.page,
      apiBasePath: apiBasePath || environmentDefaults.obs.apiBasePath,
      groupName: groupName || 'dft',
      aesKey: aesKey || environmentDefaults.obs.aesKey,
      aesIv: aesIv || environmentDefaults.obs.aesIv,
      viewerUrlTemplate: config.get<string>('viewerUrlTemplate', '').trim(),
      w3id: config.get<string>('w3id', '').trim(),
      requestTimeoutMs: Math.max(1_000, config.get<number>('requestTimeoutSeconds', 15) * 1_000),
      tokenCacheMs: Math.max(5_000, config.get<number>('tokenCacheSeconds', 60) * 1_000),
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
    const cacheKey = `${config.obsPage}\n${config.groupName}\n${spaceName}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const pending = this.tokenRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    const request = this.requestSpaceToken(config, spaceName).then((token) => {
      this.tokenCache.set(cacheKey, { token, expiresAt: Date.now() + config.tokenCacheMs });
      return token;
    }).finally(() => {
      this.tokenRequests.delete(cacheKey);
    });
    this.tokenRequests.set(cacheKey, request);
    return request;
  }

  private async requestSpaceToken(config: ObsConfig, spaceName: string): Promise<string> {
    this.assertTokenConfig(config);

    const url = this.buildObsUrl(config, OBS_GET_SPACE_TOKEN, {
      group: config.groupName,
      name: spaceName,
    });
    const response = await this.fetchWithTimeout(url, {
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

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const config = this.getConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OBS request timed out after ${config.requestTimeoutMs / 1_000}s.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertTokenConfig(config: ObsConfig): void {
    const missing: string[] = [];
    if (!config.obsPage) missing.push('dftIde.obs.page');
    if (!config.groupName) missing.push('dftIde.obs.groupName');
    if (!config.aesKey) missing.push('dftIde.obs.aesKey');
    if (!config.aesIv) missing.push('dftIde.obs.aesIv');
    if (!config.apiBasePath) missing.push('dftIde.obs.apiBasePath');
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

  private buildObsUrl(config: ObsConfig, endpointPath: string, query: Record<string, string>): string {
    const apiPath = [config.apiBasePath, endpointPath]
      .map((part) => part.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
    return this.buildUrl(config.obsPage, apiPath, query);
  }

  private formatObsError(prefix: string, body: ObsApiResponse<unknown>): string {
    const details = [body.message, body.extrasMessage].filter(Boolean).join(' ');
    return details ? `${prefix}: ${details}` : `${prefix}: code=${body.code ?? 'unknown'}`;
  }
}

export const obsService = new ObsService();

