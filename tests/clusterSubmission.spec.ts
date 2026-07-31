import { describe, expect, it } from 'vitest'

import {
  applyDsubCommandOverrides,
  buildCustomDsubCommand,
  normalizeDsubCommand,
  tokenizeShellWords,
} from '../src/shared/clusterSubmission'
import { parseCshAliasOutput } from '../src/services/dsubAliasService'

describe('cluster submission commands', () => {
  it('adds interactive mode and preserves quoted resources and extra arguments', () => {
    const normalized = normalizeDsubCommand(
      `dsub -A root.ug_dft.team -q normal -R "mem=20000;cpu=1" -FR 'Design-Compiler'`,
    )

    expect(normalized.originallyInteractive).toBe(false)
    expect(tokenizeShellWords(normalized.command)).toEqual([
      'dsub',
      '-I',
      '-A',
      'root.ug_dft.team',
      '-q',
      'normal',
      '-R',
      'mem=20000;cpu=1',
      '-FR',
      'Design-Compiler',
    ])
  })

  it('does not duplicate an existing interactive flag', () => {
    const normalized = normalizeDsubCommand('dsub -A root.ug_dft.team -I -q bigmem')

    expect(normalized.originallyInteractive).toBe(true)
    expect(tokenizeShellWords(normalized.command).filter((word) => word === '-I')).toHaveLength(1)
  })

  it('builds a complete custom dsub command', () => {
    const resolved = buildCustomDsubCommand({
      mode: 'custom',
      group: 'root.ug_dft.team',
      queue: 'normal',
      cpu: '1',
      memory: '20000',
      extraArgs: `-FR 'Design-Compiler'`,
    })

    expect(tokenizeShellWords(resolved.command)).toEqual([
      'dsub',
      '-I',
      '-A',
      'root.ug_dft.team',
      '-q',
      'normal',
      '-R',
      'mem=20000;cpu=1',
      '-FR',
      'Design-Compiler',
    ])
  })

  it('applies Verification row Donau fields over the Flow command', () => {
    const resolved = applyDsubCommandOverrides(
      `dsub -I -A root.ug_dft.default -q normal -R 'mem=20000;cpu=1' -FR 'Design-Compiler'`,
      {
        group: 'root.ug_dft.scenario',
        queue: 'bigmem',
        cpu: '8',
      },
    )

    expect(resolved.overridden).toBe(true)
    expect(resolved.group).toBe('root.ug_dft.scenario')
    expect(tokenizeShellWords(resolved.command)).toEqual([
      'dsub',
      '-I',
      '-A',
      'root.ug_dft.scenario',
      '-q',
      'bigmem',
      '-R',
      'mem=20000;cpu=8',
      '-FR',
      'Design-Compiler',
    ])
  })
})

describe('csh Alias discovery', () => {
  it('only exposes aliases with an independent dsub token', () => {
    const aliases = parseCshAliasOutput([
      `dsbm\tdsub -A root.ug_dft.team -I -q bigmem -R "cpu=4;mem=500000"`,
      `dsbver\tdsub -A root.ug_dft.team -q normal`,
      `showhelp\techo how to use dsub`,
      `ll\tls -al`,
    ].join('\n'))

    expect(aliases.map((alias) => alias.name)).toEqual(['dsbm', 'dsbver'])
    expect(aliases.find((alias) => alias.name === 'dsbver')?.command).toContain('dsub -I')
  })

  it('rejects aliases containing shell control operators', () => {
    const aliases = parseCshAliasOutput(
      `unsafe\tdsub -I -A root.ug_dft.team ; echo injected`,
    )

    expect(aliases).toEqual([])
  })
})
