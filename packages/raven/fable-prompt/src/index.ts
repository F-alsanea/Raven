/**
 * Raven's literal Claude Fable 5.1 system-prompt compatibility layer.
 *
 * The vendored prompt is registered as one complete system-prompt section.
 * Raven intentionally does not rewrite, normalize, trim, or append to the
 * system prompt text.
 *
 * @module @deepseek-ai/dsh-raven-fable-prompt
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-llm'
import { transformAntmlStream } from './antml.ts'

export { transformAntmlStream } from './antml.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'raven-fable-prompt'

/** The prompt registry this plugin contributes to. */
export const inject = ['systemPrompt']

const promptUrl = new URL('../prompt/claude-fable-5.1.md', import.meta.url)
const promptText = readFileSync(promptUrl, 'utf8')

/**
 * Register the vendored Fable 5.1 text as Raven's complete system prompt.
 *
 * Tool schemas and runtime context remain assembled by the Harness. Only the
 * system-role text is replaced, so policy enforcement and tool execution stay
 * owned by their existing plugins.
 *
 * @param ctx - Cordis context carrying the system-prompt registry.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'raven:fable-5.1',
    order: 0,
    text: promptText,
    complete: true,
  }), 'raven-fable-prompt.section()')
  ctx.on('llm/stream', (options, next) =>
    options.purpose === undefined ? transformAntmlStream(next()) : next())
}
