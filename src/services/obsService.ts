import * as crypto from 'crypto';
import * as vscode from 'vscode';

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

  private getConfig(): ObsConfig {
    const config = vscode.workspace.getConfiguration('dftIde.obs');
    return {
      obsPage: config.get<string>('page', '').trim().replace(/\/+$/, ''),
      groupName: config.get<string>('groupName', '').trim(),
      aesKey: config.get<string>('aesKey', ''),
      aesIv: config.get<string>('aesIv', ''),
      getSpaceTokenPath: config.get<string>('getSpaceTokenPath', '').trim(),
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

    const body = await response.json() as ObsApiResponse<SpaceTokenData>;
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
