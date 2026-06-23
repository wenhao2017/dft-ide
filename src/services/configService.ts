import * as vscode from 'vscode';
import * as path from 'path';
import { pathExists, readJsonFile, isRecord } from './utils';
import {
  resolveConfigPath,
  resolveProjectRepoRoot,
  getFlowConfigsDirectory,
  ensureLocalConfigDirectory,
  normalizeConfigFlow,
  getSyncedArtifactPath,
  resolveProjectRoot,
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
    if (type !== vscode.FileType.File || path.extname(name).toLowerCase() !== '.cfg') {
      continue;
    }
    const filePath = path.join(configsDir, name);
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    configs.push(toFlowConfigFileInfo(filePath, stat));
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

export async function generateDefaultFlowConfigs(flow: 'hibist' | 'sailor' | 'verification'): Promise<{
  configs: FlowConfigFileInfo[];
  configsDir: string;
  created: number;
}> {
  const configsDir = await getFlowConfigsDirectory(flow);
  await ensureLocalConfigDirectory(configsDir);
  const modules = await readModulesFromNormalizedTable(flow);
  let created = 0;

  for (const moduleName of modules) {
    const filePath = resolveCfgPath(configsDir, moduleName);
    if (await pathExists(filePath)) {
      continue;
    }
    const content = [
      `# Auto-generated default ${flow} config`,
      `module = ${moduleName}`,
      `flow = ${flow}`,
      ''
    ].join('\n');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf-8'));
    created += 1;
  }

  const listed = await listFlowConfigFiles(flow);
  return { ...listed, created };
}

export function resolveCfgPath(configsDir: string, moduleName: string): string {
  const clean = sanitizeCfgModuleName(moduleName);
  return path.join(configsDir, `${clean}.cfg`);
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
  const moduleName = path.basename(fileName, '.cfg');
  const repoRoot = path.dirname(path.dirname(filePath));
  return {
    key: moduleName,
    moduleName,
    fileName,
    filePath,
    workDir: path.join(repoRoot, moduleName),
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
