import * as path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  executeLanderStrategy,
  getLanderRunStartStepIndex,
  getLanderStrategyOutputPath,
  hasLanderStrategyOutput,
  LANDER_STRATEGY_SOURCE_EXTENSIONS,
  LANDER_STRATEGY_STEP_NAMES,
  materializeLanderStrategyParameters,
  readLanderStrategyParameters,
} from '../src/services/landerStrategyService'
import type { LanderStep } from '../src/services/landerPipelineService'
import { mockFilesystem, resetMockFilesystem } from './setup'

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
  beforeEach(() => resetMockFilesystem())

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

  it('materializes related parameters and reads their universes', async () => {
    const context = createContext(LANDER_STRATEGY_STEP_NAMES.map(step))
    const sourcePath = path.join(
      context.repoRoot,
      context.stage,
      'mbist',
      'lander_dir',
      '01.plan',
      'release',
      'POST',
      'r1',
      'MBIST_TOP_TC_PLAN.json',
    )
    mockFilesystem.set(path.resolve(context.cfgPath), [
      'define_project_info -mode mbist -stage POST -version r1',
      'define_mbist_info -mode top',
    ].join('\n'))
    mockFilesystem.set(path.resolve(sourcePath), JSON.stringify({
      detail: [
        { group: 'g1', subattr: null, tc1: 'Y', tc2: null },
        { group: 'g1', subattr: 'subattr1', tc1: 'Y', tc2: 'Y' },
        { group: 'g2', subattr: 'subattr2', tc1: null, tc2: 'Y' },
      ],
    }))

    const result = await materializeLanderStrategyParameters(context)
    const outputPath = getLanderStrategyOutputPath(
      context.repoRoot,
      context.stage,
      context.modeName,
    )

    expect(result.outputPath).toBe(outputPath)
    expect(result.parameters).toEqual([
      { group: 'g1', tc: ['tc1'], subattr: null },
      { group: 'g1', tc: ['tc1', 'tc2'], subattr: 'subattr1' },
      { group: 'g2', tc: ['tc2'], subattr: 'subattr2' },
    ])
    expect(JSON.parse(mockFilesystem.get(path.resolve(outputPath)) ?? '')).toEqual([
      { group: 'g1', tc: ['tc1'], subattr: null },
      { group: 'g1', tc: ['tc1', 'tc2'], subattr: 'subattr1' },
      { group: 'g2', tc: ['tc2'], subattr: 'subattr2' },
    ])
    await expect(readLanderStrategyParameters(
      context.repoRoot,
      context.stage,
      context.modeName,
    )).resolves.toEqual({
      groups: ['g1', 'g2'],
      tcs: ['tc1', 'tc2'],
      subattrs: ['subattr1', 'subattr2'],
    })
  })

  it('returns empty parameter universes when no strategy JSON exists', async () => {
    const context = createContext([])
    await expect(readLanderStrategyParameters(
      context.repoRoot,
      context.stage,
      context.modeName,
    )).resolves.toEqual({ groups: [], tcs: [], subattrs: [] })
  })

  it('resumes Run after the strategy steps when the strategy JSON exists', async () => {
    const context = createContext([])
    const outputPath = getLanderStrategyOutputPath(
      context.repoRoot,
      context.stage,
      context.modeName,
    )
    mockFilesystem.set(path.resolve(outputPath), '[]')
    const steps = [
      step('prepare'),
      ...LANDER_STRATEGY_STEP_NAMES.map(step),
      step('run_simulation'),
      step('collect_result'),
    ]

    const outputExists = await hasLanderStrategyOutput(
      context.repoRoot,
      context.stage,
      context.modeName,
    )

    expect(outputExists).toBe(true)
    expect(getLanderRunStartStepIndex(steps, outputExists)).toBe(5)
    expect(steps.map(({ name }) => name)).toEqual([
      'prepare',
      ...LANDER_STRATEGY_STEP_NAMES,
      'run_simulation',
      'collect_result',
    ])
  })

  it('keeps all Run steps when the strategy JSON does not exist', async () => {
    const context = createContext([])
    const steps = [
      ...LANDER_STRATEGY_STEP_NAMES.map(step),
      step('run_simulation'),
    ]

    const outputExists = await hasLanderStrategyOutput(
      context.repoRoot,
      context.stage,
      context.modeName,
    )

    expect(outputExists).toBe(false)
    expect(getLanderRunStartStepIndex(steps, outputExists)).toBe(0)
  })

  it('keeps all Run steps when no complete strategy sequence is present', () => {
    const steps = [
      step('create_project'),
      step('gen_design_info'),
      step('other_step'),
      step('gen_plan_env'),
      step('release_plan'),
      step('run_simulation'),
    ]

    expect(getLanderRunStartStepIndex(steps, true)).toBe(0)
  })
})
