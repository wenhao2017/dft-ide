import { describe, expect, it } from 'vitest'

import { parseLanderModeConfigInfo, parseLanderModeParameters } from '../src/services/landerPipelineService'

describe('Lander mode parameter parsing', () => {
  it('collects Group, TC and SubAttr choices from the selected mode content', () => {
    const content = [
      'define_project_info -mode atpg',
      'define_atpg_info \\',
      '  -stage scan \\',
      '  -mode stuck_at \\',
      '  -group {group_a group_b} \\',
      '  -tc tc_1,tc_2 \\',
      '  -subattr "slow fast"',
    ].join('\n')

    expect(parseLanderModeParameters(content)).toEqual({
      groups: ['group_a', 'group_b'],
      tcs: ['tc_1', 'tc_2'],
      subattrs: ['slow', 'fast'],
    })
  })

  it('deduplicates aliases and includes parameters in config info', () => {
    const content = [
      'define_atpg_info -stage scan -mode transition -group g1 -groups {g1 g2}',
      'set_runtime_info -tcs {tc_a;tc_b} -subattrs s1,s1',
    ].join('\n')

    expect(parseLanderModeConfigInfo(content)).toEqual({
      atpgStage: 'scan',
      atpgMode: 'transition',
      parameters: {
        groups: ['g1', 'g2'],
        tcs: ['tc_a', 'tc_b'],
        subattrs: ['s1'],
      },
    })
  })
})
