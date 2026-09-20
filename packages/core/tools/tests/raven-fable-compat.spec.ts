import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { apply } from '@deepseek-ai/dsh-tools/raven-fable-compat'

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
  it('translates the Fable argument shapes into Raven tools', async () => {
    const ctx = new Context()
    const calls: Array<{ name: string; args: unknown }> = []
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime, {})
      ctx.tools.register(fixture('web_search', calls))
      ctx.tools.register(fixture('present', calls))
      ctx.tools.register(fixture('session_search', calls))

      apply(ctx)

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
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('fails activation when a required Raven target is absent', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime, {})
      expect(() => apply(ctx)).toThrow(
        'Fable compatibility tool "web_search_fast" requires registered Raven tool "web_search"',
      )
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
