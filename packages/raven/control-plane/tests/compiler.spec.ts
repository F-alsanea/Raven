import { describe, expect, it } from 'vitest'
import { compileCommand } from '../src/compiler.ts'


describe('compileCommand', () => {
  it('preserves mixed Arabic/English repository constraints', () => {
    const contract = compileCommand(
      'افتح chaarsa، اقرأ AGENTS.md، تأكد من الفرع، أصلح المشكلة واختبرها، لا تغير main ولا تسوي migrate، سو commit بس لا push ولا deploy.',
    )

    expect(contract.language).toBe('mixed')
    expect(contract.requirements).toContain('read project instructions')
    expect(contract.requirements).toContain('verify repository branch')
    expect(contract.requirements).toContain('run relevant tests')
    expect(contract.forbidden).toEqual(expect.arrayContaining(['checkout main', 'migrate', 'push', 'deploy']))
    expect(contract.permissions.commit).toBe(true)
    expect(contract.permissions.push).toBe(false)
    expect(contract.permissions.deploy).toBe(false)
    expect(contract.permissions.migrate).toBe(false)
    expect(contract.completion).toEqual(expect.arrayContaining(['tests passed', 'requested commit created']))
  })

  it('defaults dangerous actions to denied unless explicitly requested', () => {
    const contract = compileCommand('Fix the authentication bug and run tests.')
    expect(contract.permissions.commit).toBe(false)
    expect(contract.permissions.push).toBe(false)
    expect(contract.permissions.deploy).toBe(false)
    expect(contract.permissions.migrate).toBe(false)
  })

  it('rejects empty commands', () => {
    expect(() => compileCommand('   ')).toThrow('must not be empty')
  })
})
