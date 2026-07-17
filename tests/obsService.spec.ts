import { describe, it, expect, vi, beforeEach } from 'vitest';
import { obsService } from '../src/services/obsService';
import * as vscode from 'vscode';

describe('ObsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    obsService.clearTokenCache();
  });

  describe('openViewer', () => {
    it('should build viewer URL and open it externally', async () => {
      // Mock global fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 1,
          data: {
            spaceToken: 'test-token-123'
          }
        })
      });
      global.fetch = mockFetch;

      const result = await obsService.openViewer({
        spaceName: 'test-space'
      });

      expect(result.spaceName).toBe('test-space');
      expect(result.url).toContain('https://obs.test.com');
      expect(result.url).toContain('test-space');
      expect(result.url).toContain('test-token-123');

      // Verify vscode.env.openExternal was called
      expect(vscode.env.openExternal).toHaveBeenCalled();
      
      const lastCallArg = vi.mocked(vscode.env.openExternal).mock.calls[0][0];
      expect(lastCallArg.toString()).toBe(result.url);
    });

    it('should throw error if getSpaceToken request fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(obsService.openViewer({ spaceName: 'test-space' })).rejects.toThrow(
        'OBS SpaceToken request failed: HTTP 500'
      );
    });

    it('should throw error if API returns error code', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          message: 'Invalid signature'
        })
      });

      await expect(obsService.openViewer({ spaceName: 'test-space' })).rejects.toThrow(
        'OBS SpaceToken request failed: Invalid signature'
      );
    });

    it('should fall back to options or throw if no spaceName is specified', async () => {
      // If no spaceName is specified and config spaceName is empty
      await expect(obsService.openViewer({})).rejects.toThrow(
        'OBS space name is empty'
      );
    });
  });

  describe('listChildren', () => {
    it('reuses an in-flight SpaceToken request and normalizes relative child paths', async () => {
      const mockFetch = vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/api/v1/space/group/getSpaceToken')) {
          return {
            ok: true,
            json: async () => ({ code: 1, data: { spaceToken: 'shared-token' } }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            code: 1,
            data: [
              {
                fileType: 'FOLDER',
                fileName: 'eco',
                fullPath: '/scripts/hibist/eco',
                parentPath: '/scripts/hibist',
                md5: '',
              },
              {
                fileType: 'FILE',
                fileName: 'gen_cfg.py',
                fullPath: '/scripts/hibist/gen_cfg.py',
                parentPath: '/scripts/hibist',
                md5: 'e10adc3949ba59abbe56e057f20f883e',
              },
            ],
          }),
        } as Response;
      });
      global.fetch = mockFetch;

      const [first, second] = await Promise.all([
        obsService.listChildren('test-space', '/scripts/hibist'),
        obsService.listChildren('test-space', '/scripts/hibist'),
      ]);

      expect(first[0]).toMatchObject({ name: 'eco', path: '/scripts/hibist/eco', type: 'folder' });
      expect(first[1]).toMatchObject({
        name: 'gen_cfg.py',
        path: '/scripts/hibist/gen_cfg.py',
        type: 'file',
        md5: 'e10adc3949ba59abbe56e057f20f883e',
        etag: 'e10adc3949ba59abbe56e057f20f883e',
      });
      expect(second).toEqual(first);
      expect(mockFetch.mock.calls.filter(([input]) => String(input).includes('/api/v1/space/group/getSpaceToken'))).toHaveLength(1);
      expect(mockFetch.mock.calls.every(([input]) =>
        String(input).startsWith('https://obs.test.com/file-system-server-test/api/v1/')
      )).toBe(true);
    });
  });
});
