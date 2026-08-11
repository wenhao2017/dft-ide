import { describe, expect, it } from 'vitest'

import * as path from 'path'

import {
  parseLanderJsonRelations,
  parseLanderJsonParameters,
  parseLanderWorkbookRelations,
  parseLanderModeConfigInfo,
  parseLanderModeParameters,
  resolveLanderParameterSourcePaths,
} from '../src/services/landerPipelineService'

describe('Lander mode parameter parsing', () => {
  it('preserves JSON Group/TC/SubAttr relations and ignores disabled cells', () => {
    expect(parseLanderJsonRelations(JSON.stringify({
      detail: [
        { group: 'g1', subattr: null, tc1: 'Y', tc2: null },
        { group: 'g1', subattr: 'subattr1', tc1: 'Y', tc2: 'N' },
        { group: 'g2', subattr: 'subattr2', tc2: true, tc3: 0 },
      ],
    }))).toEqual([
      { group: 'g1', tc: 'tc1', subattr: null },
      { group: 'g1', tc: 'tc1', subattr: 'subattr1' },
      { group: 'g2', tc: 'tc2', subattr: 'subattr2' },
    ])
  })

  it('preserves workbook Group/TC relations and ignores N cells', async () => {
    const XLSX = await import('xlsx')
    const sheet = XLSX.utils.aoa_to_sheet([
      [null, 'dft2pr', null],
      ['group', 'tc1', 'tc2'],
      ['g1', 'Y', 'Y'],
      ['g2', 'N', 'Y'],
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })

    expect(parseLanderWorkbookRelations(bytes)).toEqual([
      { group: 'g1', tc: 'tc1', subattr: null },
      { group: 'g1', tc: 'tc2', subattr: null },
      { group: 'g2', tc: 'tc2', subattr: null },
    ])
  })

  it('does not expose a JSON TC whose values are all null', () => {
    expect(parseLanderJsonParameters(JSON.stringify({
      detail: [
        { group: 'g1', subattr: null, tc_present: 'Y', tc_missing: null },
        { group: 'g2', subattr: 'sa', tc_present: null, tc_missing: null },
      ],
    }))).toEqual({
      groups: ['g1', 'g2'],
      tcs: ['tc_present'],
      subattrs: ['sa'],
    })
  })

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

  it('resolves ATPG parameter files below the selected stage work path', () => {
    const content = [
      'define_project_info -mode atpg -stage DFT -version v2 -crg on',
      'define_atpg_info -mode stuck_at -top_mode chip -fault_type stuck',
    ].join('\n')
    const repoRoot = path.join('workspace', 'demo_verification')
    const workPath = path.join(repoRoot, 'stage_a', 'atpg', 'lander_dir')

    expect(resolveLanderParameterSourcePaths(content, repoRoot, 'stage_a')).toEqual({
      workPath,
      tcFile: path.join(
        workPath,
        '01.plan',
        'release',
        'DFT',
        'v2',
        'crg',
        'STUCK_AT_GROUP_TC.chip.stuck.cfg.tc.xlsx',
      ),
    })
  })

  it('keeps define commands separate when an escaped line is followed by a blank line', () => {
    const content = [
      'define_project_info \\',
      '  -mode atpg \\',
      '  -stage DFT \\',
      '  -version v2 \\',
      '  -crg on \\',
      '',
      'define_atpg_info \\',
      '  -mode stuck_at \\',
      '  -top_mode chip \\',
      '  -fault_type stuck',
    ].join('\n')
    const repoRoot = path.join('workspace', 'demo_verification')
    const workPath = path.join(repoRoot, 'stage_a', 'atpg', 'lander_dir')

    expect(resolveLanderParameterSourcePaths(content, repoRoot, 'stage_a')).toEqual({
      workPath,
      tcFile: path.join(
        workPath,
        '01.plan',
        'release',
        'DFT',
        'v2',
        'crg',
        'STUCK_AT_GROUP_TC.chip.stuck.cfg.tc.xlsx',
      ),
    })
  })

  it('resolves the MBIST onlychk TC source', () => {
    const content = [
      'define_project_info -mode mbist -stage POST -version r1',
      'define_mbist_info -mode top',
      'define_incomming_info -tc_plans onlychk',
    ].join('\n')
    const repoRoot = path.join('workspace', 'demo_verification')
    const workPath = path.join(repoRoot, 'stage_b', 'mbist', 'lander_dir')

    expect(resolveLanderParameterSourcePaths(content, repoRoot, 'stage_b')).toEqual({
      workPath,
      tcFile: path.join(
        workPath,
        '96.wgl_check',
        'POST',
        'r1',
        'mbist',
        'MERGE_MBIST_TOP_TC_PLAN.json',
      ),
    })
  })
})
