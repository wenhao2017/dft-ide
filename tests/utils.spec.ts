import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRecord, pathExists, readJsonFile, executeFileCommand } from '../src/services/utils';
import { mockFilesystem, resetMockFilesystem } from './setup';
import * as child_process from 'child_process';

vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], options: any, callback: any) => {
    if (cmd === 'error-command') {
      callback(new Error('Command failed'), '', '');
    } else if (cmd === 'stderr-error') {
      callback(null, '', 'Some Error occurred');
    } else {
      callback(null, 'Success output', '');
    }
  })
}));

describe('utils', () => {
  beforeEach(() => {
    resetMockFilesystem();
  });

  describe('isRecord', () => {
    it('should identify records correctly', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
      expect(isRecord([])).toBe(false);
      expect(isRecord(null)).toBe(false);
      expect(isRecord(123)).toBe(false);
      expect(isRecord('string')).toBe(false);
      expect(isRecord(undefined)).toBe(false);
    });
  });

  describe('pathExists', () => {
    it('should return true if path exists in mock fs', async () => {
      mockFilesystem.set('/mock/project/root/test.txt', 'hello');
      const exists = await pathExists('/mock/project/root/test.txt');
      expect(exists).toBe(true);
    });

    it('should return false if path does not exist', async () => {
      const exists = await pathExists('/mock/project/root/missing.txt');
      expect(exists).toBe(false);
    });
  });

  describe('readJsonFile', () => {
    it('should read and parse valid json', async () => {
      mockFilesystem.set('/mock/project/root/data.json', '{"a": 1, "b": "test"}');
      const data = await readJsonFile('/mock/project/root/data.json');
      expect(data).toEqual({ a: 1, b: 'test' });
    });

    it('should return null for invalid json', async () => {
      mockFilesystem.set('/mock/project/root/invalid.json', '{a: 1}');
      const data = await readJsonFile('/mock/project/root/invalid.json');
      expect(data).toBeNull();
    });

    it('should return null if file does not exist', async () => {
      const data = await readJsonFile('/mock/project/root/nonexistent.json');
      expect(data).toBeNull();
    });
  });

  describe('executeFileCommand', () => {
    it('should resolve with stdout on success', async () => {
      const output = await executeFileCommand('success-command', []);
      expect(output).toBe('Success output');
    });

    it('should reject on command error', async () => {
      await expect(executeFileCommand('error-command', [])).rejects.toThrow('Command failed');
    });

    it('should reject if stderr contains error message', async () => {
      await expect(executeFileCommand('stderr-error', [])).rejects.toThrow('Some Error occurred');
    });
  });
});
