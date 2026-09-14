/** Raven control-plane primitives for task compilation and evidence-gated completion. */
export { compileCommand, detectLanguage } from './compiler.ts'
export { findConstraintViolations, verifyCompletion } from './verifier.ts'
export type {
  RavenConditionalRule,
  RavenEvidence,
  RavenLanguage,
  RavenPermissions,
  RavenTaskContract,
  RavenVerificationResult,
} from './types.ts'
