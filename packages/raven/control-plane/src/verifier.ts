import type { RavenEvidence, RavenTaskContract, RavenVerificationResult } from './types.ts'

function evidencePassed(evidence: RavenEvidence[], name: string): boolean {
  const normalized = name.toLowerCase()
  return evidence.some(item => item.status === 'passed' && item.name.toLowerCase().includes(normalized.replace(' passed', '')))
}

/** Verify that Raven has observable evidence before declaring a task complete. */
export function verifyCompletion(contract: RavenTaskContract, evidence: RavenEvidence[]): RavenVerificationResult {
  const failures = evidence
    .filter(item => item.status === 'failed')
    .map(item => `${item.name}${item.detail ? `: ${item.detail}` : ''}`)

  const blockers = evidence
    .filter(item => item.kind === 'blocker')
    .map(item => `${item.name}${item.detail ? `: ${item.detail}` : ''}`)

  const missing = contract.completion.filter(requirement => {
    if (requirement === 'tests passed') return !evidencePassed(evidence, 'test')
    if (requirement === 'typecheck passed') return !evidencePassed(evidence, 'typecheck')
    if (requirement === 'build passed') return !evidencePassed(evidence, 'build')
    if (requirement === 'requested commit created') {
      return !evidence.some(item => item.kind === 'action' && item.status === 'passed' && /commit/i.test(item.name))
    }
    return !evidencePassed(evidence, requirement)
  })

  return {
    passed: failures.length === 0 && blockers.length === 0 && missing.length === 0,
    missing,
    failures,
    blockers,
  }
}

/** Return forbidden actions observed in the execution evidence. */
export function findConstraintViolations(contract: RavenTaskContract, evidence: RavenEvidence[]): string[] {
  return contract.forbidden.filter(rule => evidence.some(item => {
    if (item.kind !== 'action' || item.status !== 'observed') return false
    const action = item.name.toLowerCase()
    if (rule === 'checkout main') return /checkout.*main|switch.*main/.test(action)
    return action.includes(rule.toLowerCase())
  }))
}
