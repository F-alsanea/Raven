/** Language detected from the user's command. */
export type RavenLanguage = 'ar' | 'en' | 'mixed'

/** Actions Raven may perform while satisfying a task. */
export interface RavenPermissions {
  read: boolean
  edit: boolean
  test: boolean
  commit: boolean
  push: boolean
  deploy: boolean
  migrate: boolean
}

/** One conditional instruction extracted from the command. */
export interface RavenConditionalRule {
  condition: string
  action: string
}

/** Immutable task contract compiled from the user's natural-language command. */
export interface RavenTaskContract {
  sourceText: string
  language: RavenLanguage
  goal: string
  requirements: string[]
  forbidden: string[]
  conditional: RavenConditionalRule[]
  permissions: RavenPermissions
  completion: string[]
}

/** Observable evidence gathered while executing a task. */
export interface RavenEvidence {
  kind: 'test' | 'typecheck' | 'build' | 'constraint' | 'action' | 'blocker'
  name: string
  status: 'passed' | 'failed' | 'observed'
  detail?: string
}

/** Result returned by Raven's completion gate. */
export interface RavenVerificationResult {
  passed: boolean
  missing: string[]
  failures: string[]
  blockers: string[]
}
