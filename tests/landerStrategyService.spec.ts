import * as path from 'path'
import { describe, expect, it } from 'vitest'

import {
  executeLanderStrategy,
  LANDER_STRATEGY_SOURCE_EXTENSIONS,
  LANDER_STRATEGY_STEP_NAMES,
} from '../src/services/landerStrategyService'
import type { LanderStep } from '../src/services/landerPipelineService'

function step(name: string): LanderStep {
  return {
    id: name,
    name,
    command: `run_flow_lander --steps ${name}`,
    description: name,
    enableGroup: false,
    enableTC: false,
    enableSubAttr: false,
  }
}

function createContext(availableSteps: LanderStep[]) {
  const repoRoot = path.join('workspace', 'demo_verification')
  const stage = 'stage_a'
  const modeName = 'scan_mode'
  return {
    repoRoot,
    stage,
    modeName,
    cfgPath: path.join(repoRoot, stage, 'lander_env', 'lander_cfg', `${modeName}.cfg`),
    availableSteps,
  }
}

describe('landerStrategyService', () => {
  it('executes the four-step strategy when the Run steps contain it consecutively', async () => {
    const strategySteps = LANDER_STRATEGY_STEP_NAMES.map(step)
    const context = createContext([
      step('prepare'),
      ...strategySteps,
      step('run_atpg'),
    ])

    const result = await executeLanderStrategy(context)
    const outputDirectory = path.join(
      context.repoRoot,
      context.stage,
      'lander_env',
      'lander_strategy',
    )

    expect(result).toEqual({
      implemented: true,
      cfgPath: context.cfgPath,
      outputDirectory,
      outputPath: path.join(outputDirectory, `${context.modeName}.json`),
      sourceExtensions: LANDER_STRATEGY_SOURCE_EXTENSIONS,
      steps: strategySteps,
    })
  })

  it('reports no matching strategy when the required steps are not consecutive', async () => {
    const context = createContext([
      step('create_project'),
      step('gen_design_info'),
      step('other_step'),
      step('gen_plan_env'),
      step('release_plan'),
    ])

    await expect(executeLanderStrategy(context)).rejects.toThrow('没有对应策略')
  })

  it('reports no matching strategy when a required step is absent', async () => {
    const context = createContext([
      step('create_project'),
      step('gen_design_info'),
      step('gen_plan_env'),
    ])

    await expect(executeLanderStrategy(context)).rejects.toThrow('没有对应策略')
  })
})
