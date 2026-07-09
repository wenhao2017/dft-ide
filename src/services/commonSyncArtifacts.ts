import * as fs from 'fs';
import * as path from 'path';

export interface CommonSyncArtifactInput {
  label: string;
  sourcePath: string;
  targetPath: string;
}

export interface CommonSyncArtifact {
  key: 'designTree' | 'normTable';
  label: string;
  source: string;
  target: string;
  exists: boolean;
}

export function buildCommonSyncArtifacts(repoRoot: string, inputs: CommonSyncArtifactInput[], projectRoot?: string): CommonSyncArtifact[] {
  const artifacts: CommonSyncArtifact[] = [];
  inputs.forEach((input, index) => {
    const source = input.sourcePath.trim();
    if (!source) {
      return;
    }
    const resolvedSource = resolveCommonSyncSource(source, projectRoot);
    const target = resolveCommonSyncTarget(repoRoot, input.targetPath, resolvedSource);
    artifacts.push({
      key: index === 0 ? 'designTree' : 'normTable',
      label: input.label,
      source: resolvedSource,
      target,
      exists: fs.existsSync(target),
    });
  });
  return artifacts;
}

export function isSpreadsheetFile(filePath: string): boolean {
  return /\.xlsx?$/i.test(path.extname(filePath));
}

function resolveCommonSyncSource(sourcePath: string, projectRoot?: string): string {
  const resolved = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(projectRoot ?? '.', sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Source file does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Source must be an XLS/XLSX file: ${resolved}`);
  }
  if (!isSpreadsheetFile(resolved)) {
    throw new Error(`Source must be an .xls or .xlsx file: ${resolved}`);
  }
  return resolved;
}

function resolveCommonSyncTarget(repoRoot: string, targetPath: string, sourcePath: string): string {
  const sourceName = path.basename(sourcePath);
  const trimmed = targetPath.trim();
  if (!trimmed) {
    return path.join(repoRoot, sourceName);
  }
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(repoRoot, trimmed);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return path.join(resolved, sourceName);
  }
  if (!path.extname(resolved)) {
    return path.join(resolved, sourceName);
  }
  if (!isSpreadsheetFile(resolved)) {
    throw new Error(`Target file must be an .xls or .xlsx file, or a directory: ${resolved}`);
  }
  return resolved;
}
