/**
 * Extracts the `-mode` option from a Tcl-style `define_project_info` command.
 */
export function parsePreModeFromModeCfg(contents: string): string | undefined {
  const normalized = contents.replace(/\\[ \t]*(?:\r\n|\r|\n)/g, ' ')
  const command = normalized.match(
    /(?:^|[\r\n;])\s*define_project_info\b([^\r\n;]*)/m,
  )

  if (!command) {
    return undefined
  }

  const modeOption = command[1].match(
    /(?:^|\s)-mode(?:\s+|=\s*)(?:\{([^{}]*)\}|"([^"]*)"|'([^']*)'|([^\s\\;]+))/,
  )
  const preMode = modeOption?.slice(1).find((value) => value !== undefined)?.trim()

  return preMode || undefined
}
