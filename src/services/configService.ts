import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { pathExists, readJsonFile, isRecord, getFileNameAndExtension } from './utils';
import {
  resolveConfigPath,
  resolveProjectRepoRoot,
  getFlowConfigsDirectory,
  ensureLocalConfigDirectory,
  getSyncedArtifactPath,
  resolveProjectRoot,
  type TransformLog, resolveLocalConfigDirectory,
} from './workspaceService';
import { obsTrackingService } from './obsTrackingService';
import { getVersionFromModuleName, modifyModuleCfgByVersion } from '../utils';

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
    if (type !== vscode.FileType.Directory) continue;
    const filePath = resolveCfgPath(flow, configsDir, name);
    if (!await pathExists(filePath)) continue;
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    configs.push({
      ...toFlowConfigFileInfo(filePath, stat),
      key: name,
      moduleName: name,
    });
  }

  configs.sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  return { configs, configsDir };
}

export async function createFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const target = resolveCfgPath(flow, configsDir, moduleName);
  if (await pathExists(target)) {
    throw new Error(`Config already exists: ${path.basename(target)}`);
  }
  const content = [
    `# Auto-generated default ${flow} config`,
    `module = ${moduleName}`,
    `flow = ${flow}`,
    ''
  ].join('\n');
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target)));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(target), Buffer.from(content, 'utf-8'));
  const targetStat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, targetStat);
}

export async function duplicateFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const source = resolveCfgPath(flow, configsDir, moduleName);
  const sourceDir = path.dirname(source);
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(source));
  if (stat.type !== vscode.FileType.File) {
    throw new Error(`Config is not a file: ${moduleName}`);
  }

  const targetModule = await makeUniqueCfgModuleName(flow, configsDir, `${path.basename(moduleName, '.cfg')}_copy`);
  const target = resolveCfgPath(flow, configsDir, targetModule);
  const targetDir = path.dirname(target);
  await vscode.workspace.fs.copy(vscode.Uri.file(sourceDir), vscode.Uri.file(targetDir), { overwrite: false });
  await vscode.workspace.fs.rename(
    vscode.Uri.file(path.join(targetDir, path.basename(source))),
    vscode.Uri.file(target),
    { overwrite: false }
  );
  const targetStat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, targetStat);
}

export async function renameFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string,
  nextModuleName: string
): Promise<FlowConfigFileInfo> {
  const configsDir = await getFlowConfigsDirectory(flow);
  const source = resolveCfgPath(flow, configsDir, moduleName);
  const target = resolveCfgPath(flow, configsDir, nextModuleName);
  const sourceDir = path.dirname(source);
  const targetDir = path.dirname(target);
  if (path.resolve(source).toLowerCase() === path.resolve(target).toLowerCase()) {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(source));
    return toFlowConfigFileInfo(source, stat);
  }
  if (await pathExists(target)) {
    throw new Error(`Config already exists: ${path.basename(target)}`);
  }
  await vscode.workspace.fs.rename(vscode.Uri.file(sourceDir), vscode.Uri.file(targetDir), { overwrite: false });
  try {
    await vscode.workspace.fs.rename(
      vscode.Uri.file(path.join(targetDir, path.basename(source))),
      vscode.Uri.file(target),
      { overwrite: false }
    );

    const [oriModuleKey, version] = getVersionFromModuleName(nextModuleName);
    if (version) {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(target));
      const content = Buffer.from(bytes).toString('utf-8');
      const lines = modifyModuleCfgByVersion(flow, content);
      await vscode.workspace.fs.writeFile(vscode.Uri.file(target), Buffer.from(lines.join('\n'), 'utf-8'));
    }
  } catch (error) {
    await vscode.workspace.fs.rename(vscode.Uri.file(targetDir), vscode.Uri.file(sourceDir), { overwrite: false });
    throw error;
  }
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(target));
  return toFlowConfigFileInfo(target, stat);
}

export async function deleteFlowConfigFile(
  flow: 'hibist' | 'sailor' | 'verification',
  moduleName: string
): Promise<void> {
  const configsDir = await getFlowConfigsDirectory(flow);
  await vscode.workspace.fs.delete(
    vscode.Uri.file(path.dirname(resolveCfgPath(flow, configsDir, moduleName))),
    { recursive: true }
  );
}

interface ObsScriptFile {
  fileName: string;
  fileType: number;
}

interface ObsScriptPathConfig {
  scriptSpace: string;
  remoteScriptPath: string;
  remoteScriptFiles: ObsScriptFile[];
}

export async function getObsScriptConfig(
  flow: 'hibist' | 'sailor' | 'verification',
  domain: string
): Promise<ObsScriptPathConfig> {
  const scriptSpace = 'DFT_IDE';
  const remoteScriptPath = `EXCEL2CFG/${domain}`;
  const remoteScriptFiles = [{ fileName: flow == 'verification' ? 'lander_env' : 'sailor_env', fileType: 2 }];
  return { scriptSpace, remoteScriptPath, remoteScriptFiles };
}

export async function downLoadObsScripts(
  context: vscode.ExtensionContext,
  flow: 'hibist' | 'sailor' | 'verification',
  domain: string,
  stage?: string,
): Promise<[configPath: string, scriptPath: string] | []> {
  const configsDir = await getFlowConfigsDirectory(flow, stage);
  await ensureLocalConfigDirectory(configsDir);

  const obsScriptConfig: ObsScriptPathConfig = await getObsScriptConfig(flow, domain);
  const entrance = {
    dir: 'scripts/transform',
    fileName: flow === 'verification' ? 'run_gen_lander_cfg' : 'run_gen_cfg',
  };

  try {
    const extensionRoot = path.resolve(context.extensionPath);
    const sourceScript = path.resolve(extensionRoot, entrance.dir, entrance.fileName);
    const sourceRelativePath = path.relative(extensionRoot, sourceScript);
    if (sourceRelativePath.startsWith('..') || path.isAbsolute(sourceRelativePath)) {
      throw new Error(`Transform entrance must stay inside the extension: ${sourceScript}`);
    }
    const targetPath = path.join(configsDir, entrance.fileName);
    await copyFileLF(sourceScript, targetPath);
    try {
      await fs.promises.chmod(targetPath, 0o755);
    } catch (error) {
      console.warn(`[DFT IDE] Transform entrance copied but chmod failed: ${targetPath}`, error);
    }

    for (const file of obsScriptConfig.remoteScriptFiles) {
      const filename: string = file.fileName;
      const fileType = file.fileType;

      const localScriptPath = flow === 'verification' ? path.join(configsDir, filename) : configsDir;
      if (typeof filename !== 'string' || path.basename(filename) !== filename) {
        throw new Error(`Invalid OBS script file name: ${String(filename)}`);
      }
      const remoteFilePath = path.posix.join(obsScriptConfig.remoteScriptPath.replace(/\\/g, '/'), filename);
      if (fileType == 1) {
        await obsTrackingService.downloadFile(obsScriptConfig.scriptSpace, remoteFilePath, vscode.Uri.file(localScriptPath), {
          overwriteUntracked: true,
        });
      } else {
        await obsTrackingService.downloadDirectory(obsScriptConfig.scriptSpace, remoteFilePath, vscode.Uri.file(localScriptPath), {
          overwriteUntracked: true,
        });
      }
      try {
        await fs.promises.chmod(localScriptPath, 0o755);
      } catch (error) {
        console.warn(`[DFT IDE] OBS script downloaded but chmod failed: ${configsDir}`, error);
      }
    }
    return [configsDir, targetPath];
  } catch (err) {
    console.warn(`[DFT IDE] 从 OBS 空间 [${obsScriptConfig.scriptSpace}] 下载转换脚本失败:`, err);
    return [];
  }
}

export async function removeExecutedScripts(dirUri: vscode.Uri): Promise<void> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(dirUri);
    for (const [name, type] of entries) {
      const childUri = vscode.Uri.joinPath(dirUri, name);
      if (type === vscode.FileType.File) {
        if (name.endsWith('.obs.json')) {
          const scriptName = name.replace(/^\.(.+)\.obs\.json$/, '$1');
          await vscode.workspace.fs.delete(vscode.Uri.joinPath(dirUri, scriptName), { recursive: false });
        }
      } else if (type === vscode.FileType.Directory) {
        await removeExecutedScripts(childUri);
      }
    }
  } catch (error) {
    console.error(`读取目录失败: ${dirUri.fsPath}`, error);
  }
}

export async function copyFileLF(sourceScript: string, targetPath: string) {
  await fs.promises.copyFile(sourceScript, targetPath);
  let content = await fs.promises.readFile(targetPath, 'utf8');
  content = content.replace(/\r/g, '');
  await fs.promises.writeFile(targetPath, content, 'utf8');
}

export function resolveCfgPath(flow: 'hibist' | 'sailor' | 'verification', configsDir: string, moduleName: string): string {
  const clean = sanitizeCfgModuleName(moduleName);
  return path.join(configsDir, clean, `${clean}${flow === 'sailor' ? '.sailor' : ''}.cfg`);
}

export function sanitizeCfgModuleName(value: string): string {
  const clean = path.basename(value.trim().replace(/\.cfg$/i, '')).replace(/[^a-zA-Z0-9_.@-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!clean) {
    throw new Error('Module name is required.');
  }
  return clean;
}

export async function makeUniqueCfgModuleName(flow: 'hibist' | 'sailor' | 'verification', configsDir: string, base: string): Promise<string> {
  const cleanBase = sanitizeCfgModuleName(base);
  let candidate = cleanBase;
  let index = 1;
  while (await pathExists(resolveCfgPath(flow, configsDir, candidate))) {
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

  const [oriModuleKey, version] = getVersionFromModuleName(moduleName);
  // const workDir = version ? path.join(workPath, version, oriModuleKey) : path.join(workPath, moduleName);
  const workDir = path.join(workPath, version ? oriModuleKey : moduleName);

  return {
    key: moduleName,
    moduleName,
    fileName,
    filePath,
    workDir,
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

export async function saveTransformLogs(transformLog: TransformLog): Promise<TransformLog> {
  const localStateDir = resolveLocalConfigDirectory() as string;
  const targetPath = path.join(localStateDir, 'transform_history', transformLog.flow);
  const savedLog: TransformLog = {
    ...transformLog,
    scriptPath: await moveTransformFile(transformLog, transformLog.scriptPath, targetPath, 2),
    designTree: transformLog.designTree
      ? await moveTransformFile(transformLog, transformLog.designTree, targetPath, 1)
      : undefined,
    normTable: transformLog.normTable
      ? await moveTransformFile(transformLog, transformLog.normTable, targetPath, 1)
      : undefined,
    landerAssistant: transformLog.landerAssistant
      ? await moveTransformFile(transformLog, transformLog.landerAssistant, targetPath, 1)
      : undefined,
    logFile: transformLog.logFile
      ? await moveTransformFile(transformLog, transformLog.logFile, targetPath, 2)
      : undefined
  };

  const maxHistoryCounts = Math.max(
    1,
    vscode.workspace.getConfiguration('dftIde').get<number>('maxHistoryCounts', 10)
  );
  const hisotryJson = path.join(targetPath, "history.json");

  const existing = await readTransformLogFile(hisotryJson);
  const retained = [savedLog, ...existing].slice(0, maxHistoryCounts);
  for (const removed of existing.slice(Math.max(0, maxHistoryCounts - 1))) {
    await removeLogFiles(removed);
  }
  const content = retained.map((item) => JSON.stringify(item)).join('\n');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(hisotryJson), Buffer.from(content, 'utf-8'));
  if (transformLog.flow !== 'verification') await removeExecutedScripts(vscode.Uri.file(transformLog.configPath));
  return savedLog;
}

export async function moveTransformFile(transformLog: TransformLog, sourceFile: string, targetPath: string, type: number): Promise<string> {
  try {
    const { name, extension } = getFileNameAndExtension(sourceFile);
    const fullName = path.join(targetPath, `${name}_${transformLog.timemilles}${extension ? `.${extension}` : ''}`);
    if (type == 1) {
      // copy
      await vscode.workspace.fs.copy(vscode.Uri.file(sourceFile), vscode.Uri.file(fullName));
    } else {
      // move
      await vscode.workspace.fs.rename(vscode.Uri.file(sourceFile), vscode.Uri.file(fullName));
    }
    return fullName;
  } catch (error) {
    vscode.window.showErrorMessage(`${(error as Error).message}`);
    return '';
  }
}

async function removeLogFiles(log: TransformLog): Promise<void> {
  const paths = [log.scriptPath, log.designTree, log.normTable, log.landerAssistant, log.logFile]
    .filter((value): value is string => typeof value === 'string' && Boolean(value));
  for (const filePath of paths) {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(filePath), { recursive: false });
    } catch {
      // History cleanup is best-effort.
    }
  }
}

export async function checkTransformStatus(logFile: string): Promise<boolean> {
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(logFile));
    const text = document.getText();
    const pattern = /\berror\b|\bexception\b/gi;
    const matches = text.match(pattern);
    return matches && matches.length > 0 ? false : true;
  } catch (error) {
    vscode.window.showErrorMessage(`${(error as Error).message}`);
    return false;
  }
}

export async function fetchTransformLogs(
  flow: 'hibist' | 'sailor' | 'verification',
): Promise<TransformLog[]> {
  const localStateDir = resolveLocalConfigDirectory() as string;
  const historyFile = path.join(localStateDir, 'transform_history', flow, "history.json");
  return readTransformLogFile(historyFile);
}

async function readTransformLogFile(filePath: string): Promise<TransformLog[]> {
  if (!await pathExists(filePath)) {
    return [];
  }
  const fileUri = vscode.Uri.file(filePath);
  const buffer = await vscode.workspace.fs.readFile(fileUri);
  const content = new TextDecoder().decode(buffer);
  const lines = content.split(/\r\n|\n|\r/g).filter(line => line.length > 0);
  const logs: TransformLog[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    try {
      const parsed: unknown = JSON.parse(text);
      if (isRecord(parsed) && typeof parsed.flow === 'string' && typeof parsed.scriptPath === 'string') {
        logs.push({ ...parsed, success: parsed.logFile ? await checkTransformStatus(parsed.logFile as string) : false } as unknown as TransformLog);
      }
    } catch {
      const legacy = parseLegacyTransformLog(text);
      if (legacy) {
        logs.push({ ...legacy, success: legacy.logFile ? await checkTransformStatus(legacy.logFile as string) : false } as unknown as TransformLog);
      }
    }
  }
  return logs;
}

function parseLegacyTransformLog(text: string): TransformLog | undefined {
  const values: Record<string, string | boolean> = {};
  const fieldPattern = /(flow|scriptPath|configPath|designTree|normTable|module|stage|timemilles|timestamp|time|logFile|success)\s*:\s*(?:"([^"]*)"|(true|false))/g;
  for (const match of text.matchAll(fieldPattern)) {
    values[match[1]] = match[2] ?? match[3] === 'true';
  }
  if (
    (values.flow !== 'hibist' && values.flow !== 'sailor' && values.flow !== 'verification')
    || typeof values.scriptPath !== 'string'
  ) {
    return undefined;
  }
  return values as unknown as TransformLog;
}
