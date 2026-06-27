import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyDftIdeLayout, restoreVscodeLayout } from '../src/services/layoutService';
import * as vscode from 'vscode';
import { LAYOUT_BACKUP_KEY } from '../src/services/constants';

describe('layoutService', () => {
  let mockContext: vscode.ExtensionContext;
  let globalStateStore: Map<string, any>;

  beforeEach(() => {
    globalStateStore = new Map();
    mockContext = {
      globalState: {
        get: vi.fn((key: string, defaultValue?: any) => {
          return globalStateStore.has(key) ? globalStateStore.get(key) : defaultValue;
        }),
        update: vi.fn(async (key: string, value: any) => {
          if (value === undefined) {
            globalStateStore.delete(key);
          } else {
            globalStateStore.set(key, value);
          }
        })
      }
    } as unknown as vscode.ExtensionContext;
    vi.restoreAllMocks();
  });

  describe('applyDftIdeLayout', () => {
    it('should backup settings and write new config settings', async () => {
      await applyDftIdeLayout(mockContext, false);

      // Verify layout settings backed up
      expect(mockContext.globalState.update).toHaveBeenCalledWith(
        LAYOUT_BACKUP_KEY,
        expect.any(Array)
      );

      // Verify info message displayed if not silent
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('DFT IDE 布局已应用。');
    });

    it('should not display message if silent is true', async () => {
      await applyDftIdeLayout(mockContext, true);
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
  });

  describe('restoreVscodeLayout', () => {
    it('should restore configuration settings from backup', async () => {
      // Setup a backup in global state
      globalStateStore.set(LAYOUT_BACKUP_KEY, [
        { key: 'window.commandCenter', hasValue: true, value: true },
        { key: 'window.menuBarVisibility', hasValue: false, value: undefined }
      ]);

      await restoreVscodeLayout(mockContext);

      // Verify backup cleared
      expect(mockContext.globalState.update).toHaveBeenCalledWith(LAYOUT_BACKUP_KEY, undefined);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        '已恢复 VS Code 默认布局设置。'
      );
    });

    it('should update configurations to default if no backup exists', async () => {
      await restoreVscodeLayout(mockContext);
      
      // Still show information message
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        '已恢复 VS Code 默认布局设置。'
      );
    });
  });
});
