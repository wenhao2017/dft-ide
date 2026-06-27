import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runVscodeDemo } from '../src/services/demoService';
import * as vscode from 'vscode';

describe('demoService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should show information message for notification action', async () => {
    await runVscodeDemo('notification');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('项目状态已刷新')
    );
  });

  it('should prompt user with quick pick and display choice', async () => {
    // QuickPick mock defaults to first item
    await runVscodeDemo('quickPick');
    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('已选择：')
    );
  });

  it('should write to clipboard and show information message', async () => {
    await runVscodeDemo('clipboard');
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('DFT IDE clipboard demo');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('已写入剪贴板')
    );
  });

  it('should create and control terminal', async () => {
    await runVscodeDemo('terminal');
    expect(vscode.window.createTerminal).toHaveBeenCalledWith('DFT IDE Demo');
  });

  it('should open settings page', async () => {
    await runVscodeDemo('settings');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      'DFT IDE'
    );
  });

  it('should open external url', async () => {
    await runVscodeDemo('external');
    expect(vscode.env.openExternal).toHaveBeenCalled();
  });

  it('should show warning message for unknown actions', async () => {
    await runVscodeDemo('invalid-action');
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('未知的 VS Code 能力示例')
    );
  });
});
