import type {
  LoadingStore,
  ModePanelTab,
  NameListStore,
  NameStore,
} from '../types'

export const TAB_LABELS: Record<ModePanelTab, string> = {
  mode: 'Mode',
}

export const INITIAL_NAMES: NameStore = {
  mode: { key: '', name: '' },
}

export const INITIAL_NAME_LISTS: NameListStore = {
  mode: [],
}

export const INITIAL_LOADING: LoadingStore = {
  mode: false,
}
