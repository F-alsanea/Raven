import type { RavenTaskContract } from '@deepseek-ai/dsh-raven-control-plane'

/** High-risk operation understood by Raven's deterministic runtime policy. */
export type RavenRuntimeAction = 'commit' | 'push' | 'deploy' | 'migrate' | 'checkout main'

function serializedCall(name: string, args: unknown): string {
  let serialized = ''
  try {
    serialized = JSON.stringify(args) ?? ''
  } catch {
    serialized = String(args)
  }
  return `${name} ${serialized}`.toLowerCase()
}

/** Classify one tool call by observable tool name and arguments. */
export function classifyRuntimeAction(name: string, args: unknown): RavenRuntimeAction | undefined {
  const call = serializedCall(name, args)

  if (/\bgit\s+(?:checkout|switch)\s+main\b/.test(call)
    || /(?:checkout|switch)[^\n]{0,30}\bmain\b/.test(call)) {
    return 'checkout main'
  }
  if (/\bgit\s+push\b/.test(call) || /\bpush\b/.test(name.toLowerCase())) return 'push'
  if (/\bgit\s+commit\b/.test(call) || /\bcommit\b/.test(name.toLowerCase())) return 'commit'
  if (/\b(?:prisma\s+)?migrate\b/.test(call) || /\bmigration\b/.test(call)) return 'migrate'
  if (/\b(?:wrangler\s+deploy|vercel\s+--prod|npm\s+run\s+deploy|pnpm\s+(?:run\s+)?deploy|deploy)\b/.test(call)) return 'deploy'
  return undefined
}

/** Decide whether the compiled task contract permits one classified action. */
export function actionAllowed(contract: RavenTaskContract, action: RavenRuntimeAction): boolean {
  if (action === 'checkout main') return !contract.forbidden.includes('checkout main')
  return contract.permissions[action]
}

/** Infer verification evidence from one successful tool call. */
export function successfulEvidenceName(name: string, args: unknown): string | undefined {
  const call = serializedCall(name, args)
  if (/\b(?:typecheck|type-check|tsc\b)/.test(call)) return 'typecheck'
  if (/\b(?:test|vitest|jest|pytest|playwright)\b/.test(call)) return 'tests'
  if (/\b(?:build|next\s+build|vite\s+build|tsc\s+-b)\b/.test(call)) return 'build'
  const action = classifyRuntimeAction(name, args)
  if (action === 'commit') return 'git commit'
  return undefined
}
