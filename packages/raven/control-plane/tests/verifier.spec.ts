import { describe, expect, it } from 'vitest'
import { compileCommand } from '../src/compiler.ts'
import { findConstraintViolations, verifyCompletion } from '../src/verifier.ts'


describe('verifyCompletion', () => {
  it('does not pass without requested evidence', () => {
    const contract = compileCommand('Fix it, run tests and typecheck, then commit. Do not push.')
    const result = verifyCompletion(contract, [
      { kind: 'test', name: 'tests', status: 'passed' },
    ])

    expect(result.passed).toBe(false)
    expect(result.missing).toEqual(expect.arrayContaining(['typecheck passed', 'requested commit created']))
  })

  it('passes only when all completion evidence is present', () => {
    const contract = compileCommand('Fix it, run tests and typecheck, then commit. Do not push.')
    const result = verifyCompletion(contract, [
      { kind: 'test', name: 'tests', status: 'passed' },
      { kind: 'typecheck', name: 'typecheck', status: 'passed' },
      { kind: 'action', name: 'git commit', status: 'passed' },
    ])

    expect(result).toEqual({ passed: true, missing: [], failures: [], blockers: [] })
  })

  it('uses the latest evidence after a failed check is repaired', () => {
    const contract = compileCommand('Fix it and run tests.')
    const result = verifyCompletion(contract, [
      { kind: 'test', name: 'tests', status: 'failed', detail: '1 failed' },
      { kind: 'test', name: 'tests', status: 'passed' },
    ])

    expect(result).toEqual({ passed: true, missing: [], failures: [], blockers: [] })
  })

  it('reports forbidden actions observed during execution', () => {
    const contract = compileCommand('Fix it. Do not push or deploy and do not checkout main.')
    const violations = findConstraintViolations(contract, [
      { kind: 'action', name: 'git push origin feature', status: 'observed' },
      { kind: 'action', name: 'git checkout main', status: 'observed' },
    ])

    expect(violations).toEqual(expect.arrayContaining(['push', 'checkout main']))
  })
})
