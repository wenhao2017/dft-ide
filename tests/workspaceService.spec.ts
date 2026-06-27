import { describe, it, expect, beforeEach } from 'vitest';
import {
  toConfigPathSegment,
  resolveProjectRoot,
  resolveLocalConfigDirectory,
  resolveConfigPath,
  resolveExecutionCwd,
  resolveDefaultProjectName,
  toProjectStateDirectoryName,
  hashString,
  normalizeFsPath,
} from '../src/services/workspaceService';
import { resetMockFilesystem } from './setup';

describe('workspaceService', () => {
  beforeEach(() => {
    resetMockFilesystem();
  });

  describe('toConfigPathSegment', () => {
    it('should normalize segment names', () => {
      expect(toConfigPathSegment('Common')).toBe('common');
      expect(toConfigPathSegment('Hibist-Flow/Test')).toBe('hibist-flow-test');
      expect(toConfigPathSegment('   ')).toBe('default');
    });
  });

  describe('resolveProjectRoot', () => {
    it('should return parent directory of mock folders', () => {
      const root = resolveProjectRoot();
      expect(root).toBe('/mock/project/root');
    });
  });

  describe('resolveLocalConfigDirectory', () => {
    it('should resolve state directory path', () => {
      const dir = resolveLocalConfigDirectory();
      expect(dir).toBe('/mock/project/root/.dft-ide/local-state');
    });
  });

  describe('resolveConfigPath', () => {
    it('should return path to json config file', () => {
      const path1 = resolveConfigPath('common');
      expect(path1).toBe('/mock/project/root/.dft-ide/local-state/common.json');

      const path2 = resolveConfigPath('hibist/module1/config');
      expect(path2).toBe('/mock/project/root/.dft-ide/local-state/hibist/module1/config.json');
    });

    it('should default to default.json for empty inputs', () => {
      const pathDefault = resolveConfigPath('');
      expect(pathDefault).toBe('/mock/project/root/.dft-ide/local-state/default.json');
    });
  });

  describe('resolveExecutionCwd', () => {
    it('should map titles and commands to execution working directory', () => {
      const cwd1 = resolveExecutionCwd('Verification Run', 'some-cmd');
      expect(cwd1).toBe('/mock/project/root/verification');

      const cwd2 = resolveExecutionCwd('Generic Title', 'generic-cmd');
      expect(cwd2).toBe('/mock/project/root/hibist');
    });
  });

  describe('resolveDefaultProjectName', () => {
    it('should resolve project name based on project root', () => {
      const name = resolveDefaultProjectName();
      expect(name).toBe('root');
    });
  });

  describe('hashString', () => {
    it('should produce consistent hash strings', () => {
      const h1 = hashString('test-string');
      const h2 = hashString('test-string');
      const h3 = hashString('different-string');
      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });
  });

  describe('toProjectStateDirectoryName', () => {
    it('should create safe directory name with hash', () => {
      const dirName = toProjectStateDirectoryName('/Users/name/projects/my-dft-project');
      expect(dirName).toContain('my-dft-project');
    });
  });

  describe('normalizeFsPath', () => {
    it('should clean slashes and lowercase path', () => {
      expect(normalizeFsPath('/Path/To/Folder/')).toBe('/path/to/folder');
    });
  });
});
