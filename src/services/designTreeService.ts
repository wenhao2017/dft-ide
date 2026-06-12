import * as vscode from 'vscode';
import * as path from 'path';
import { readJsonFile, isRecord } from './utils';
import {
  resolveConfigPath,
  getSyncedArtifactPath,
  resolveProjectRoot,
  ensureLocalConfigDirectory,
} from './workspaceService';
import { mergeConfigFile } from './configService';

export async function readDesignTreeState(flow?: string): Promise<Record<string, unknown> | null> {
  const commonPath = resolveConfigPath('common');
  if (!commonPath) {
    return null;
  }

  const common = await readJsonFile(commonPath);
  const syncedDesignTreePath = getSyncedArtifactPath(common, flow, 'designTree');
  if (syncedDesignTreePath) {
    const fileData = await readJsonFile(syncedDesignTreePath);
    if (fileData) {
      return {
        ...fileData,
        sourcePath: syncedDesignTreePath,
        sourceMode: 'repoDesignTreeFile'
      };
    }
  }

  const designTreeFilePath = resolveDesignTreeFilePath(common);
  if (designTreeFilePath) {
    const fileData = await readJsonFile(designTreeFilePath);
    if (fileData) {
      return {
        ...fileData,
        sourcePath: designTreeFilePath,
        sourceMode: 'designTreeFile'
      };
    }
  }

  const draft = common?.designTreeDraft;
  return isRecord(draft) ? { ...draft, sourceMode: 'commonMock' } : null;
}

export async function saveDesignTreeState(
  flow: string,
  data: Record<string, unknown>
): Promise<{ filePath: string; mode: string }> {
  const commonPath = resolveConfigPath('common');
  if (!commonPath) {
    throw new Error('Workspace local-state path is not available.');
  }

  await ensureLocalConfigDirectory(path.dirname(commonPath));
  const common = await readJsonFile(commonPath);
  const syncedDesignTreePath = getSyncedArtifactPath(common, flow, 'designTree');
  const designTreeFilePath = syncedDesignTreePath ?? resolveDesignTreeFilePath(common);
  const encoded = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');

  if (designTreeFilePath) {
    await ensureLocalConfigDirectory(path.dirname(designTreeFilePath));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(designTreeFilePath), encoded);
    await updateModuleConfigSkeleton(flow, data);
    return {
      filePath: vscode.workspace.asRelativePath(designTreeFilePath),
      mode: 'designTreeFile'
    };
  }

  const mergedCommon = await mergeConfigFile(commonPath, {
    designTreeDraft: data,
    designTreeUpdatedAt: new Date().toISOString()
  });
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(commonPath),
    Buffer.from(JSON.stringify(mergedCommon, null, 2), 'utf-8')
  );
  await updateModuleConfigSkeleton(flow, data);
  return {
    filePath: vscode.workspace.asRelativePath(commonPath),
    mode: 'commonMock'
  };
}

export async function updateModuleConfigSkeleton(flow: string, treeState: Record<string, unknown>): Promise<void> {
  const flowPath = resolveConfigPath(flow);
  if (!flowPath) {
    return;
  }

  await ensureLocalConfigDirectory(path.dirname(flowPath));
  const existing = await readJsonFile(flowPath) ?? {};
  const { moduleConfigs: _legacyModuleConfigs, ...flowState } = existing;
  const modules = collectDesignTreeModules(treeState.nodes);

  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(flowPath),
    Buffer.from(JSON.stringify({
      ...flowState,
      activeModuleKey: typeof existing.activeModuleKey === 'string' ? existing.activeModuleKey : modules[0]?.key,
      modules: modules.map((module) => ({
        key: module.key,
        title: module.title,
        type: module.type
      }))
    }, null, 2), 'utf-8')
  );

  for (const module of modules) {
    const modulePath = resolveConfigPath(`${flow}/${module.key}/config`);
    if (!modulePath) {
      continue;
    }
    await ensureLocalConfigDirectory(path.dirname(modulePath));
    const previous = await readJsonFile(modulePath) ?? {};
    const merged = {
      ...previous,
      moduleKey: module.key,
      title: module.title,
      type: module.type,
      updatedFromDesignTreeAt: new Date().toISOString()
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(modulePath),
      Buffer.from(JSON.stringify(merged, null, 2), 'utf-8')
    );
  }
}

export function resolveDesignTreeFilePath(common: Record<string, unknown> | null): string | undefined {
  const rawPath = typeof common?.designTree === 'string' ? common.designTree.trim() : '';
  if (!rawPath) {
    return undefined;
  }

  const projectRoot = resolveProjectRoot();
  const resolved = path.isAbsolute(rawPath)
    ? rawPath
    : projectRoot ? path.resolve(projectRoot, rawPath) : undefined;

  if (!resolved) {
    return undefined;
  }

  return path.extname(resolved) ? resolved : path.join(resolved, 'design_tree.mock.json');
}

export function collectDesignTreeModules(value: unknown): Array<{ key: string; title: string; type: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const modules: Array<{ key: string; title: string; type: string }> = [];
  const visit = (items: unknown[]) => {
    for (const item of items) {
      if (!isRecord(item)) {
        continue;
      }
      const key = typeof item.key === 'string' ? item.key : '';
      const title = typeof item.title === 'string' ? item.title : key;
      const type = typeof item.type === 'string' ? item.type : 'module';
      if (key) {
        modules.push({ key, title, type });
      }
      if (Array.isArray(item.children)) {
        visit(item.children);
      }
    }
  };

  visit(value);
  return modules;
}
