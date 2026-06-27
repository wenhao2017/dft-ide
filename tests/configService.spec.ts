import { describe, it, expect, beforeEach } from 'vitest';
import {
  mergeConfigFile,
  sanitizeCfgModuleName,
  resolveCfgPath,
  makeUniqueCfgModuleName,
  toFlowConfigFileInfo,
  collectModuleNames,
  createFlowConfigFile,
  duplicateFlowConfigFile,
  renameFlowConfigFile,
  deleteFlowConfigFile,
} from '../src/services/configService';
import { mockFilesystem, resetMockFilesystem } from './setup';
import * as vscode from 'vscode';

describe('configService', () => {
  beforeEach(() => {
    resetMockFilesystem();
  });

  describe('mergeConfigFile', () => {
    it('should merge data if file exists', async () => {
      mockFilesystem.set('/mock/config.json', JSON.stringify({ a: 1, b: 2 }));
      const merged = await mergeConfigFile('/mock/config.json', { b: 3, c: 4 });
      expect(merged).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should return new data if file does not exist', async () => {
      const merged = await mergeConfigFile('/mock/nonexistent.json', { a: 1 });
      expect(merged).toEqual({ a: 1 });
    });
  });

  describe('sanitizeCfgModuleName', () => {
    it('should sanitize module names properly', () => {
      expect(sanitizeCfgModuleName('my_module.cfg')).toBe('my_module');
      expect(sanitizeCfgModuleName('  module-name  ')).toBe('module-name');
      expect(sanitizeCfgModuleName('module#name$1')).toBe('module_name_1');
    });

    it('should throw error if module name becomes empty', () => {
      expect(() => sanitizeCfgModuleName('###')).toThrow('Module name is required.');
    });
  });

  describe('resolveCfgPath', () => {
    it('should return resolved .cfg path', () => {
      const p = resolveCfgPath('/mock/configs', 'my-module');
      expect(p).toBe('/mock/configs/my-module.cfg');
    });
  });

  describe('makeUniqueCfgModuleName', () => {
    it('should return base if it does not exist', async () => {
      const name = await makeUniqueCfgModuleName('/mock/configs', 'mod');
      expect(name).toBe('mod');
    });

    it('should return suffixed name if name exists', async () => {
      mockFilesystem.set('/mock/configs/mod.cfg', 'module = mod');
      const name = await makeUniqueCfgModuleName('/mock/configs', 'mod');
      expect(name).toBe('mod_1');
    });

    it('should continue suffixing until unique name is found', async () => {
      mockFilesystem.set('/mock/configs/mod.cfg', 'module = mod');
      mockFilesystem.set('/mock/configs/mod_1.cfg', 'module = mod_1');
      const name = await makeUniqueCfgModuleName('/mock/configs', 'mod');
      expect(name).toBe('mod_2');
    });
  });

  describe('toFlowConfigFileInfo', () => {
    it('should build FlowConfigFileInfo object correctly', () => {
      const stat: vscode.FileStat = {
        type: 1,
        mtime: 1234567,
        size: 99
      };
      const info = toFlowConfigFileInfo('/mock/project/root/configs/mod.cfg', stat);
      expect(info.key).toBe('mod');
      expect(info.moduleName).toBe('mod');
      expect(info.fileName).toBe('mod.cfg');
      expect(info.filePath).toBe('/mock/project/root/configs/mod.cfg');
      expect(info.workDir).toBe('/mock/project/root/mod');
      expect(info.updatedAt).toBe(1234567);
      expect(info.size).toBe(99);
    });
  });

  describe('collectModuleNames', () => {
    it('should extract module names from various keys recursively', () => {
      const modules = new Set<string>();
      const data = {
        project: 'test',
        blocks: [
          { moduleName: 'mod_a', type: 'core' },
          { block_name: 'mod_b', type: 'periph' },
        ],
        details: {
          design_module: 'mod_c'
        }
      };

      collectModuleNames(data, modules);
      expect(Array.from(modules)).toEqual(['mod_a', 'mod_b', 'mod_c']);
    });
  });

  describe('file operations', () => {
    const configsDir = '/mock/project/root/hibist/configs';

    beforeEach(() => {
      // Create configs dir structure
      mockFilesystem.set(resolveCfgPath(configsDir, 'existing'), '# content');
    });

    it('should create flow config file', async () => {
      const info = await createFlowConfigFile('hibist', 'new-module');
      expect(info.moduleName).toBe('new-module');
      expect(mockFilesystem.has(info.filePath)).toBe(true);
      expect(mockFilesystem.get(info.filePath)).toContain('module = new-module');
    });

    it('should fail to create flow config file if it already exists', async () => {
      await expect(createFlowConfigFile('hibist', 'existing')).rejects.toThrow(
        'Config already exists'
      );
    });

    it('should duplicate config file', async () => {
      const info = await duplicateFlowConfigFile('hibist', 'existing');
      expect(info.moduleName).toBe('existing_copy');
      expect(mockFilesystem.has(info.filePath)).toBe(true);
      expect(mockFilesystem.get(info.filePath)).toBe('# content');
    });

    it('should rename config file', async () => {
      const info = await renameFlowConfigFile('hibist', 'existing', 'new-name');
      expect(info.moduleName).toBe('new-name');
      expect(mockFilesystem.has(resolveCfgPath(configsDir, 'existing'))).toBe(false);
      expect(mockFilesystem.has(resolveCfgPath(configsDir, 'new-name'))).toBe(true);
    });

    it('should delete config file', async () => {
      await deleteFlowConfigFile('hibist', 'existing');
      expect(mockFilesystem.has(resolveCfgPath(configsDir, 'existing'))).toBe(false);
    });
  });
});
