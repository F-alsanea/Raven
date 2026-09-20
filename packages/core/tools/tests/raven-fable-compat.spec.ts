import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import * as FableCompat from '@deepseek-ai/dsh-tools/raven-fable-compat'

const signal = new AbortController().signal

function fixture(name: string, calls: Array<{ name: string; args: unknown }>): ToolDefinition {
  return {
    name,
    description: `fixture ${name}`,
    parameters: { type: 'object' },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    async execute(args) {
      calls.push({ name, args })
      return JSON.stringify(args)
    },
  }
}

describe('Raven Fable tool compatibility', () => {
  it('tracks available targets, translates arguments, and unwinds aliases', async () => {
    const ctx = new Context()
    const calls: Array<{ name: string; args: unknown }> = []
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime, {})
      const fiber = await ctx.plugin(FableCompat)

      expect(ctx.tools.get('web_search_fast')).toBeUndefined()
      expect(ctx.tools.get('present_files')).toBeUndefined()
      expect(ctx.tools.get('conversation_search')).toBeUndefined()

      const disposeSearch = ctx.tools.register(fixture('web_search', calls))
      const disposePresent = ctx.tools.register(fixture('present', calls))
      const disposeSessionSearch = ctx.tools.register(fixture('session_search', calls))

      expect(ctx.tools.schemas().map(tool => tool.name)).toContain('web_search_fast')
      expect(ctx.tools.schemas().map(tool => tool.name)).toContain('present_files')
      expect(ctx.tools.schemas().map(tool => tool.name)).toContain('conversation_search')

      await ctx.tools.execute({
        callId: ToolCallId('fable-search'),
        name: 'web_search_fast',
        arguments: { query: 'Raven' },
        signal,
      })
      await ctx.tools.execute({
        callId: ToolCallId('fable-present'),
        name: 'present_files',
        arguments: { filepaths: ['/tmp/a.txt', '/tmp/b.txt'] },
        signal,
      })
      await ctx.tools.execute({
        callId: ToolCallId('fable-history'),
        name: 'conversation_search',
        arguments: { query: 'project', within_conversation_id: 'session-1', max_results: 3 },
        signal,
      })

      expect(calls).toEqual([
        { name: 'web_search', args: { queries: ['Raven'] } },
        {
          name: 'present',
          args: { files: [{ path: '/tmp/a.txt' }, { path: '/tmp/b.txt' }] },
        },
        {
          name: 'session_search',
          args: { query: 'project', session_ids: ['session-1'] },
        },
      ])

      disposePresent()
      expect(ctx.tools.get('present_files')).toBeUndefined()
      expect(ctx.tools.get('web_search_fast')).toBeDefined()

      await fiber.dispose()
      expect(ctx.tools.get('web_search_fast')).toBeUndefined()
      expect(ctx.tools.get('conversation_search')).toBeUndefined()
      expect(ctx.tools.get('web_search')).toBeDefined()
      expect(ctx.tools.get('session_search')).toBeDefined()

      disposeSearch()
      disposeSessionSearch()
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
