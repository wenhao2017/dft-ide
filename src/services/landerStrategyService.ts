import * as path from 'path'

import type { LanderStep } from './landerPipelineService'

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

function findStrategySteps(steps: LanderStep[]): LanderStep[] | undefined {
  const strategyLength = LANDER_STRATEGY_STEP_NAMES.length
  for (let start = 0; start <= steps.length - strategyLength; start += 1) {
    const matches = LANDER_STRATEGY_STEP_NAMES.every(
      (name, offset) => steps[start + offset].name === name,
    )
    if (matches) return steps.slice(start, start + strategyLength)
  }
  return undefined
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
    outputPath: path.join(outputDirectory, `${context.modeName}.json`),
    sourceExtensions: LANDER_STRATEGY_SOURCE_EXTENSIONS,
    steps,
  }
}
