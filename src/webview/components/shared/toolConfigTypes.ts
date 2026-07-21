export type VersionToolConfig = {
  id: string
  type: 'version'
  name: string
  version: string
}

export type PathToolConfig = {
  id: string
  type: 'path'
  name: string
  path: string
}

export type ToolConfig = VersionToolConfig | PathToolConfig

export type ToolPatch = {
  type?: ToolConfig['type']
  name?: string
  version?: string
  path?: string
}
