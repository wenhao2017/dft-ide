import type { ModeConfigItem, ModePanelItem, ParsedCfgResult } from '../types'

/**
 * 判断当前资源是否为 Mode
 *
 * Mode:
 * {
 *   name,
 *   preMode
 * }
 *
 * Group/TC/SubAttr:
 * {
 *   name
 * }
 */
export const isModeItem = (item?: ModePanelItem): item is ModeConfigItem => {
  return Boolean(item && 'preMode' in item)
}

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
  items: ModePanelItem[],
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

/**
 * 判断两个字符串名称是否相同
 */
export const sameName = (left: string, right: string): boolean => {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

const MOCK_PRE_MODES = ['ip', 'atpg', 'fml', 'jtag', 'mbist-top'] as const

const pickMockPreMode = (): string => {
  const index = Math.floor(Math.random() * MOCK_PRE_MODES.length)

  return MOCK_PRE_MODES[index]
}

export async function parseImportedModeCfg(
  file: File | string,
): Promise<ParsedCfgResult> {
  // 占位实现：当前不解析 mode.cfg 内容。
  // 保留 file 参数，是为了后续替换成真实解析逻辑时不改调用方。
  void file

  const preMode = pickMockPreMode()

  return {
    extractedCandidate: preMode,
    preMode,
  }
}

export function parseModeCfgText(text: string): ParsedCfgResult {
  // 占位实现：当前不解析文本内容。
  // 保留 text 参数，是为了后续做单元测试或真实解析。
  void text

  const preMode = pickMockPreMode()

  return {
    extractedCandidate: preMode,
    preMode,
  }
}
