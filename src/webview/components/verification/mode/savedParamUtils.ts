import type { RunParamRow } from './types'

export type SavedParams = Record<string, RunParamRow>

export const readSavedParams = (value: unknown): SavedParams => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(Object.entries(value).flatMap(([alias, savedValue]) => {
    const row = Array.isArray(savedValue) ? savedValue[0] : savedValue
    return row && typeof row === 'object' && !Array.isArray(row)
      ? [[alias, row as RunParamRow]]
      : []
  }))
}
