import type {
  LoadingStore,
  ModePanelTab,
  NameListStore,
  NameStore,
  SearchStore,
} from '../types'

export const TAB_LABELS: Record<ModePanelTab, string> = {
  mode: 'Mode',
  group: 'Group',
  tc: 'TC',
  subattr: 'SubAttr',
}

export const INITIAL_NAMES: NameStore = {
  mode: '',
  group: '',
  tc: '',
  subattr: '',
}

export const INITIAL_NAME_LISTS: NameListStore = {
  mode: [],
  group: [],
  tc: [],
  subattr: [],
}

export const INITIAL_SEARCH: SearchStore = {
  mode: '',
  group: '',
  tc: '',
  subattr: '',
}

export const INITIAL_LOADING: LoadingStore = {
  mode: false,
  group: false,
  tc: false,
  subattr: false,
}
