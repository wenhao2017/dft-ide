import * as vscode from 'vscode';
import { LAYOUT_BACKUP_KEY } from './constants';

export async function applyDftIdeLayout(context: vscode.ExtensionContext, silent: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('dftIde');
  const hideMenuBar = config.get<boolean>('layout.hideMenuBar', true);
  const hideActivityBar = config.get<boolean>('layout.hideActivityBar', true);

  const updates: Array<[string, unknown]> = [
    ['window.commandCenter', false],
    ['workbench.layoutControl.enabled', false],
    ['workbench.startupEditor', 'none'],
    ['workbench.editor.showTabs', true],
    ['breadcrumbs.enabled', false],
  ];

  if (hideMenuBar) {
    updates.push(['window.menuBarVisibility', 'hidden']);
  }

  if (hideActivityBar) {
    updates.push(['workbench.activityBar.visible', false]);
    updates.push(['workbench.activityBar.location', 'hidden']);
  }

  await backupLayoutSettings(context, updates.map(([key]) => key));
  await updateUserSettings(updates);

  if (!silent) {
    vscode.window.showInformationMessage('DFT IDE 布局已应用。');
  }
}

export async function restoreVscodeLayout(context: vscode.ExtensionContext): Promise<void> {
  const backup = context.globalState.get<Array<{ key: string; hasValue: boolean; value: unknown }>>(
    LAYOUT_BACKUP_KEY,
    []
  );

  if (backup.length > 0) {
    await updateUserSettings(
      backup.map((item) => [item.key, item.hasValue ? item.value : undefined])
    );
    await context.globalState.update(LAYOUT_BACKUP_KEY, undefined);
  } else {
    await updateUserSettings([
      ['window.menuBarVisibility', undefined],
      ['window.commandCenter', undefined],
      ['workbench.activityBar.visible', undefined],
      ['workbench.activityBar.location', undefined],
      ['workbench.layoutControl.enabled', undefined],
      ['workbench.startupEditor', undefined],
      ['workbench.editor.showTabs', undefined],
      ['breadcrumbs.enabled', undefined],
    ]);
  }

  vscode.window.showInformationMessage('已恢复 VS Code 默认布局设置。');
}

async function backupLayoutSettings(context: vscode.ExtensionContext, keys: string[]): Promise<void> {
  const existing = context.globalState.get<Array<{ key: string; hasValue: boolean; value: unknown }>>(
    LAYOUT_BACKUP_KEY
  );
  if (existing) {
    return;
  }

  const backup = keys.map((key) => {
    const inspected = vscode.workspace.getConfiguration().inspect(key);
    return {
      key,
      hasValue: inspected?.globalValue !== undefined,
      value: inspected?.globalValue,
    };
  });

  await context.globalState.update(LAYOUT_BACKUP_KEY, backup);
}

async function updateUserSettings(updates: Array<[string, unknown]>): Promise<void> {
  await Promise.all(
    updates.map(([key, value]) =>
      vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global)
    )
  );
}
