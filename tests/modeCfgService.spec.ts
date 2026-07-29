import { describe, expect, it } from 'vitest'
import { parsePreModeFromModeCfg } from '../src/services/modeCfgService'

describe('parsePreModeFromModeCfg', () => {
  it('parses preMode from a continued define_project_info command', () => {
    const contents = [
      'define_project_info \\',
      '  -name xxx \\',
      '  -mode {preMode} \\',
      '  -owner dft',
    ].join('\n')

    expect(parsePreModeFromModeCfg(contents)).toBe('preMode')
  })

  it('supports CRLF and quoted or unquoted mode values', () => {
    expect(parsePreModeFromModeCfg(
      'define_project_info \\\r\n-name xxx \\\r\n-mode "mbist-top"',
    )).toBe('mbist-top')
    expect(parsePreModeFromModeCfg(
      'define_project_info -name xxx -mode atpg',
    )).toBe('atpg')
  })

  it('does not parse mode options from another command', () => {
    const contents = [
      'set_other_info -mode {wrong}',
      'define_project_info -name xxx',
    ].join('\n')

    expect(parsePreModeFromModeCfg(contents)).toBeUndefined()
  })
})
