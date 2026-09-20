import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as RavenFable from '@deepseek-ai/dsh-system-prompt/raven-fable'

describe('Raven Fable system prompt', () => {
  it('is the sole rendered prompt while mounted and restores contributors on disposal', async () => {
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

      const fiber = await ctx.plugin(RavenFable)
      const assembly = await ctx.systemPrompt.assemble()

      expect(assembly.sections).toEqual([
        { name: RavenFable.RAVEN_FABLE_SECTION, text: RavenFable.RAVEN_FABLE_PROMPT },
      ])
      expect(renderPrompt(assembly)).toBe(RavenFable.RAVEN_FABLE_PROMPT)
      expect(assembly.contexts).toEqual([])
      expect(contextCalls).toBe(0)
      expect(assembly.tools.map(tool => tool.name)).toEqual(['echo'])
      expect(RavenFable.RAVEN_FABLE_SOURCE_BLOB_SHA).toBe('a2c71e80faf50bcdab30dd60ff04c4799e7d9538')

      await fiber.dispose()
      const restored = await ctx.systemPrompt.assemble()
      expect(restored.sections.some(section => section.name === RavenFable.RAVEN_FABLE_SECTION)).toBe(false)
      expect(restored.contexts).toHaveLength(1)
      expect(contextCalls).toBe(1)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps the third-party prompt identity byte content unmodified', () => {
    expect(RavenFable.RAVEN_FABLE_PROMPT.startsWith('Claude should never use `<antml:voice_note>` blocks')).toBe(true)
    expect(RavenFable.RAVEN_FABLE_PROMPT).toContain('# claude_behavior')
    expect(RavenFable.RAVEN_FABLE_PROMPT).toContain('Claude Fable 5.1')
    expect(RavenFable.RAVEN_FABLE_PROMPT.endsWith('\n')).toBe(true)
  })
})
