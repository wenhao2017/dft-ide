import { describe, it, expect, vi, beforeEach } from 'vitest';
import { obsService } from '../src/services/obsService';
import * as vscode from 'vscode';

describe('ObsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
