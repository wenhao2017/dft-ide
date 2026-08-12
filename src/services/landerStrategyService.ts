import * as path from 'path'
import * as vscode from 'vscode'

import {
  collectLanderModeParameters,
  getLanderModeParameterRelations,
} from './landerPipelineService'
import type {
  LanderModeParameters,
  LanderParameterRelation,
  LanderStep,
} from './landerPipelineService'

export const LANDER_STRATEGY_SOURCE_EXTENSIONS = ['.json', '.xlsx', '.xls'] as const
export const LANDER_STRATEGY_STEP_NAMES = [
  'create_project',
  'gen_design_info',
  'gen_plan_env',
  'release_plan',
] as const

export interface LanderStrategyExecutionContext {
  repoRoot: string
  stage: string
  modeName: string
  cfgPath: string
  availableSteps: LanderStep[]
}

export interface LanderStrategyExecutionResult {
  implemented: true
  cfgPath: string
  outputDirectory: string
  outputPath: string
  sourceExtensions: readonly string[]
  steps: LanderStep[]
}

export interface LanderStrategyMaterializationResult {
  outputPath: string
  parameters: LanderStrategyParameterGroup[]
}

export interface LanderStrategyParameterGroup {
  group: string | null
  tc: string[]
  subattr: string | null
}

function findStrategyStepIndex(steps: Array<Pick<LanderStep, 'name'>>): number {
  const strategyLength = LANDER_STRATEGY_STEP_NAMES.length
  for (let start = 0; start <= steps.length - strategyLength; start += 1) {
    const matches = LANDER_STRATEGY_STEP_NAMES.every(
      (name, offset) => steps[start + offset].name === name,
    )
    if (matches) return start
  }

  return -1
}

function findStrategySteps(steps: LanderStep[]): LanderStep[] | undefined {
  const start = findStrategyStepIndex(steps)
  return start >= 0
    ? steps.slice(start, start + LANDER_STRATEGY_STEP_NAMES.length)
    : undefined
}

export function isLanderStrategySteps(steps: Array<Pick<LanderStep, 'name'>>): boolean {
  return steps.length === LANDER_STRATEGY_STEP_NAMES.length
    && LANDER_STRATEGY_STEP_NAMES.every((name, index) => steps[index]?.name === name)
}

export function getLanderStrategyOutputPath(
  repoRoot: string,
  stage: string,
  modeName: string,
): string {
  return path.join(repoRoot, stage, 'lander_env', 'lander_strategy', `${modeName}.json`)
}

export async function hasLanderStrategyOutput(
  repoRoot: string,
  stage: string,
  modeName: string,
): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(
      getLanderStrategyOutputPath(repoRoot, stage, modeName),
    ))
    return (stat.type & vscode.FileType.File) !== 0
  } catch {
    return false
  }
}

/** Return the default Run selector start without removing any visible steps. */
export function getLanderRunStartStepIndex(
  steps: Array<Pick<LanderStep, 'name'>>,
  strategyOutputExists: boolean,
): number {
  if (!strategyOutputExists) return 0

  const strategyStart = findStrategyStepIndex(steps)
  return strategyStart >= 0
    ? strategyStart + LANDER_STRATEGY_STEP_NAMES.length
    : 0
}

function groupStrategyParameters(
  relations: LanderParameterRelation[],
): LanderStrategyParameterGroup[] {
  const grouped = new Map<string, LanderStrategyParameterGroup>()

  for (const relation of relations) {
    const key = JSON.stringify([relation.group, relation.subattr])
    const current = grouped.get(key) ?? {
      group: relation.group,
      tc: [],
      subattr: relation.subattr,
    }
    if (relation.tc && !current.tc.includes(relation.tc)) current.tc.push(relation.tc)
    grouped.set(key, current)
  }

  return [...grouped.values()]
}

export async function materializeLanderStrategyParameters(
  context: Pick<LanderStrategyExecutionContext, 'repoRoot' | 'stage' | 'modeName' | 'cfgPath'>,
): Promise<LanderStrategyMaterializationResult> {
  const relations = await getLanderModeParameterRelations(context.cfgPath, {
    verificationRepoRoot: context.repoRoot,
    selectedStage: context.stage,
  })
  const parameters = groupStrategyParameters(relations)
  const outputPath = getLanderStrategyOutputPath(context.repoRoot, context.stage, context.modeName)
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(outputPath)))
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(outputPath),
    new TextEncoder().encode(`${JSON.stringify(parameters, null, 2)}\n`),
  )
  return { outputPath, parameters }
}

export async function readLanderStrategyParameters(
  repoRoot: string,
  stage: string,
  modeName: string,
): Promise<LanderModeParameters> {
  const outputPath = getLanderStrategyOutputPath(repoRoot, stage, modeName)
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(outputPath))
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!Array.isArray(parsed)) throw new Error('strategy parameter file must contain an array')
    const relations = parsed.flatMap((item): LanderParameterRelation[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const value = item as Record<string, unknown>
      if (!((typeof value.group === 'string' || value.group === null)
        && (typeof value.subattr === 'string' || value.subattr === null))) return []

      // Accept legacy files with a scalar `tc` while all newly generated files
      // use the grouped string-array shape.
      const tcs = Array.isArray(value.tc)
        ? value.tc.filter((tc): tc is string => typeof tc === 'string')
        : typeof value.tc === 'string'
          ? [value.tc]
          : value.tc === null
            ? [null]
            : []
      return (tcs.length > 0 ? tcs : [null]).map((tc) => ({
        group: value.group as string | null,
        tc,
        subattr: value.subattr as string | null,
      }))
    })
    return collectLanderModeParameters(relations)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid Lander strategy parameter file: ${outputPath}: ${error.message}`)
    }
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(outputPath))
    } catch {
      return { groups: [], tcs: [], subattrs: [] }
    }
    throw error
  }
}

/**
 * Reserved extension-host boundary for Lander strategy execution.
 *
 * Future implementation:
 *
 * Keeping this in the extension host ensures that filesystem/process access
 * never leaks into the browser-only webview.
 *
 * Select the supported strategy from the steps produced by the regular Lander
 * Run parser. A strategy only matches when all four required steps are
 * adjacent and in the declared order.
 */
export async function executeLanderStrategy(
  context: LanderStrategyExecutionContext,
): Promise<LanderStrategyExecutionResult> {
  const steps = findStrategySteps(context.availableSteps)
  if (!steps) throw new Error('没有对应策略')

  const outputDirectory = path.join(
    context.repoRoot,
    context.stage,
    'lander_env',
    'lander_strategy',
  )

  return {
    implemented: true,
    cfgPath: context.cfgPath,
    outputDirectory,
    outputPath: getLanderStrategyOutputPath(context.repoRoot, context.stage, context.modeName),
    sourceExtensions: LANDER_STRATEGY_SOURCE_EXTENSIONS,
    steps,
  }
}
