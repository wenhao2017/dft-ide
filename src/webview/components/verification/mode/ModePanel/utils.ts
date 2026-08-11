import type { ModeTreeNodeItem, ModeConfigItem } from '../types'

/**
 * 非空字符串
 */
export const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()

  return normalized || undefined
}

/**
 * 生成复制名称
 *
 * example:
 *
 * abc
 *
 * =>
 *
 * abc_copy
 *
 * 已存在:
 *
 * abc_copy_2
 */
export const createCopyName = (
  items: ModeConfigItem[],
  sourceName: string,
): string => {
  let index = 1

  let candidate = `${sourceName}_copy`

  while (
    items.some(
      (item) => item.name.trim().toLowerCase() === candidate.toLowerCase(),
    )
  ) {
    index += 1

    candidate = `${sourceName}_copy_${index}`
  }

  return candidate
}

export const createVersionName = (
  items: ModeConfigItem[],
  selectedItem: ModeTreeNodeItem,
): string => {
  let candidate = 'V1'

  const findItem = items.find(item => item.name === selectedItem.name)
  if (!findItem || !findItem.versions) {
    return candidate
  }

  let index = 1
  while (
    findItem.versions.some(
      (version) => version.trim().toLowerCase() === candidate.toLowerCase(),
    )
  ) {
    index += 1

    candidate = `V${index}`
  }

  return candidate
}

/**
 * 判断两个字符串名称是否相同
 */
export const sameName = (left: string, right: string): boolean => {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export const sameModeTreeNodeItem = (left: ModeTreeNodeItem, right: ModeTreeNodeItem): boolean => {
  return left.name?.trim().toLowerCase() === right.name?.trim().toLowerCase() &&
    left.version?.trim().toLowerCase() === right.version?.trim().toLowerCase()
}

export const hasModeTreeNodeItem = (items: ModeTreeNodeItem[], item: ModeTreeNodeItem): boolean => {
  return items.some((a) => sameModeTreeNodeItem(a, item))
}

export const toModeTreeNodeItemKey = (item: ModeTreeNodeItem): string => {
  if (item.version) {
    return `${item.name}@${item.version}`;
  }
  return item.name;
};

export const toModePanelItemKeys = (items: ModeTreeNodeItem[]): string[] => {
  return items.map(item => {
    return toModeTreeNodeItemKey(item);
  });
};

export const toModeTreeNodeItem = (config: ModeConfigItem, version?: string): ModeTreeNodeItem => {
  if (!config) {
    return { key: '', name: '' };
  }

  const key = version ? `${config.name}@${version}` : config.name;
  return {
    key,
    name: config.name,
    version
  };
};

export const duplicateModeTreeNodeItem = (item: ModeTreeNodeItem, version?: string): ModeTreeNodeItem => {
  if (!item) {
    return { key: '', name: '' };
  }

  const key = version ? `${item.name}@${version}` : item.name;
  return {
    key,
    name: item.name,
    version
  };
};
