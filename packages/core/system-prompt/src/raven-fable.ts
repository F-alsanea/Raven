/**
 * Raven's verbatim Claude Fable 5.1 compatibility system prompt.
 *
 * The prompt text is vendored as an immutable asset; this plugin only mounts it
 * through the existing complete-prompt extension point.
 *
 * @module @deepseek-ai/dsh-system-prompt/raven-fable
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'

/** Source Git blob copied byte-for-byte into Raven. */
export const RAVEN_FABLE_SOURCE_BLOB_SHA = 'a2c71e80faf50bcdab30dd60ff04c4799e7d9538'

/** Stable system-prompt section name used by Raven's Fable compatibility layer. */
export const RAVEN_FABLE_SECTION = 'raven:fable-5.1'

/** The exact vendored Fable 5.1 prompt text. */
export const RAVEN_FABLE_PROMPT = readFileSync(
  new URL('../prompts/claude-fable-5.1.md', import.meta.url),
  'utf8',
)

/** Cordis plugin name. */
export const name = 'raven-fable-system-prompt'

/** Services required by the compatibility prompt. */
export const inject = ['systemPrompt']

/**
 * Make the vendored Fable text the entire system prompt for this composition.
 *
 * Dynamic runtime-context snapshots are suppressed so no Raven-authored text is
 * appended beside the verbatim system prompt. Tool schemas remain assembled and
 * enforced normally by the harness.
 *
 * @param ctx - Cordis context carrying the system-prompt registry.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: RAVEN_FABLE_SECTION,
    order: 0,
    text: RAVEN_FABLE_PROMPT,
    complete: true,
  }), 'raven-fable-system-prompt.section()')

  ctx.systemPrompt.suppressRuntimeContext()
}
