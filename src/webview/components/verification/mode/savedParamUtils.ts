import type { ResourceStore, RunParamRow, SelectorField } from './types'

export type SavedParams = Record<string, RunParamRow>

const RESOURCE_FIELD: Record<Exclude<keyof ResourceStore, 'mode' | 'focusModes'>, SelectorField> = {
  group: 'groupNames',
  tc: 'tcNames',
  subattr: 'subattrNames',
}

export const readSavedParams = (value: unknown): SavedParams => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(Object.entries(value).flatMap(([alias, savedValue]) => {
    const row = Array.isArray(savedValue) ? savedValue[0] : savedValue
    return row && typeof row === 'object' && !Array.isArray(row)
      ? [[alias, row as RunParamRow]]
      : []
  }))
}

export function updateSavedParamReferences(
  params: SavedParams,
  resource: keyof typeof RESOURCE_FIELD,
  names: string[],
  replacement?: string,
): { params: SavedParams; affectedAliases: string[] } {
  const field = RESOURCE_FIELD[resource]
  const targets = new Set(names)
  const affectedAliases: string[] = []

  const next = Object.fromEntries(Object.entries(params).map(([alias, row]) => {
    const current = Array.isArray(row[field]) ? row[field] : []
    if (!current.some((name) => targets.has(name))) return [alias, row]

    affectedAliases.push(alias)
    const values = current.flatMap((name) => (
      targets.has(name) ? (replacement ? [replacement] : []) : [name]
    ))
    return [alias, { ...row, [field]: Array.from(new Set(values)) }]
  }))

  return { params: next, affectedAliases }
}
