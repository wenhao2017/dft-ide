import * as path from 'path'

export const LANDER_STRATEGY_SOURCE_EXTENSIONS = ['.json', '.xlsx', '.xls'] as const

export interface LanderStrategyExecutionContext {
  repoRoot: string
  stage: string
  modeName: string
  cfgPath: string
}

export interface LanderStrategyExecutionResult {
  implemented: false
  cfgPath: string
  outputDirectory: string
  outputPath: string
  sourceExtensions: readonly string[]
  steps: LanderStrategyStep[]
}

export interface LanderStrategyStep {
  id: string
  name: string
  command: string
  description: string
  enableGroup: boolean
  enableTC: boolean
  enableSubAttr: boolean
}

/**
 * Reserved extension-host boundary for Lander strategy execution.
 *
 * Future implementation:
 * 1. Parse cfgPath to replace the reserved step below with the actual steps.
 * 2. Only after a successful execution, resolve the report directories from
 *    the CFG and discover JSON/XLSX/XLS result files there.
 * 3. Parse the discovered files and write one normalized JSON document to
 *    <verification repo>/<stage>/lander_env/lander_strategy/<cfg filename>.json.
 *
 * Keeping this in the extension host ensures that filesystem/process access
 * never leaks into the browser-only webview.
 */
export async function executeLanderStrategy(
  context: LanderStrategyExecutionContext,
): Promise<LanderStrategyExecutionResult> {
  const strategyStepName = 'lander-strategy'
  const outputDirectory = path.join(
    context.repoRoot,
    context.stage,
    'lander_env',
    'lander_strategy',
  )

  return {
    implemented: false,
    cfgPath: context.cfgPath,
    outputDirectory,
    outputPath: path.join(outputDirectory, `${context.modeName}.json`),
    sourceExtensions: LANDER_STRATEGY_SOURCE_EXTENSIONS,
    // Keep strategy submission on the regular pipeline runtime path today.
    // The CFG parser will replace this placeholder with its own execution plan.
    steps: [{
      id: 'lander-strategy',
      name: strategyStepName,
      command: `run_flow_lander ${strategyStepName}`,
      description: '预留任务：后续由 Mode CFG 解析结果提供实际执行步骤',
      enableGroup: false,
      enableTC: false,
      enableSubAttr: false,
    }],
  }
}
