import { describe, expect, it } from 'vitest'

import {
  attachResolvedClusterSubmission,
  parseProjectCshrc,
} from '../src/services/dsubAliasService'

describe('project.cshrc aliases', () => {
  it('loads static dsub aliases and ignores unrelated aliases', () => {
    const aliases = parseProjectCshrc(`
      # project aliases
      alias submit_small 'dsub -A dft -q normal' # default project queue
      alias submit_big "dsub -A dft -q bigmem \\
        -R mem=40000"
      alias ll 'ls -la'
    `)

    expect(aliases.map((alias) => alias.name)).toEqual(['submit_big', 'submit_small'])
    expect(aliases[0].command).toContain('dsub -I -A dft -q bigmem')
    expect(aliases[1].command).toBe('dsub -I -A dft -q normal')
  })
})

describe('scoped environment overrides', () => {
  it('applies a Module or Mode override after the default configuration', async () => {
    const resolved = await attachResolvedClusterSubmission(
      {
        step2: {
          step2Task: {
            tools: [{ id: 'default', type: 'version', name: 'dc', version: '1' }],
            cluster: {
              mode: 'custom', group: 'default', queue: 'normal', cpu: '', memory: '', extraArgs: '',
            },
          },
          scopedOverrides: {
            special: {
              tools: [{ id: 'special', type: 'version', name: 'dc', version: '2' }],
              cluster: {
                mode: 'custom', group: 'special', queue: 'bigmem', cpu: '4', memory: '', extraArgs: '',
              },
            },
          },
        },
      },
      null,
      'special',
      'unused-project.cshrc',
    )

    const step2 = resolved.step2 as Record<string, unknown>
    const task = step2.step2Task as Record<string, unknown>
    expect(task.tools).toEqual([{ id: 'special', type: 'version', name: 'dc', version: '2' }])
    expect(task.resolvedDsubCommand).toBe('dsub -I -A special -q bigmem -R cpu=4')
  })
})
