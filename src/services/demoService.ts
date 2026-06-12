import * as vscode from 'vscode';

export async function runVscodeDemo(action: unknown): Promise<void> {
  switch (action) {
    case 'notification':
      await vscode.window.showInformationMessage('DFT IDE 通知示例：项目状态已刷新。');
      return;
    case 'quickPick': {
      const picked = await vscode.window.showQuickPick(
        ['Common 配置', 'Hibist 工作流', 'Sailor 工作流', 'Verification 工作流'],
        { placeHolder: '选择要进入的 DFT 功能区' }
      );
      if (picked) {
        await vscode.window.showInformationMessage(`已选择：${picked}`);
      }
      return;
    }
    case 'clipboard':
      await vscode.env.clipboard.writeText('DFT IDE clipboard demo');
      await vscode.window.showInformationMessage('示例文本已写入剪贴板。');
      return;
    case 'terminal': {
      const terminal = vscode.window.createTerminal('DFT IDE Demo');
      terminal.show();
      terminal.sendText('echo DFT IDE terminal demo');
      return;
    }
    case 'settings':
      await vscode.commands.executeCommand('workbench.action.openSettings', 'DFT IDE');
      return;
    case 'external':
      await vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/api'));
      return;
    default:
      await vscode.window.showWarningMessage('未知的 VS Code 能力示例。');
  }
}
