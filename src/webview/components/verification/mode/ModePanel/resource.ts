import type { ModeConfigItem, ResourceStore } from '../types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()

  return normalized || undefined
}

/**
 * 解析 Group / TC / SubAttr
 *
 * 当前模型：
 *
 * {
 *   name: string
 * }
 */
/**
 * 解析 Mode
 *
 * 输入资源会被归一化为 ModeConfigItem。
 */
export const normalizeModeItems = (value: unknown): ModeConfigItem[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const items = value.flatMap((raw) => {
    if (!isRecord(raw)) {
      return []
    }

    const name = toNonEmptyString(raw.name)

    if (!name) {
      return []
    }

    return [
      {
        name,
        filePath: toNonEmptyString(raw.filePath),
      },
    ]
  })

  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 读取 focus mode
 *
 * 保存的是 mode.name
 */
export const normalizeFocusModes = (
  value: unknown,
  modes: ModeConfigItem[],
): string[] => {
  if (!Array.isArray(value)) {
    return modes.map((item) => item.name)
  }

  const validNames = new Set(modes.map((item) => item.name))

  return Array.from(
    new Set(
      value.filter((item) => typeof item === 'string' && validNames.has(item)),
    ),
  )
}

/**
 * 配置文件 -> ResourceStore
 */
export const readResources = (
  data: Record<string, unknown> | null | undefined,
): ResourceStore => {
  const modes = normalizeModeItems(data?.modes ?? data?.mode)

  return {
    mode: modes,

    focusModes: normalizeFocusModes(data?.focusModes, modes),
  }
}

/**
 * ResourceStore -> 配置保存结构
 */
export const createResourcePatch = (store: ResourceStore) => {
  return {
    modes: store.mode.map((item) => ({
      name: item.name,
      ...(item.filePath ? { filePath: item.filePath } : {}),
    })),

    focusModes: store.focusModes,
  }
}
