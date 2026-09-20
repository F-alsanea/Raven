import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import {
  apply,
  RAVEN_FABLE_PROMPT,
  RAVEN_FABLE_SECTION,
  RAVEN_FABLE_SOURCE_BLOB_SHA,
} from '@deepseek-ai/dsh-system-prompt/raven-fable'

describe('Raven Fable system prompt', () => {
  it('is the sole rendered prompt while preserving tool schemas', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt, { personaPrefix: 'Raven text that must be suppressed.' })
      let contextCalls = 0
      ctx.systemPrompt.context({
        name: 'runtime',
        order: 0,
        text: () => `runtime ${++contextCalls}`,
      })
      ctx.systemPrompt.section({ name: 'extra', order: 100, text: 'extra text' })
      ctx.systemPrompt.tools(() => ({
        schemas: [{ name: 'echo', description: 'echo', parameters: {} }],
      }))

      apply(ctx)
      const assembly = await ctx.systemPrompt.assemble()

      expect(assembly.sections).toEqual([
        { name: RAVEN_FABLE_SECTION, text: RAVEN_FABLE_PROMPT },
      ])
      expect(renderPrompt(assembly)).toBe(RAVEN_FABLE_PROMPT)
      expect(assembly.contexts).toEqual([])
      expect(contextCalls).toBe(0)
      expect(assembly.tools.map(tool => tool.name)).toEqual(['echo'])
      expect(RAVEN_FABLE_SOURCE_BLOB_SHA).toBe('a2c71e80faf50bcdab30dd60ff04c4799e7d9538')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps the third-party prompt identity byte content unmodified', () => {
    expect(RAVEN_FABLE_PROMPT.startsWith('Claude should never use `<antml:voice_note>` blocks')).toBe(true)
    expect(RAVEN_FABLE_PROMPT).toContain('# claude_behavior')
    expect(RAVEN_FABLE_PROMPT).toContain('Claude Fable 5.1')
    expect(RAVEN_FABLE_PROMPT.endsWith('\n')).toBe(true)
  })
})
