import * as path from 'path'
import { describe, expect, it } from 'vitest'

import {
  executeLanderStrategy,
  LANDER_STRATEGY_SOURCE_EXTENSIONS,
} from '../src/services/landerStrategyService'

describe('landerStrategyService', () => {
  it('reserves the CFG-derived strategy output contract without writing files', async () => {
    const repoRoot = path.join('workspace', 'demo_verification')
    const stage = 'stage_a'
    const modeName = 'scan_mode'
    const cfgPath = path.join(repoRoot, stage, 'lander_env', 'lander_cfg', `${modeName}.cfg`)

    const result = await executeLanderStrategy({ repoRoot, stage, modeName, cfgPath })

    const outputDirectory = path.join(repoRoot, stage, 'lander_env', 'lander_strategy')
    expect(result).toEqual({
      implemented: false,
      cfgPath,
      outputDirectory,
      outputPath: path.join(outputDirectory, `${modeName}.json`),
      sourceExtensions: LANDER_STRATEGY_SOURCE_EXTENSIONS,
      steps: [{
        id: 'lander-strategy',
        name: 'lander-strategy',
        command: `run_flow_lander ${result.steps[0].name}`,
        description: '预留任务：后续由 Mode CFG 解析结果提供实际执行步骤',
        enableGroup: false,
        enableTC: false,
        enableSubAttr: false,
      }],
    })
  })
})
