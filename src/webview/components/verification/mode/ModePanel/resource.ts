import type { BaseConfigItem, ModeConfigItem, ResourceStore } from '../types'

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
export const normalizeBaseItems = (value: unknown): BaseConfigItem[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const items = value.flatMap((raw) => {
    if (typeof raw === 'string') {
      const name = raw.trim()

      return name
        ? [
            {
              name,
            },
          ]
        : []
    }

    if (!isRecord(raw)) {
      return []
    }

    const name =
      toNonEmptyString(raw.name) ??
      toNonEmptyString(raw.label) ??
      toNonEmptyString(raw.value)

    if (!name) {
      return []
    }

    return [
      {
        name,
      },
    ]
  })

  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.name
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 解析 Mode
 *
 * 必须保留 preMode
 *
 * 输入:
 *
 * {
 *   name:"xxx",
 *   preMode:"verification"
 * }
 *
 * 输出:
 *
 * ModeConfigItem
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

    const preMode = toNonEmptyString(raw.preMode)

    if (!name || !preMode) {
      return []
    }

    return [
      {
        name,
        preMode,
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

    group: normalizeBaseItems(data?.groups ?? data?.group),

    tc: normalizeBaseItems(data?.tcs ?? data?.tc),

    subattr: normalizeBaseItems(data?.subattrs ?? data?.subattr),
  }
}

/**
 * ResourceStore -> 配置保存结构
 */
export const createResourcePatch = (store: ResourceStore) => {
  const uniqueNames = (items: BaseConfigItem[]) => {
    const seen = new Set<string>()
    return items.flatMap((item) => {
      const name = item.name.trim()
      const key = name
      if (!name || seen.has(key)) return []
      seen.add(key)
      return [name]
    })
  }

  return {
    modes: store.mode.map((item) => ({
      name: item.name,

      preMode: item.preMode,
    })),

    focusModes: store.focusModes,

    groups: uniqueNames(store.group),

    tcs: uniqueNames(store.tc),

    subattrs: uniqueNames(store.subattr),
  }
}
