import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { pathExists, readJsonFile, isRecord, getFileNameAndExtension, getDirectory } from './utils';
import { obsTrackingService } from './obsTrackingService';
import {
  resolveConfigPath,
  resolveProjectRepoRoot,
  getFlowConfigsDirectory,
  ensureLocalConfigDirectory,
  normalizeConfigFlow,
  getSyncedArtifactPath,
  resolveProjectRoot,
  DefaultConfigLog,
} from './workspaceService';

export interface FlowConfigFileInfo {
  key: string;
  moduleName: string;
  fileName: string;
  filePath: string;
  workDir: string;
  updatedAt?: number;
  size?: number;
}

export async function readConfig(flow: string): Promise<Record<string, unknown> | null> {
  const filePath = resolveConfigPath(flow);
  if (filePath) {
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(filePath)
      );

      const data = JSON.parse(Buffer.from(bytes).toString('utf-8'));
      return data;
    } catch (error) {
      console.error(`Failed to read config for flow:${flow}`, error);
    }
  }
  return null;
}

export async function mergeConfigFile(
  filePath: string,
  newData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const existing = JSON.parse(Buffer.from(bytes).toString('utf-8')) as Record<string, unknown>;
    return { ...existing, ...newData };
  } catch {
    // 文件不存在（首次保存）或解析失败，直接使用新数据
    return newData;
  }
}

export async function listFlowConfigFiles(flow: 'hibist' | 'sailor' | 'verification'): Promise<{
  configs: FlowConfigFileInfo[];
  configsDir: string;
}> {
  const configsDir = await getFlowConfigsDirectory(flow);
  await ensureLocalConfigDirectory(configsDir);
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(configsDir));
  const configs: FlowConfigFileInfo[] = [];

  for (const [name, type] of entries) {
    if (type === vscode.FileType.Directory) {
      const subEntries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(path.join(configsDir, name)));
      for (const [subName, subType] of subEntries) {
        if (subType !== vscode.FileType.File || path.extname(subName).toLowerCase() !== '.cfg') {
          continue;
        }
        const filePath = path.join(configsDir, name, subName);
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        configs.push(toFlowConfigFileInfo(filePath, stat));
      }
    } else if (type === vscode.FileType.File) {
      if (path.extname(name).toLowerCase() !== '.cfg') {
        continue;
      }
      const filePath = path.join(configsDir, name);
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      configs.push(toFlowConfigFileInfo(filePath, stat));
    }
  }

  configs.sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  return { configs, configsDir };
}

export async function createFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const target = resolveCfgPath(configsDir, moduleName);
  if (await pathExists(target)) {
    throw new Error(`Config already exists: ${path.basename(target)}`);
  }
  const content = [
    `# Auto-generated default ${flow} config`,
    `module = ${moduleName}`,
    `flow = ${flow}`,
    ''
  ].join('\n');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(target), Buffer.from(content, 'utf-8'));
  const targetStat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, targetStat);
}

export async function duplicateFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const source = resolveCfgPath(configsDir, moduleName);
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(source));
  if (stat.type !== vscode.FileType.File) {
    throw new Error(`Config is not a file: ${moduleName}`);
  }

  const targetModule = await makeUniqueCfgModuleName(configsDir, `${path.basename(moduleName, '.cfg')}_copy`);
  const target = resolveCfgPath(configsDir, targetModule);
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(source));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(target), bytes);
  const targetStat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, targetStat);
}

export async function renameFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string,
  nextModuleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const source = resolveCfgPath(configsDir, moduleName);
  const target = resolveCfgPath(configsDir, nextModuleName);
  if (path.resolve(source).toLowerCase() === path.resolve(target).toLowerCase()) {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(source));
    return toFlowConfigFileInfo(source, stat);
  }
  if (await pathExists(target)) {
    throw new Error(`Config already exists: ${path.basename(target)}`);
  }
  await vscode.workspace.fs.rename(vscode.Uri.file(source), vscode.Uri.file(target));
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, stat);
}

export async function deleteFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<void> {
  const configsDir = await getFlowConfigsDirectory(flow);
  await vscode.workspace.fs.delete(vscode.Uri.file(resolveCfgPath(configsDir, moduleName)));
}

export async function downLoadObsScripts(flow: 'hibist' | 'sailor' | 'verification'): Promise<string> {
  const configsDir = await getFlowConfigsDirectory(flow);
  await ensureLocalConfigDirectory(configsDir);

  // 1. 去特定空间下载转换脚本（具体空间与路径在 package.json 预留，可留空后填）
  const obsConfig = vscode.workspace.getConfiguration('dftIde.obs');
  const scriptSpace = obsConfig.get<string>('scriptSpace', '').trim();
  const scriptPaths = obsConfig.get<Record<string, Record<string, any>>>('scriptPaths', {});
  const remoteScriptPath = scriptPaths?.[flow]?.dir.trim() || '';
  const remoteScriptFiles = scriptPaths?.[flow]?.files || [];

  if (scriptSpace && remoteScriptPath) {
    try {
      for (const filename of remoteScriptFiles){
        if (typeof filename !== 'string' || path.basename(filename) !== filename) {
          throw new Error(`Invalid OBS script file name: ${String(filename)}`);
        }
        const localScriptPath = path.join(configsDir, filename);
        const remoteFilePath = path.posix.join(remoteScriptPath.replace(/\\/g, '/'), filename);
        await obsTrackingService.downloadFile(scriptSpace, remoteFilePath, vscode.Uri.file(localScriptPath), {
          overwriteUntracked: true,
        });
        try {
          await fs.promises.chmod(localScriptPath, 0o755);
        } catch (error) {
          console.warn(`[DFT IDE] OBS script downloaded but chmod failed: ${localScriptPath}`, error);
        }
        console.log(`[DFT IDE] OBS script downloaded from [${scriptSpace}] to: ${localScriptPath}`);
      }
      return configsDir;
    } catch (err) {
      console.warn(`[DFT IDE] 从 OBS 空间 [${scriptSpace}] 下载转换脚本失败:`, err);
      return '';
    }
  } else {
    console.info(`[DFT IDE] 尚未配置 dftIde.obs.scriptSpace 或 scriptPaths.${flow}，预留空项待填`);
    return '';
  }
}

export function resolveCfgPath(configsDir: string, moduleName: string): string {
  const clean = sanitizeCfgModuleName(moduleName);
  return path.join(configsDir, clean, `${clean}.sailor.cfg`);
}

export function sanitizeCfgModuleName(value: string): string {
  const clean = path.basename(value.trim().replace(/\.cfg$/i, '')).replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!clean) {
    throw new Error('Module name is required.');
  }
  return clean;
}

export async function makeUniqueCfgModuleName(configsDir: string, base: string): Promise<string> {
  const cleanBase = sanitizeCfgModuleName(base);
  let candidate = cleanBase;
  let index = 1;
  while (await pathExists(resolveCfgPath(configsDir, candidate))) {
    candidate = `${cleanBase}_${index++}`;
  }
  return candidate;
}

export function toFlowConfigFileInfo(filePath: string, stat: vscode.FileStat): FlowConfigFileInfo {
  const fileName = path.basename(filePath);
  let moduleName = path.basename(fileName, '.cfg');
  let workPath = path.dirname(path.dirname(filePath));
  if (path.extname(moduleName).toLowerCase() === '.sailor') {
    moduleName = path.basename(moduleName, '.sailor');
    workPath = path.join(path.dirname(workPath), 'work');
  } else {
    workPath = path.join(workPath, 'work');
  }

  return {
    key: moduleName,
    moduleName,
    fileName,
    filePath,
    workDir: path.join(workPath, moduleName),
    updatedAt: stat.mtime,
    size: stat.size
  };
}

export async function readModulesFromNormalizedTable(flow: 'hibist' | 'sailor' | 'verification'): Promise<string[]> {
  const normTablePath = await resolveNormalizedTablePath(flow);
  const modules = new Set<string>();

  if (normTablePath) {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(normTablePath));
      const text = Buffer.from(bytes).toString('utf-8');
      const parsed = JSON.parse(text);
      collectModuleNames(parsed, modules);
    } catch {
      // The generator stays useful even when the mock table is absent or incomplete.
    }
  }

  return [...modules].map(sanitizeCfgModuleName).sort((a, b) => a.localeCompare(b));
}

export async function resolveNormalizedTablePath(flow: 'hibist' | 'sailor' | 'verification'): Promise<string | undefined> {
  const commonPath = resolveConfigPath('common');
  const common = commonPath ? await readJsonFile(commonPath) : null;
  const synced = getSyncedArtifactPath(common, flow, 'normTable');
  if (synced && await pathExists(synced)) {
    return synced;
  }

  const dataForm = isRecord(common?.data) ? common.data : undefined;
  const configured = [
    dataForm?.normTable,
    common?.dataNormTable,
    common?.normTable
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (configured) {
    const resolved = path.isAbsolute(configured)
      ? configured
      : path.resolve(resolveProjectRoot() ?? path.dirname(commonPath ?? ''), configured);
    if (await pathExists(resolved)) {
      return resolved;
    }
  }

  try {
    const dataRoot = await resolveProjectRepoRoot('data');
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dataRoot));
    const match = entries.find(([name, type]) =>
      type === vscode.FileType.File && /^normalized-table\.(json|csv|md|txt)$/i.test(name)
    );
    return match ? path.join(dataRoot, match[0]) : undefined;
  } catch {
    return undefined;
  }
}

export function collectModuleNames(value: unknown, modules: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectModuleNames(item, modules));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const moduleKeys = [
    'moduleName',
    'module_name',
    'module',
    'moduleId',
    'module_id',
    'block',
    'blockName',
    'block_name',
    'designModule',
    'design_module'
  ];
  for (const key of moduleKeys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      modules.add(candidate.trim());
    }
  }

  Object.values(value).forEach((item) => {
    if (typeof item === 'object' && item !== null) {
      collectModuleNames(item, modules);
    }
  });
}

export async function saveDefaultConfigLogs(defaultConfigLog: DefaultConfigLog) {
  try{
    const flow = defaultConfigLog.flow;
    const configsDir = await getFlowConfigsDirectory(flow);

    const scriptPath = await copyLogFile(defaultConfigLog.scriptPath, defaultConfigLog.timemilles || '', configsDir);
    const designTree = await copyLogFile(defaultConfigLog.designTree, defaultConfigLog.timemilles || '', configsDir);
    const normTable = await copyLogFile(defaultConfigLog.normTable, defaultConfigLog.timemilles || '', configsDir);
    const success = await checkExecuteStatus(defaultConfigLog.logFile || '');
    const maxHistoryCounts = vscode.workspace.getConfiguration('dftIde').get<number>('maxHistoryCounts', 10);

    const filePath = resolveCfgPath(configsDir, "history");
    let content = [
      `{flow: "${flow}"`,
      `scriptPath: "${scriptPath.replace(/\\/g, '/')}"`,
      `designTree: "${designTree.replace(/\\/g, '/')}"`,
      `normTable: "${normTable.replace(/\\/g, '/')}"`,
      `logFile: "${defaultConfigLog.logFile?.replace(/\\/g, '/')}"`,
      `time: "${defaultConfigLog.timestamp}"`,
      `success: ${success}}`,
    ].join(',');
    if (await pathExists(filePath)) {
      const data = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      let existingContent = Buffer.from(data).toString();
      const rows = existingContent.split('\n');
      if (rows.length < maxHistoryCounts) {
        content +=  "\n" + existingContent;
      } else {
        const removed = rows.pop();
        await removeLogFile(removed || '');
        rows.forEach(row => {
          content += "\n" + row;
        });
      }
    }
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf-8'));
    return { defaultConfigLog };
  }catch (error) {
    vscode.window.showErrorMessage(`${(error as Error).message}`);
    return undefined;
  }
}

export async function copyLogFile(filePath: string, timemilles: string, configsDir: string): Promise<string> {
  try {
    const { name, extension } = getFileNameAndExtension(filePath);
    const fullName = `${configsDir}/.logs/${name}_${timemilles}${extension ? '.' + extension : ''}`;
    await vscode.workspace.fs.copy(vscode.Uri.file(filePath),
      vscode.Uri.file(fullName));
    return fullName;
  } catch (error) {
    vscode.window.showErrorMessage(`${(error as Error).message}`);
    return '';
  }
}

export async function moveLogFile(filePath: string, configsDir: string): Promise<string> {
  try {
    const { name, extension } = getFileNameAndExtension(filePath);
    const fullName = `${configsDir}/.logs/${name}${extension ? '.' + extension : ''}`;
    await vscode.workspace.fs.rename(vscode.Uri.file(filePath),
      vscode.Uri.file(fullName));
    return fullName;
  } catch (error) {
    vscode.window.showErrorMessage(`${(error as Error).message}`);
    return '';
  }
}

export async function removeLogFile(content: string): Promise<void> {
  try {
    const obj: DefaultConfigLog = new Function("return " + `${content}`)();
    await vscode.workspace.fs.delete(vscode.Uri.file(obj.scriptPath), { recursive: false });
    await vscode.workspace.fs.delete(vscode.Uri.file(obj.designTree), { recursive: false });
    await vscode.workspace.fs.delete(vscode.Uri.file(obj.normTable), { recursive: false });
    await vscode.workspace.fs.delete(vscode.Uri.file(obj.logFile || ''), { recursive: false });
  } catch (error) {}
}

export async function checkExecuteStatus(logFile: string): Promise<boolean> {
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(logFile));
    const text = document.getText();
    const pattern = /\berror\b|\bexception\b/gi;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      return false;
    } else {
        return true;
    }
  } catch (error) {
    vscode.window.showErrorMessage(`${(error as Error).message}`);
    return false;
  }
}

export async function getDefaultConfigLogs(flow: 'hibist' | 'sailor' | 'verification') {
  const configsDir = await getFlowConfigsDirectory(flow);
  await ensureLocalConfigDirectory(configsDir);
  const filePath = resolveCfgPath(configsDir, "history");

  let history: DefaultConfigLog[] = [];
  if (await pathExists(filePath)) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const obj: DefaultConfigLog = new Function("return " + `${line.text}`)();
      if(obj.flow) history.push(obj);
    }
  }
  return history;
}
