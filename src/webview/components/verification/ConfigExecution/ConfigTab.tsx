"use client"

import { useEffect, useMemo, useState } from "react"
import type { CSSProperties, Key } from "react"
import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tree,
  Upload,
  message,
} from "antd"
import type { TableProps, TreeProps, UploadProps } from "antd"
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PaperClipOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons"

export type ResourceName = {
  name: string
}

export type Group = {
  name: string
  tc?: string[]
  subattr?: string[]
  /**
   * Per-TC SubAttr binding.
   *
   * Old data only had group.subattr, which caused every selected TC in the
   * same group to share the same SubAttr list. This map makes the relation
   * explicit: group -> tc -> subattr[].
   */
  tcSubattr?: Record<string, string[]>
}

export type ConfigData = {
  tc: ResourceName[]
  subattr: ResourceName[]
  groups: Group[]
}

type PageKind = "group" | "tc" | "subattr"

type TableRow = {
  key: string
  name: string
  tcCount?: number
  subattrCount?: number
}

type RenameState =
  | {
      kind: PageKind
      oldName: string
    }
  | undefined

export function createMockConfigData(params?: {
  groupCount?: number
  tcCount?: number
  subattrCount?: number
}): ConfigData {
  const groupCount = params?.groupCount ?? 20
  const tcCount = params?.tcCount ?? 30
  const subattrCount = params?.subattrCount ?? 30

  const tc = Array.from({ length: tcCount }, (_, index) => ({
    name: `TC_${String(index + 1).padStart(3, "0")}`,
  }))
  const subattr = Array.from({ length: subattrCount }, (_, index) => ({
    name: `SubAttr_${String(index + 1).padStart(3, "0")}`,
  }))

  const groups = Array.from({ length: groupCount }, (_, index) => ({
    name: `Group_${String(index + 1).padStart(2, "0")}`,
    tc: [],
    subattr: [],
    tcSubattr: {},
  }))

  return { tc, subattr, groups }
}

export const MOCK_CONFIG_DATA = createMockConfigData({
  groupCount: 20,
  tcCount: 30,
  subattrCount: 30,
})

const CONFIG_TAB_THEME_CSS = `
.dftx-config-page,
.dftx-config-modal-root {
  --dftx-bg: #0b1326;
  --dftx-panel: #131b2e;
  --dftx-panel-header: #171f33;
  --dftx-panel-strong: #222a3d;
  --dftx-control: #2d3449;
  --dftx-control-hover: #31394d;
  --dftx-text: #dae2fd;
  --dftx-text-muted: #c2c6d6;
  --dftx-text-subtle: #8c909f;
  --dftx-border: #424754;
  --dftx-border-soft: rgba(66, 71, 84, 0.7);
  --dftx-primary: #adc6ff;
  --dftx-primary-bg: rgba(173, 198, 255, 0.12);
  --dftx-primary-text: #002e6a;
  --dftx-danger: #ffb4ab;
  --dftx-danger-bg: rgba(255, 180, 171, 0.12);
  --dftx-success: #22c55e;

  background: var(--dftx-bg);
  color: var(--dftx-text);
}

.vscode-dark .dftx-config-page,
.vscode-dark .dftx-config-modal-root {
  --dftx-bg: var(--vscode-editor-background, #0b1326);
  --dftx-panel: var(--vscode-sideBar-background, #131b2e);
  --dftx-panel-header: var(--vscode-editorGroupHeader-tabsBackground, #171f33);
  --dftx-panel-strong: var(--vscode-list-hoverBackground, #222a3d);
  --dftx-control: var(--vscode-input-background, #2d3449);
  --dftx-control-hover: var(--vscode-list-hoverBackground, #31394d);
  --dftx-text: var(--vscode-foreground, #dae2fd);
  --dftx-text-muted: var(--vscode-descriptionForeground, #c2c6d6);
  --dftx-text-subtle: var(--vscode-disabledForeground, #8c909f);
  --dftx-border: var(--vscode-panel-border, #424754);
  --dftx-border-soft: var(--vscode-panel-border, rgba(66, 71, 84, 0.7));
  --dftx-primary: var(--vscode-textLink-foreground, #adc6ff);
  --dftx-primary-bg: color-mix(in srgb, var(--dftx-primary) 16%, transparent);
  --dftx-primary-text: var(--vscode-button-foreground, #002e6a);
  --dftx-danger: var(--vscode-errorForeground, #ffb4ab);
  --dftx-danger-bg: color-mix(in srgb, var(--dftx-danger) 14%, transparent);
  --dftx-success: #22c55e;
}

.vscode-light .dftx-config-page,
.vscode-light .dftx-config-modal-root {
  --dftx-bg: var(--vscode-editor-background, #ffffff);
  --dftx-panel: var(--vscode-sideBar-background, #f3f4f6);
  --dftx-panel-header: var(--vscode-editorGroupHeader-tabsBackground, #eef1f6);
  --dftx-panel-strong: var(--vscode-list-hoverBackground, #e6edf7);
  --dftx-control: var(--vscode-input-background, #ffffff);
  --dftx-control-hover: var(--vscode-list-hoverBackground, #edf2fa);
  --dftx-text: var(--vscode-foreground, #1f2937);
  --dftx-text-muted: var(--vscode-descriptionForeground, #4b5563);
  --dftx-text-subtle: var(--vscode-disabledForeground, #6b7280);
  --dftx-border: var(--vscode-panel-border, #c8d0dc);
  --dftx-border-soft: var(--vscode-panel-border, rgba(120, 130, 150, 0.45));
  --dftx-primary: var(--vscode-textLink-foreground, #005ac2);
  --dftx-primary-bg: color-mix(in srgb, var(--dftx-primary) 12%, transparent);
  --dftx-primary-text: var(--vscode-button-foreground, #ffffff);
  --dftx-danger: var(--vscode-errorForeground, #b42318);
  --dftx-danger-bg: color-mix(in srgb, var(--dftx-danger) 10%, transparent);
  --dftx-success: #168a45;
}

.vscode-high-contrast .dftx-config-page,
.vscode-high-contrast .dftx-config-modal-root {
  --dftx-bg: var(--vscode-editor-background, #000000);
  --dftx-panel: var(--vscode-sideBar-background, #000000);
  --dftx-panel-header: var(--vscode-editorGroupHeader-tabsBackground, #000000);
  --dftx-panel-strong: var(--vscode-list-hoverBackground, #111111);
  --dftx-control: var(--vscode-input-background, #000000);
  --dftx-control-hover: var(--vscode-list-hoverBackground, #111111);
  --dftx-text: var(--vscode-foreground, #ffffff);
  --dftx-text-muted: var(--vscode-descriptionForeground, #ffffff);
  --dftx-text-subtle: var(--vscode-disabledForeground, #cccccc);
  --dftx-border: var(--vscode-contrastBorder, #ffffff);
  --dftx-border-soft: var(--vscode-contrastBorder, #ffffff);
  --dftx-primary: var(--vscode-textLink-foreground, #00ffff);
  --dftx-primary-bg: transparent;
  --dftx-primary-text: var(--vscode-button-foreground, #000000);
  --dftx-danger: var(--vscode-errorForeground, #ff6666);
  --dftx-danger-bg: transparent;
  --dftx-success: #00ff00;
}

.dftx-config-page .ant-input,
.dftx-config-page .ant-input-affix-wrapper,
.dftx-config-page .ant-select-selector,
.dftx-config-modal-root .ant-input,
.dftx-config-modal-root .ant-input-affix-wrapper,
.dftx-config-modal-root .ant-select-selector {
  background: var(--dftx-control) !important;
  border-color: var(--dftx-border) !important;
  color: var(--dftx-text) !important;
  border-radius: 2px !important;
}

.dftx-config-page .ant-input::placeholder,
.dftx-config-page .ant-input-affix-wrapper input::placeholder,
.dftx-config-page .ant-select-selection-placeholder,
.dftx-config-modal-root .ant-input::placeholder,
.dftx-config-modal-root .ant-input-affix-wrapper input::placeholder,
.dftx-config-modal-root .ant-select-selection-placeholder {
  color: var(--dftx-text-subtle) !important;
}

.dftx-config-page .ant-input-affix-wrapper input,
.dftx-config-modal-root .ant-input-affix-wrapper input {
  background: transparent !important;
  color: var(--dftx-text) !important;
}

.dftx-config-page .ant-select-selection-item,
.dftx-config-page .ant-select-selection-overflow-item,
.dftx-config-modal-root .ant-select-selection-item,
.dftx-config-modal-root .ant-select-selection-overflow-item {
  color: var(--dftx-text) !important;
}

.dftx-config-page .ant-select-arrow,
.dftx-config-page .ant-select-clear,
.dftx-config-modal-root .ant-select-arrow,
.dftx-config-modal-root .ant-select-clear {
  color: var(--dftx-text-muted) !important;
}

.dftx-config-page .ant-btn-default,
.dftx-config-modal-root .ant-btn-default {
  background: var(--dftx-control);
  border-color: var(--dftx-border);
  color: var(--dftx-text);
  border-radius: 2px;
}

.dftx-config-page .ant-btn-default:hover,
.dftx-config-modal-root .ant-btn-default:hover {
  border-color: var(--dftx-primary) !important;
  color: var(--dftx-primary) !important;
}

.dftx-config-page .ant-btn-primary,
.dftx-config-modal-root .ant-btn-primary {
  background: var(--dftx-primary);
  border-color: var(--dftx-primary);
  color: var(--dftx-primary-text);
  border-radius: 2px;
}

.dftx-config-page .ant-btn-text,
.dftx-config-modal-root .ant-btn-text {
  color: var(--dftx-text-muted);
}

.dftx-config-page .ant-btn-text:hover,
.dftx-config-modal-root .ant-btn-text:hover {
  background: var(--dftx-panel-strong) !important;
  color: var(--dftx-primary) !important;
}

.dftx-config-page .ant-btn-dangerous,
.dftx-config-modal-root .ant-btn-dangerous {
  color: var(--dftx-danger);
  border-color: var(--dftx-danger);
}

.dftx-config-page .ant-segmented {
  background: var(--dftx-control);
  border-radius: 2px;
}

.dftx-config-page .ant-segmented-item {
  color: var(--dftx-text-muted);
  border-radius: 2px;
}

.dftx-config-page .ant-segmented-item-selected {
  background: var(--dftx-primary-bg);
  color: var(--dftx-primary);
  box-shadow: inset 0 0 0 1px var(--dftx-primary);
}

.dftx-config-page .ant-tree {
  background: transparent;
  color: var(--dftx-text);
}

.dftx-config-page .ant-tree-node-content-wrapper {
  color: var(--dftx-text);
}

.dftx-config-page .ant-tree-node-content-wrapper:hover {
  background: var(--dftx-panel-strong) !important;
}

.dftx-config-page .ant-tree-node-selected {
  background: var(--dftx-primary-bg) !important;
  color: var(--dftx-primary) !important;
}

.dftx-config-page .ant-checkbox-inner {
  background: var(--dftx-control);
  border-color: var(--dftx-border);
}

.dftx-config-page .ant-checkbox-checked .ant-checkbox-inner {
  background: var(--dftx-primary);
  border-color: var(--dftx-primary);
}

.dftx-config-page .ant-table {
  background: transparent;
  color: var(--dftx-text);
}

.dftx-config-page .ant-table-container {
  border: 1px solid var(--dftx-border-soft);
}

.dftx-config-page .ant-table-thead > tr > th {
  background: var(--dftx-panel-header) !important;
  border-bottom: 1px solid var(--dftx-border) !important;
  color: var(--dftx-text) !important;
}

.dftx-config-page .ant-table-tbody > tr > td {
  background: var(--dftx-bg) !important;
  border-bottom: 1px solid var(--dftx-border-soft) !important;
  color: var(--dftx-text) !important;
}

.dftx-config-page .ant-table-tbody > tr:hover > td {
  background: var(--dftx-panel-header) !important;
}

.dftx-config-page .ant-pagination {
  margin: 12px 0 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.dftx-config-page .ant-pagination-item,
.dftx-config-page .ant-pagination-prev,
.dftx-config-page .ant-pagination-next {
  margin-inline-end: 0 !important;
}

.dftx-config-page .ant-pagination-item,
.dftx-config-page .ant-pagination-prev button,
.dftx-config-page .ant-pagination-next button {
  min-width: 26px !important;
  height: 26px !important;
  line-height: 24px !important;
  background: var(--dftx-control) !important;
  border-color: var(--dftx-border) !important;
  border-radius: 3px !important;
}

.dftx-config-page .ant-pagination-item a,
.dftx-config-page .ant-pagination-prev button,
.dftx-config-page .ant-pagination-next button {
  color: var(--dftx-text-muted) !important;
  font-size: 12px !important;
}

.dftx-config-page .ant-pagination-item-active {
  background: var(--dftx-primary-bg) !important;
  border-color: var(--dftx-primary) !important;
}

.dftx-config-page .ant-pagination-item-active a {
  color: var(--dftx-primary) !important;
  font-weight: 700 !important;
}

.dftx-config-page .ant-pagination-disabled button {
  color: var(--dftx-text-subtle) !important;
  opacity: 0.55;
}

.dftx-config-page .ant-empty-description {
  color: var(--dftx-text-subtle);
}

.dftx-config-page .ant-card {
  background: var(--dftx-bg);
  border-color: var(--dftx-border);
  color: var(--dftx-text);
}

.dftx-config-page .ant-card-body {
  color: var(--dftx-text);
}

.dftx-config-modal-root .ant-modal-content,
.dftx-config-modal-root .ant-modal-header {
  background: var(--dftx-panel) !important;
  color: var(--dftx-text) !important;
}

.dftx-config-modal-root .ant-modal-title,
.dftx-config-modal-root .ant-modal-close {
  color: var(--dftx-text) !important;
}
`

const sx: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    minHeight: 720,
    background: "var(--dftx-bg)",
    color: "var(--dftx-text)",
    border: "1px solid var(--dftx-border)",
  },
  left: {
    width: 320,
    flexShrink: 0,
    borderRight: "1px solid var(--dftx-border)",
    background: "var(--dftx-panel)",
    display: "flex",
    flexDirection: "column",
  },
  leftHeader: {
    padding: 12,
    borderBottom: "1px solid var(--dftx-border)",
    background: "var(--dftx-panel-header)",
  },
  title: {
    marginBottom: 10,
    color: "var(--dftx-text)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  leftBody: {
    flex: 1,
    minHeight: 0,
    padding: 12,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  sectionTitle: {
    marginBottom: 8,
    color: "var(--dftx-text-muted)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  relationTreeBox: {
    flex: 1,
    minHeight: 300,
    maxHeight: "calc(100vh - 132px)",
    overflow: "auto",
    padding: 8,
    background: "var(--dftx-bg)",
    border: "1px solid var(--dftx-border)",
    borderRadius: 2,
  },
  right: {
    flex: 1,
    minWidth: 0,
    background: "var(--dftx-bg)",
    padding: 24,
    overflow: "auto",
  },
  block: {
    marginBottom: 18,
    paddingBottom: 18,
    borderBottom: "1px solid var(--dftx-border-soft)",
  },
  fieldLabel: {
    marginBottom: 8,
    color: "var(--dftx-text-muted)",
    fontSize: 12,
    fontWeight: 600,
  },
  formRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  formLabel: {
    width: 128,
    flex: "0 0 128px",
    color: "var(--dftx-text-muted)",
    fontSize: 12,
    fontWeight: 600,
  },
  formControl: {
    flex: 1,
    minWidth: 0,
  },
  listHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  listTitle: {
    margin: 0,
    color: "var(--dftx-text)",
    fontSize: 18,
    fontWeight: 700,
  },
  treeCard: {
    background: "var(--dftx-bg)",
    border: "1px solid var(--dftx-border)",
    borderRadius: 2,
  },
  treeTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "var(--dftx-text)",
  },
  treeLeaf: {
    color: "var(--dftx-text-muted)",
    fontFamily: "monospace",
    fontSize: 11,
  },
  activeTag: {
    border: 0,
    background: "var(--dftx-primary-bg)",
    color: "var(--dftx-primary)",
  },
  countTag: {
    border: "1px solid var(--dftx-border)",
    background: "var(--dftx-panel-strong)",
    color: "var(--dftx-text-muted)",
  },
}

function unique(values: string[]) {
  return Array.from(
    new Set(values.map((item) => item.trim()).filter(Boolean))
  )
}

function makeCopyName(baseName: string, existingNames: string[]) {
  let index = 1
  let nextName = `${baseName}_copy`

  while (existingNames.includes(nextName)) {
    index += 1
    nextName = `${baseName}_copy_${index}`
  }

  return nextName
}

function normalizeNameList(value: unknown): { name: string }[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim()
        return name ? { name } : undefined
      }

      if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as { name?: unknown }).name === "string"
      ) {
        const name = (item as { name: string }).name.trim()
        return name ? { name } : undefined
      }

      return undefined
    })
    .filter((item): item is { name: string } => Boolean(item))
}


function normalizeTcSubattrMap(value: unknown): Record<string, string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  const raw = value as Record<string, unknown>
  const next: Record<string, string[]> = {}

  Object.entries(raw).forEach(([tcName, subattrValue]) => {
    const cleanTcName = tcName.trim()
    if (!cleanTcName) return

    if (Array.isArray(subattrValue)) {
      next[cleanTcName] = unique(subattrValue.map(String))
      return
    }

    if (typeof subattrValue === "string") {
      next[cleanTcName] = unique([subattrValue])
    }
  })

  return next
}

function getSubattrUnionFromMap(tcSubattr: Record<string, string[]>) {
  return unique(Object.values(tcSubattr).flat())
}

function normalizeGroupBindingState(group: Group): Group {
  const tc = unique(group.tc ?? [])
  const legacySubattr = unique(group.subattr ?? [])
  const sourceTcSubattr = normalizeTcSubattrMap(group.tcSubattr)
  const tcSubattr: Record<string, string[]> = {}

  tc.forEach((tcName) => {
    const mappedSubattr = sourceTcSubattr[tcName]

    // Backward compatibility: old configs only had group.subattr. When an old
    // group is loaded, keep its old behavior until the user edits it. New edits
    // below always write tcSubattr explicitly and remain per-group/per-TC.
    tcSubattr[tcName] = mappedSubattr
      ? unique(mappedSubattr)
      : [...legacySubattr]
  })

  return {
    ...group,
    tc,
    subattr: getSubattrUnionFromMap(tcSubattr),
    tcSubattr,
  }
}

function getGroupSubattrsForTc(group: Group, tcName: string) {
  return normalizeGroupBindingState(group).tcSubattr?.[tcName] ?? []
}

function renameTcSubattrKey(
  tcSubattr: Record<string, string[]>,
  oldName: string,
  nextName: string
) {
  const next: Record<string, string[]> = {}

  Object.entries(tcSubattr).forEach(([tcName, subattrs]) => {
    const targetName = tcName === oldName ? nextName : tcName
    next[targetName] = unique([...(next[targetName] ?? []), ...subattrs])
  })

  return next
}

function renameTcSubattrValue(
  tcSubattr: Record<string, string[]>,
  oldName: string,
  nextName: string
) {
  const next: Record<string, string[]> = {}

  Object.entries(tcSubattr).forEach(([tcName, subattrs]) => {
    next[tcName] = unique(
      subattrs.map((subattr) => (subattr === oldName ? nextName : subattr))
    )
  })

  return next
}

function removeTcSubattrKeys(
  tcSubattr: Record<string, string[]>,
  removedNames: Set<string>
) {
  const next: Record<string, string[]> = {}

  Object.entries(tcSubattr).forEach(([tcName, subattrs]) => {
    if (!removedNames.has(tcName)) {
      next[tcName] = [...subattrs]
    }
  })

  return next
}

function removeTcSubattrValues(
  tcSubattr: Record<string, string[]>,
  removedNames: Set<string>
) {
  const next: Record<string, string[]> = {}

  Object.entries(tcSubattr).forEach(([tcName, subattrs]) => {
    next[tcName] = subattrs.filter((subattr) => !removedNames.has(subattr))
  })

  return next
}

function normalizeGroups(value: unknown): Group[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim()
        return name ? { name, tc: [], subattr: [] } : undefined
      }

      if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as { name?: unknown }).name === "string"
      ) {
        const raw = item as {
          name: string
          tc?: unknown
          subattr?: unknown
          tcSubattr?: unknown
        }

        const name = raw.name.trim()
        if (!name) return undefined

        return normalizeGroupBindingState({
          name,
          tc: Array.isArray(raw.tc) ? unique(raw.tc.map(String)) : [],
          subattr: Array.isArray(raw.subattr)
            ? unique(raw.subattr.map(String))
            : [],
          tcSubattr: normalizeTcSubattrMap(raw.tcSubattr),
        })
      }

      return undefined
    })
    .filter((item): item is Group => Boolean(item))
}

function normalizeImportedConfig(value: unknown): ConfigData | undefined {
  if (typeof value !== "object" || value === null) return undefined

  const raw = value as {
    tc?: unknown
    subattr?: unknown
    groups?: unknown
  }

  if (!Array.isArray(raw.groups)) return undefined

  const groups = normalizeGroups(raw.groups)
  const tcFromTop = normalizeNameList(raw.tc).map((item) => item.name)
  const subattrFromTop = normalizeNameList(raw.subattr).map((item) => item.name)

  const tcFromGroups = groups.flatMap((group) => group.tc ?? [])
  const subattrFromGroups = groups.flatMap((group) => group.subattr ?? [])

  const tcNames = unique([...tcFromTop, ...tcFromGroups])
  const subattrNames = unique([...subattrFromTop, ...subattrFromGroups])

  const tcSet = new Set(tcNames)
  const subattrSet = new Set(subattrNames)

  return {
    tc: tcNames.map((name) => ({ name })),
    subattr: subattrNames.map((name) => ({ name })),
    groups: groups.map((group) => {
      const tc = unique((group.tc ?? []).filter((item) => tcSet.has(item)))
      const legacySubattr = unique(
        (group.subattr ?? []).filter((item) => subattrSet.has(item))
      )
      const sourceTcSubattr = normalizeTcSubattrMap(group.tcSubattr)
      const tcSubattr: Record<string, string[]> = {}

      tc.forEach((tcName) => {
        const sourceSubattr = sourceTcSubattr[tcName] ?? legacySubattr
        tcSubattr[tcName] = unique(
          sourceSubattr.filter((subattr) => subattrSet.has(subattr))
        )
      })

      return {
        name: group.name,
        tc,
        subattr: getSubattrUnionFromMap(tcSubattr),
        tcSubattr,
      }
    }),
  }
}

function parseTextNameList(text: string) {
  return unique(text.split(/[\n\r,;\t]+/))
}

function normalizeImportedResourceNames(
  value: unknown,
  kind: "tc" | "subattr"
): string[] {
  if (Array.isArray(value)) {
    return unique(normalizeNameList(value).map((item) => item.name))
  }

  if (typeof value !== "object" || value === null) {
    return []
  }

  const raw = value as Record<string, unknown>

  if (kind === "tc") {
    return unique(
      normalizeNameList(raw.tc ?? raw.TC ?? raw.names).map((item) => item.name)
    )
  }

  return unique(
    normalizeNameList(
      raw.subattr ?? raw.subAttr ?? raw.SubAttr ?? raw.names
    ).map((item) => item.name)
  )
}

function encodePart(value: string) {
  return encodeURIComponent(value)
}

function decodePart(value: string) {
  return decodeURIComponent(value)
}

function makeTreeKey(parts: string[]) {
  return parts.map(encodePart).join("|")
}

function parseTreeKey(key: Key) {
  return String(key).split("|").map(decodePart)
}

function makeGroupTreeKey(group: string) {
  return makeTreeKey(["group", group])
}

function makeTcTreeKey(group: string, tc: string) {
  return makeTreeKey(["group", group, "tc", tc])
}

function makeSubAttrTreeKey(group: string, tc: string, subattr: string) {
  return makeTreeKey(["group", group, "tc", tc, "subattr", subattr])
}

function getSingleExpandedTreeKeys(key: Key, expanded: boolean): Key[] {
  const parts = parseTreeKey(key)
  if (parts[0] !== "group") return []

  const groupName = parts[1]
  const groupKey = makeGroupTreeKey(groupName)

  if (!expanded) {
    return parts[2] === "tc" ? [groupKey] : []
  }

  if (parts[2] === "tc" && parts[3]) {
    return [groupKey, makeTcTreeKey(groupName, parts[3])]
  }

  return [groupKey]
}

function getToggleExpandedTreeKeys(key: Key, expandedKeys: Key[]): Key[] {
  const parts = parseTreeKey(key)
  if (parts[0] !== "group") return expandedKeys

  const groupName = parts[1]
  const groupKey = makeGroupTreeKey(groupName)

  if (!parts[2]) {
    return expandedKeys.includes(groupKey) ? [] : [groupKey]
  }

  if (parts[2] === "tc" && parts[3]) {
    const tcKey = makeTcTreeKey(groupName, parts[3])
    return expandedKeys.includes(tcKey) ? [groupKey] : [groupKey, tcKey]
  }

  if (parts[2] === "tc" && parts[4] === "subattr") {
    return [groupKey, makeTcTreeKey(groupName, parts[3])]
  }

  return [groupKey]
}

type ResourceSidebarProps = {
  page: PageKind
  treeData: TreeProps["treeData"]
  selectedKey?: Key
  onPageChange: (page: PageKind) => void
  onTreeSelect: (key: Key) => void
}

function ResourceSidebar({
  page,
  treeData,
  selectedKey,
  onPageChange,
  onTreeSelect,
}: ResourceSidebarProps) {
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([])

  return (
    <aside style={sx.left}>
      <div style={sx.leftHeader}>
        <div style={sx.title}>资源配置</div>

        <Segmented
          block
          value={page}
          options={[
            { label: "Group", value: "group" },
            { label: "TC", value: "tc" },
            { label: "SubAttr", value: "subattr" },
          ]}
          onChange={(value) => onPageChange(value as PageKind)}
        />
      </div>

      <div style={sx.leftBody}>
        <div style={sx.sectionTitle}>Group / TC / SubAttr Tree</div>

        <div style={sx.relationTreeBox}>
          {!treeData || treeData.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No Group" />
          ) : (
            <Tree
              blockNode
              virtual
              height={560}
              expandedKeys={expandedKeys}
              onExpand={(_, info) => {
                setExpandedKeys(
                  getSingleExpandedTreeKeys(info.node.key, info.expanded)
                )
              }}
              treeData={treeData}
              selectedKeys={selectedKey ? [selectedKey] : []}
              onSelect={(keys, info) => {
                const key = keys[0] ?? info.node.key
                if (!key) return

                const parts = parseTreeKey(key)
                const isGroupNode = parts[0] === "group" && !parts[2]
                const isTcNode = parts[0] === "group" && parts[2] === "tc" && !parts[4]

                if (isGroupNode || isTcNode) {
                  setExpandedKeys((prev) => getToggleExpandedTreeKeys(key, prev))
                }

                onTreeSelect(key)
              }}
            />
          )}
        </div>
      </div>
    </aside>
  )
}

type ResourceImportPanelProps = {
  page: PageKind
  configImportFileName: string
  tcImportFileName: string
  subattrImportFileName: string
  configUploadProps: UploadProps
  tcUploadProps: UploadProps
  subattrUploadProps: UploadProps
}

function ResourceImportPanel({
  page,
  configImportFileName,
  tcImportFileName,
  subattrImportFileName,
  configUploadProps,
  tcUploadProps,
  subattrUploadProps,
}: ResourceImportPanelProps) {
  if (page === "group") {
    return (
      <div style={{ ...sx.block, ...sx.formRow }}>
        <div style={sx.formLabel}>配置文件选择</div>
        <Space.Compact style={sx.formControl}>
          <Input
            readOnly
            value={configImportFileName}
            placeholder="选择配置文件..."
            suffix={<PaperClipOutlined />}
          />
          <Upload {...configUploadProps}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        </Space.Compact>
      </div>
    )
  }

  if (page === "tc") {
    return (
      <div style={{ ...sx.block, ...sx.formRow }}>
        <div style={sx.formLabel}>TC 文件导入</div>
        <Space.Compact style={sx.formControl}>
          <Input
            readOnly
            value={tcImportFileName}
            placeholder="选择 TC 文件，支持 json / txt / csv..."
            suffix={<PaperClipOutlined />}
          />
          <Upload {...tcUploadProps}>
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        </Space.Compact>
      </div>
    )
  }

  return (
    <div style={{ ...sx.block, ...sx.formRow }}>
      <div style={sx.formLabel}>SubAttr 文件导入</div>
      <Space.Compact style={sx.formControl}>
        <Input
          readOnly
          value={subattrImportFileName}
          placeholder="选择 SubAttr 文件，支持 json / txt / csv..."
          suffix={<PaperClipOutlined />}
        />
        <Upload {...subattrUploadProps}>
          <Button icon={<UploadOutlined />}>导入</Button>
        </Upload>
      </Space.Compact>
    </div>
  )
}

type NameCreatePanelProps = {
  title: string
  value: string
  onChange: (value: string) => void
  onAdd: () => void
}

function NameCreatePanel({
  title,
  value,
  onChange,
  onAdd,
}: NameCreatePanelProps) {
  return (
    <div style={{ ...sx.block, ...sx.formRow }}>
      <div style={sx.formLabel}>{title} 名称</div>

      <Space.Compact style={sx.formControl}>
        <Input
          value={value}
          placeholder={`输入新的 ${title} 名称...`}
          onChange={(event) => onChange(event.target.value)}
          onPressEnter={onAdd}
        />

        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          增加
        </Button>
      </Space.Compact>
    </div>
  )
}

type ResourceTableProps = {
  page: PageKind
  title: string
  rows: TableRow[]
  selectedRowKeys: Key[]
  activeGroupName?: string
  onSelectionChange: (keys: Key[]) => void
  onDeleteNames: (names: string[]) => void
  onOpenRename: (name: string) => void
  onDuplicateGroup: (name: string) => void
  onRowClick: (name: string) => void
}

function ResourceTable({
  page,
  title,
  rows,
  selectedRowKeys,
  activeGroupName,
  onSelectionChange,
  onDeleteNames,
  onOpenRename,
  onDuplicateGroup,
  onRowClick,
}: ResourceTableProps) {
  const columns: TableProps<TableRow>["columns"] = [
    {
      title: `${title} 名称`,
      dataIndex: "name",
      key: "name",
      render: (name: string, row) => (
        <Space size={8}>
          <span style={{ color: "#dae2fd", fontWeight: 500 }}>{name}</span>

          {page === "group" && activeGroupName === name && (
            <Tag style={sx.activeTag}>ACTIVE</Tag>
          )}

          {page === "group" && (
            <>
              <Tag style={sx.countTag}>TC {row.tcCount ?? 0}</Tag>
              <Tag style={sx.countTag}>SubAttr {row.subattrCount ?? 0}</Tag>
            </>
          )}
        </Space>
      ),
    },
    {
      title: "操作",
      key: "actions",
      align: "right",
      width: 140,
      render: (_, row) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              onOpenRename(row.name)
            }}
          />

          {page === "group" && (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                onDuplicateGroup(row.name)
              }}
            />
          )}

          <Popconfirm
            title={`删除 ${row.name}?`}
            okText="删除"
            cancelText="取消"
            onConfirm={() => onDeleteNames([row.name])}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(event) => event.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={sx.listHeader}>
        <h2 style={sx.listTitle}>{title} 列表</h2>

        <Popconfirm
          title={`删除选中的 ${selectedRowKeys.length} 项?`}
          okText="删除"
          cancelText="取消"
          disabled={selectedRowKeys.length === 0}
          onConfirm={() => onDeleteNames(selectedRowKeys.map(String))}
        >
          <Button danger disabled={selectedRowKeys.length === 0}>
            批量删除
          </Button>
        </Popconfirm>
      </div>

      <Table<TableRow>
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={rows}
        pagination={{
          pageSize: 8,
          showSizeChanger: false,
          showQuickJumper: false,
          hideOnSinglePage: false,
          showLessItems: true,
        }}
        rowSelection={{
          selectedRowKeys,
          onChange: onSelectionChange,
        }}
        onRow={(record) => ({
          onClick: () => onRowClick(record.name),
        })}
      />
    </>
  )
}

type GroupBindingTreeProps = {
  visible: boolean
  hasTc: boolean
  treeData: TreeProps["treeData"]
  checkedKeys: Key[]
  onCheck: (checked: boolean, key: Key) => void
}

function GroupBindingTree({
  visible,
  hasTc,
  treeData,
  checkedKeys,
  onCheck,
}: GroupBindingTreeProps) {
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([])

  if (!visible) return null

  return (
    <div style={sx.block}>
      <div style={sx.fieldLabel}>Group / TC / SubAttr 勾选关系</div>

      <Card size="small" style={sx.treeCard}>
        {!hasTc ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No TC. 请先创建 TC。"
          />
        ) : (
          <Tree
            checkable
            checkStrictly
            blockNode
            virtual
            height={420}
            expandedKeys={expandedKeys}
            onExpand={(_, info) => {
              setExpandedKeys(
                getSingleExpandedTreeKeys(info.node.key, info.expanded)
              )
            }}
            treeData={treeData}
            checkedKeys={{
              checked: checkedKeys,
              halfChecked: [],
            }}
            onCheck={(_, info) => {
              onCheck(info.checked, info.node.key)
            }}
          />
        )}
      </Card>
    </div>
  )
}

type RenameResourceModalProps = {
  open: boolean
  title: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

function RenameResourceModal({
  open,
  title,
  value,
  onChange,
  onSubmit,
  onCancel,
}: RenameResourceModalProps) {
  return (
    <Modal
      open={open}
      title={`重命名 ${title}`}
      okText="确定"
      cancelText="取消"
      wrapClassName="dftx-config-modal-root"
      onOk={onSubmit}
      onCancel={onCancel}
    >
      <Input
        value={value}
        placeholder="输入新名称..."
        onChange={(event) => onChange(event.target.value)}
        onPressEnter={onSubmit}
      />
    </Modal>
  )
}

export interface ConfigTabProps {
  config?: ConfigData;
  onChange?: any;
}

export default function ConfigTab(props: ConfigTabProps = {}) {
  const [config, setConfig] = useState<ConfigData>(() => props.config ?? MOCK_CONFIG_DATA)

  useEffect(() => {
    if (props.config) {
      setConfig(props.config)
    }
  }, [props.config])

  const [page, setPage] = useState<PageKind>("group")
  const [activeGroupName, setActiveGroupName] = useState<string | undefined>(
    config.groups[0]?.name
  )
  const [newName, setNewName] = useState("")
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [renameState, setRenameState] = useState<RenameState>()
  const [renameValue, setRenameValue] = useState("")
  const [configImportFileName, setConfigImportFileName] = useState("")
  const [tcImportFileName, setTcImportFileName] = useState("")
  const [subattrImportFileName, setSubattrImportFileName] = useState("")
  const [selectedRelationKey, setSelectedRelationKey] = useState<Key>()

  const currentGroup =
    config.groups.find((group) => group.name === activeGroupName) ??
    config.groups[0]

  const title =
    page === "group" ? "Group" : page === "tc" ? "TC" : "SubAttr"

  const relationTreeData = useMemo(() => {
    // 左侧关系树只展示每个 Group 已经确认勾选的绑定关系。
    // 不再使用 config.tc/config.subattr 全集作为左侧数据源。
    // 空绑定的 Group 只显示 Group 本身，不显示 TC/SubAttr。
    const validTcSet = new Set(config.tc.map((item) => item.name))
    const validSubattrSet = new Set(config.subattr.map((item) => item.name))

    return config.groups.map((group) => {
      const normalizedGroup = normalizeGroupBindingState(group)
      const tcList = (normalizedGroup.tc ?? []).filter((tcName) =>
        validTcSet.has(tcName)
      )
      const tcSubattr = normalizedGroup.tcSubattr ?? {}

      return {
        key: makeGroupTreeKey(group.name),
        title: group.name,
        children: tcList.map((tcName) => ({
          key: makeTcTreeKey(group.name, tcName),
          title: tcName,
          children: (tcSubattr[tcName] ?? [])
            .filter((subattrName) => validSubattrSet.has(subattrName))
            .map((subattrName) => ({
              key: makeSubAttrTreeKey(group.name, tcName, subattrName),
              title: subattrName,
            })),
        })),
      }
    })
  }, [config.groups, config.tc, config.subattr])

  const tableRows: TableRow[] = useMemo(() => {
    if (page === "group") {
      return config.groups.map((group) => {
        const normalizedGroup = normalizeGroupBindingState(group)

        return {
          key: group.name,
          name: group.name,
          tcCount: normalizedGroup.tc?.length ?? 0,
          subattrCount: normalizedGroup.subattr?.length ?? 0,
        }
      })
    }

    if (page === "tc") {
      return config.tc.map((item) => ({
        key: item.name,
        name: item.name,
      }))
    }

    return config.subattr.map((item) => ({
      key: item.name,
      name: item.name,
    }))
  }, [config.groups, config.tc, config.subattr, page])

  const bindingTreeData = useMemo(() => {
    if (!currentGroup) return []

    return [
      {
        key: makeGroupTreeKey(currentGroup.name),
        title: currentGroup.name,
        children: config.tc.map((tc) => ({
          key: makeTcTreeKey(currentGroup.name, tc.name),
          title: tc.name,
          children: config.subattr.map((subattr) => ({
            key: makeSubAttrTreeKey(
              currentGroup.name,
              tc.name,
              subattr.name
            ),
            title: <span style={sx.treeLeaf}>{subattr.name}</span>,
          })),
        })),
      },
    ]
  }, [currentGroup, config.tc, config.subattr])

  const checkedBindingKeys = useMemo(() => {
    if (!currentGroup) return []

    const normalizedGroup = normalizeGroupBindingState(currentGroup)
    const keys: Key[] = []
    const tcList = normalizedGroup.tc ?? []
    const tcSet = new Set(tcList)
    const allTcNames = config.tc.map((item) => item.name)
    const allSubattrNames = config.subattr.map((item) => item.name)

    const hasAllTc =
      allTcNames.length > 0 && allTcNames.every((tcName) => tcSet.has(tcName))

    const hasAllSubattrForEveryTc = allTcNames.every((tcName) => {
      const selectedSubattrSet = new Set(
        normalizedGroup.tcSubattr?.[tcName] ?? []
      )
      return allSubattrNames.every((subattr) => selectedSubattrSet.has(subattr))
    })

    if (hasAllTc && hasAllSubattrForEveryTc) {
      keys.push(makeGroupTreeKey(currentGroup.name))
    }

    for (const tc of tcList) {
      keys.push(makeTcTreeKey(currentGroup.name, tc))

      const subattrs = normalizedGroup.tcSubattr?.[tc] ?? []
      for (const subattr of subattrs) {
        keys.push(makeSubAttrTreeKey(currentGroup.name, tc, subattr))
      }
    }

    return keys
  }, [currentGroup, config.tc, config.subattr])

  function updateConfig(nextConfig: ConfigData) {
    setConfig(nextConfig)
    props.onChange?.(nextConfig)
  }

  function resetPageState(nextPage: PageKind) {
    setPage(nextPage)
    setSelectedRowKeys([])
    setNewName("")
  }

  function handleRelationTreeSelect(key: Key) {
    const parts = parseTreeKey(key)
    if (parts[0] !== "group") return

    setSelectedRelationKey(key)
    setActiveGroupName(parts[1])
    setSelectedRowKeys([])
    setNewName("")
    setPage("group")
  }

  function addItem() {
    const name = newName.trim()
    if (!name) return

    if (page === "group") {
      if (config.groups.some((group) => group.name === name)) {
        message.warning(`Group already exists: ${name}`)
        return
      }

      updateConfig({
        ...config,
        groups: [...config.groups, { name, tc: [], subattr: [], tcSubattr: {} }],
      })

      setActiveGroupName(name)
      setSelectedRelationKey(makeGroupTreeKey(name))
    }

    if (page === "tc") {
      if (config.tc.some((item) => item.name === name)) {
        message.warning(`TC already exists: ${name}`)
        return
      }

      updateConfig({ ...config, tc: [...config.tc, { name }] })
    }

    if (page === "subattr") {
      if (config.subattr.some((item) => item.name === name)) {
        message.warning(`SubAttr already exists: ${name}`)
        return
      }

      updateConfig({ ...config, subattr: [...config.subattr, { name }] })
    }

    setNewName("")
  }

  function deleteItems(names: string[]) {
    const nameSet = new Set(names)

    if (page === "group") {
      const nextGroups = config.groups.filter(
        (group) => !nameSet.has(group.name)
      )

      updateConfig({ ...config, groups: nextGroups })

      if (currentGroup && nameSet.has(currentGroup.name)) {
        setActiveGroupName(nextGroups[0]?.name)
        setSelectedRelationKey(
          nextGroups[0] ? makeGroupTreeKey(nextGroups[0].name) : undefined
        )
      }
    }

    if (page === "tc") {
      updateConfig({
        ...config,
        tc: config.tc.filter((item) => !nameSet.has(item.name)),
        groups: config.groups.map((group) => {
          const normalizedGroup = normalizeGroupBindingState(group)
          const tc = (normalizedGroup.tc ?? []).filter(
            (tcName) => !nameSet.has(tcName)
          )
          const tcSubattr = removeTcSubattrKeys(
            normalizedGroup.tcSubattr ?? {},
            nameSet
          )

          return {
            ...group,
            tc,
            subattr: getSubattrUnionFromMap(tcSubattr),
            tcSubattr,
          }
        }),
      })
    }

    if (page === "subattr") {
      updateConfig({
        ...config,
        subattr: config.subattr.filter((item) => !nameSet.has(item.name)),
        groups: config.groups.map((group) => {
          const normalizedGroup = normalizeGroupBindingState(group)
          const tcSubattr = removeTcSubattrValues(
            normalizedGroup.tcSubattr ?? {},
            nameSet
          )

          return {
            ...group,
            subattr: getSubattrUnionFromMap(tcSubattr),
            tcSubattr,
          }
        }),
      })
    }

    setSelectedRowKeys([])
  }

  function openRename(name: string) {
    setRenameState({ kind: page, oldName: name })
    setRenameValue(name)
  }

  function submitRename() {
    if (!renameState) return

    const oldName = renameState.oldName
    const nextName = renameValue.trim()

    if (!nextName) return

    if (oldName === nextName) {
      setRenameState(undefined)
      return
    }

    if (renameState.kind === "group") {
      if (config.groups.some((group) => group.name === nextName)) {
        message.warning(`Group already exists: ${nextName}`)
        return
      }

      updateConfig({
        ...config,
        groups: config.groups.map((group) =>
          group.name === oldName ? { ...group, name: nextName } : group
        ),
      })

      if (currentGroup?.name === oldName) {
        setActiveGroupName(nextName)
        setSelectedRelationKey(makeGroupTreeKey(nextName))
      }
    }

    if (renameState.kind === "tc") {
      if (config.tc.some((item) => item.name === nextName)) {
        message.warning(`TC already exists: ${nextName}`)
        return
      }

      updateConfig({
        ...config,
        tc: config.tc.map((item) =>
          item.name === oldName ? { name: nextName } : item
        ),
        groups: config.groups.map((group) => {
          const normalizedGroup = normalizeGroupBindingState(group)
          const tc = (normalizedGroup.tc ?? []).map((tcName) =>
            tcName === oldName ? nextName : tcName
          )
          const tcSubattr = renameTcSubattrKey(
            normalizedGroup.tcSubattr ?? {},
            oldName,
            nextName
          )

          return {
            ...group,
            tc: unique(tc),
            subattr: getSubattrUnionFromMap(tcSubattr),
            tcSubattr,
          }
        }),
      })
    }

    if (renameState.kind === "subattr") {
      if (config.subattr.some((item) => item.name === nextName)) {
        message.warning(`SubAttr already exists: ${nextName}`)
        return
      }

      updateConfig({
        ...config,
        subattr: config.subattr.map((item) =>
          item.name === oldName ? { name: nextName } : item
        ),
        groups: config.groups.map((group) => {
          const normalizedGroup = normalizeGroupBindingState(group)
          const tcSubattr = renameTcSubattrValue(
            normalizedGroup.tcSubattr ?? {},
            oldName,
            nextName
          )

          return {
            ...group,
            subattr: getSubattrUnionFromMap(tcSubattr),
            tcSubattr,
          }
        }),
      })
    }

    setRenameState(undefined)
  }

  function duplicateGroup(name: string) {
    const source = config.groups.find((group) => group.name === name)
    if (!source) return

    const nextName = makeCopyName(
      name,
      config.groups.map((group) => group.name)
    )

    updateConfig({
      ...config,
      groups: [
        ...config.groups,
        {
          name: nextName,
          tc: [...(normalizeGroupBindingState(source).tc ?? [])],
          subattr: [...(normalizeGroupBindingState(source).subattr ?? [])],
          tcSubattr: {
            ...(normalizeGroupBindingState(source).tcSubattr ?? {}),
          },
        },
      ],
    })

    setActiveGroupName(nextName)
    setSelectedRelationKey(makeGroupTreeKey(nextName))
  }

  function updateGroupBinding(
    groupName: string,
    patch: Partial<Pick<Group, "tc" | "subattr" | "tcSubattr">>
  ) {
    updateConfig({
      ...config,
      groups: config.groups.map((group) =>
        group.name === groupName
          ? normalizeGroupBindingState({ ...group, ...patch })
          : group
      ),
    })
  }

  function handleBindingTreeCheck(checked: boolean, key: Key) {
    if (!currentGroup) return

    const parts = parseTreeKey(key)
    if (parts[0] !== "group") return
    if (parts[1] !== currentGroup.name) return

    const nodeType = parts[2]
    const normalizedGroup = normalizeGroupBindingState(currentGroup)
    const currentTc = normalizedGroup.tc ?? []
    const currentTcSubattr = { ...(normalizedGroup.tcSubattr ?? {}) }

    if (!nodeType) {
      const allTc = config.tc.map((item) => item.name)
      const allSubattr = config.subattr.map((item) => item.name)
      const tcSubattr: Record<string, string[]> = {}

      if (checked) {
        allTc.forEach((tcName) => {
          tcSubattr[tcName] = [...allSubattr]
        })
      }

      updateGroupBinding(currentGroup.name, {
        tc: checked ? allTc : [],
        subattr: checked ? allSubattr : [],
        tcSubattr,
      })
      return
    }

    if (nodeType === "tc" && !parts[4]) {
      const tcName = parts[3]
      const allSubattr = config.subattr.map((item) => item.name)
      const nextTc = checked
        ? unique([...currentTc, tcName])
        : currentTc.filter((item) => item !== tcName)
      const tcSubattr = { ...currentTcSubattr }

      if (checked) {
        // Selecting a TC should enable all SubAttr under this TC by default.
        // This binding remains scoped to the current group and current TC only.
        tcSubattr[tcName] = [...allSubattr]
      } else {
        delete tcSubattr[tcName]
      }

      updateGroupBinding(currentGroup.name, {
        tc: nextTc,
        subattr: getSubattrUnionFromMap(tcSubattr),
        tcSubattr,
      })
      return
    }

    if (nodeType === "tc" && parts[4] === "subattr") {
      const tcName = parts[3]
      const subattrName = parts[5]
      const nextTc = checked ? unique([...currentTc, tcName]) : currentTc
      const tcSubattr = { ...currentTcSubattr }
      const currentSubattrForTc = tcSubattr[tcName] ?? []

      tcSubattr[tcName] = checked
        ? unique([...currentSubattrForTc, subattrName])
        : currentSubattrForTc.filter((item) => item !== subattrName)

      updateGroupBinding(currentGroup.name, {
        tc: nextTc,
        subattr: getSubattrUnionFromMap(tcSubattr),
        tcSubattr,
      })
    }
  }

  function handleImportConfig(file: File) {
    const reader = new FileReader()

    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const nextConfig = normalizeImportedConfig(parsed)

        if (!nextConfig) {
          Modal.error({
            title: "配置文件格式不正确",
            content:
              "配置文件至少需要包含 groups 数组，可选包含 tc 和 subattr 数组。",
          })
          return
        }

        updateConfig(nextConfig)
        setConfigImportFileName(file.name)
        setActiveGroupName(nextConfig.groups[0]?.name)
        setSelectedRelationKey(
          nextConfig.groups[0]
            ? makeGroupTreeKey(nextConfig.groups[0].name)
            : undefined
        )
        setSelectedRowKeys([])
        message.success(`Imported: ${file.name}`)
      } catch {
        Modal.error({
          title: "配置文件解析失败",
          content: "请确认导入的是合法 JSON 文件。",
        })
      }
    }

    reader.readAsText(file)
  }

  function handleImportResource(file: File, kind: "tc" | "subattr") {
    const reader = new FileReader()

    reader.onload = () => {
      const text = String(reader.result)
      let names: string[] = []

      try {
        const parsed = JSON.parse(text)
        names = normalizeImportedResourceNames(parsed, kind)
      } catch {
        names = parseTextNameList(text)
      }

      if (names.length === 0) {
        Modal.error({
          title: "导入失败",
          content: "未解析到任何有效名称。",
        })
        return
      }

      if (kind === "tc") {
        const nextNames = unique([
          ...config.tc.map((item) => item.name),
          ...names,
        ])

        updateConfig({ ...config, tc: nextNames.map((name) => ({ name })) })
        setTcImportFileName(file.name)
      }

      if (kind === "subattr") {
        const nextNames = unique([
          ...config.subattr.map((item) => item.name),
          ...names,
        ])

        updateConfig({
          ...config,
          subattr: nextNames.map((name) => ({ name })),
        })
        setSubattrImportFileName(file.name)
      }

      message.success(`Imported ${names.length} item(s) from ${file.name}`)
    }

    reader.readAsText(file)
  }

  const configUploadProps: UploadProps = {
    accept: ".json",
    showUploadList: false,
    beforeUpload: (file) => {
      handleImportConfig(file)
      return false
    },
  }

  const tcUploadProps: UploadProps = {
    accept: ".json,.txt,.csv",
    showUploadList: false,
    beforeUpload: (file) => {
      handleImportResource(file, "tc")
      return false
    },
  }

  const subattrUploadProps: UploadProps = {
    accept: ".json,.txt,.csv",
    showUploadList: false,
    beforeUpload: (file) => {
      handleImportResource(file, "subattr")
      return false
    },
  }

  return (
    <div className="dftx-config-page" style={sx.page}>
      <style>{CONFIG_TAB_THEME_CSS}</style>

      <ResourceSidebar
        page={page}
        treeData={relationTreeData}
        selectedKey={
          selectedRelationKey ??
          (currentGroup ? makeGroupTreeKey(currentGroup.name) : undefined)
        }
        onPageChange={resetPageState}
        onTreeSelect={handleRelationTreeSelect}
      />

      <main style={sx.right}>
        <ResourceImportPanel
          page={page}
          configImportFileName={configImportFileName}
          tcImportFileName={tcImportFileName}
          subattrImportFileName={subattrImportFileName}
          configUploadProps={configUploadProps}
          tcUploadProps={tcUploadProps}
          subattrUploadProps={subattrUploadProps}
        />

        <NameCreatePanel
          title={title}
          value={newName}
          onChange={setNewName}
          onAdd={addItem}
        />

        <ResourceTable
          page={page}
          title={title}
          rows={tableRows}
          selectedRowKeys={selectedRowKeys}
          activeGroupName={currentGroup?.name}
          onSelectionChange={setSelectedRowKeys}
          onDeleteNames={deleteItems}
          onOpenRename={openRename}
          onDuplicateGroup={duplicateGroup}
          onRowClick={(name) => {
            if (page === "group") {
              setActiveGroupName(name)
              setSelectedRelationKey(makeGroupTreeKey(name))
            }
          }}
        />

        <GroupBindingTree
          key={currentGroup?.name ?? "no-active-group"}
          visible={page === "group" && Boolean(currentGroup)}
          hasTc={config.tc.length > 0}
          treeData={bindingTreeData}
          checkedKeys={checkedBindingKeys}
          onCheck={handleBindingTreeCheck}
        />

        <RenameResourceModal
          open={Boolean(renameState)}
          title={title}
          value={renameValue}
          onChange={setRenameValue}
          onSubmit={submitRename}
          onCancel={() => setRenameState(undefined)}
        />
      </main>
    </div>
  )
}
