import { describe, expect, it } from 'vitest'
import { compileCommand } from '@deepseek-ai/dsh-raven-control-plane'
import { actionAllowed, classifyRuntimeAction, successfulEvidenceName } from '../src/policy.ts'


describe('Raven runtime policy', () => {
  it('classifies high-risk shell actions', () => {
    expect(classifyRuntimeAction('bash', { command: 'git push origin feature' })).toBe('push')
    expect(classifyRuntimeAction('bash', { command: 'git checkout main' })).toBe('checkout main')
    expect(classifyRuntimeAction('bash', { command: 'pnpm prisma migrate deploy' })).toBe('migrate')
    expect(classifyRuntimeAction('bash', { command: 'pnpm run deploy' })).toBe('deploy')
    expect(classifyRuntimeAction('bash', { command: 'git commit -m "fix"' })).toBe('commit')
  })

  it('enforces the current compiled task permissions', () => {
    const denied = compileCommand('Fix it. Do not push, deploy, migrate, or checkout main.')
    expect(actionAllowed(denied, 'push')).toBe(false)
    expect(actionAllowed(denied, 'deploy')).toBe(false)
    expect(actionAllowed(denied, 'migrate')).toBe(false)
    expect(actionAllowed(denied, 'checkout main')).toBe(false)

    const allowed = compileCommand('Fix it, then commit and push.')
    expect(actionAllowed(allowed, 'commit')).toBe(true)
    expect(actionAllowed(allowed, 'push')).toBe(true)
  })

  it('derives verification evidence from successful engineering commands', () => {
    expect(successfulEvidenceName('bash', { command: 'pnpm test' })).toBe('tests')
    expect(successfulEvidenceName('bash', { command: 'pnpm run typecheck' })).toBe('typecheck')
    expect(successfulEvidenceName('bash', { command: 'pnpm run build' })).toBe('build')
    expect(successfulEvidenceName('bash', { command: 'git commit -m "fix"' })).toBe('git commit')
  })
})
