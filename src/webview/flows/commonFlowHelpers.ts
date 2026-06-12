import { RepoKey } from '../utils/ipc';

export type SyncDirection = 'dataToTarget' | 'targetToData';

export const repoLabels: Record<RepoKey, string> = {
  hibist: 'Hibist 仓库',
  sailor: 'Sailor 仓库',
  data: 'Data 公共仓',
  verification: '验证仓库',
};

export const repoShortLabels: Record<RepoKey, string> = {
  hibist: 'Hibist',
  sailor: 'Sailor',
  data: 'Data',
  verification: '验证仓',
};

export type CommonDiffItem = {
  id: string;
  fileType: 'designTree' | 'normTable';
  fileName?: string;
  sheetName?: string;
  key?: string;
  fieldName?: string;
  type: string;
  sourceVal?: unknown;
  targetVal?: unknown;
  decision?: 'source' | 'target' | 'custom';
  customVal?: string;
};

export const diffListHeight = 380;
export const diffRowHeight = 74;
export const diffListOverscan = 6;

export function normalizeDiffDisplayValue(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\uFEFF/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0009\u000B\u000C\u0020\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

export function isSameDisplayValue(sourceVal: unknown, targetVal: unknown): boolean {
  return normalizeDiffDisplayValue(sourceVal) === normalizeDiffDisplayValue(targetVal);
}

export function shouldKeepDiffItem(item: CommonDiffItem): boolean {
  if (item.type !== 'fieldDifferent') {
    return true;
  }

  return !isSameDisplayValue(item.sourceVal, item.targetVal);
}

export function hasSyncPath(value: string): boolean {
  return value.trim().length > 0;
}

export function getIncompleteSyncPathMessage(
  label: string,
  sourcePath: string,
  targetPath: string
): string | null {
  const hasSource = hasSyncPath(sourcePath);
  const hasTarget = hasSyncPath(targetPath);
  if (hasSource === hasTarget) {
    return null;
  }
  return `${label} 的源路径和目标路径需要同时填写；如果不想同步该项，请两边都留空。`;
}
