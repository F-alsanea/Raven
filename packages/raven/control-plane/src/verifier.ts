import type { RavenEvidence, RavenTaskContract, RavenVerificationResult } from './types.ts'

function latestEvidence(evidence: RavenEvidence[]): RavenEvidence[] {
  const latest = new Map<string, RavenEvidence>()
  for (const item of evidence) {
    const key = `${item.kind}:${item.name.toLowerCase()}`
    latest.set(key, item)
  }
  return [...latest.values()]
}

function evidencePassed(evidence: RavenEvidence[], name: string): boolean {
  const normalized = name.toLowerCase().replace(' passed', '')
  return latestEvidence(evidence).some(item => (
    item.status === 'passed' && item.name.toLowerCase().includes(normalized)
  ))
}

/** Verify that Raven has observable evidence before declaring a task complete. */
export function verifyCompletion(contract: RavenTaskContract, evidence: RavenEvidence[]): RavenVerificationResult {
  const current = latestEvidence(evidence)
  const failures = current
    .filter(item => item.status === 'failed')
    .map(item => `${item.name}${item.detail ? `: ${item.detail}` : ''}`)

  const blockers = current
    .filter(item => item.kind === 'blocker')
    .map(item => `${item.name}${item.detail ? `: ${item.detail}` : ''}`)

  const missing = contract.completion.filter(requirement => {
    if (requirement === 'tests passed') return !evidencePassed(current, 'tests')
    if (requirement === 'typecheck passed') return !evidencePassed(current, 'typecheck')
    if (requirement === 'build passed') return !evidencePassed(current, 'build')
    if (requirement === 'requested commit created') {
      return !current.some(item => item.kind === 'action' && item.status === 'passed' && /commit/i.test(item.name))
    }
    return !evidencePassed(current, requirement)
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
