import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import LlmRuntime, { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import * as FablePrompt from '@deepseek-ai/dsh-raven-fable-prompt'

const UPSTREAM_BLOB_SHA = 'a2c71e80faf50bcdab30dd60ff04c4799e7d9538'
const PROMPT_URL = new URL('../prompt/claude-fable-5.1.md', import.meta.url)

function gitBlobSha(content: Buffer): string {
  return createHash('sha1')
    .update(`blob ${content.byteLength}\0`)
    .update(content)
    .digest('hex')
}

describe('Raven Fable 5.1 prompt', () => {
  it('keeps the vendored prompt byte-identical to the pinned upstream Git blob', () => {
    const bytes = readFileSync(PROMPT_URL)
    expect(gitBlobSha(bytes)).toBe(UPSTREAM_BLOB_SHA)
  })

  it('renders only the literal prompt while preserving tool schemas', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt, { personaPrefix: 'This text must be replaced.' })
      ctx.systemPrompt.tools(() => ({
        schemas: [{ name: 'web_search', description: 'Search the web.', parameters: {} }],
      }))
      const fiber = await ctx.plugin(FablePrompt)

      const prompt = readFileSync(PROMPT_URL, 'utf8')
      const assembly = await ctx.systemPrompt.assemble()

      expect(renderPrompt(assembly)).toBe(prompt)
      expect(assembly.sections).toEqual([{ name: 'raven:fable-5.1', text: prompt }])
      expect(assembly.tools.map(tool => tool.name)).toEqual(['web_search'])

      await fiber.dispose()
      expect(renderPrompt(await ctx.systemPrompt.assemble()))
        .toContain('This text must be replaced.')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('translates ordinary LLM responses while leaving auxiliary calls untouched', async () => {
    const antml = '<antml:function_calls><antml:invoke name="web_search_fast"><antml:parameter name="query">Raven</antml:parameter></antml:invoke></antml:function_calls>'
    const script: StreamChunk[] = [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: antml },
      { type: 'block-end', index: 0, block: { type: 'text', text: antml } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
    class Adapter extends LlmAdapter {
      override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
        yield* script
      }
    }

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(FablePrompt)
      ctx.llm.registerAdapter(['fixture'], new Adapter())

      const ordinary: StreamChunk[] = []
      for await (const chunk of ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] })) {
        ordinary.push(chunk)
      }
      expect(ordinary).toContainEqual(expect.objectContaining({
        type: 'block-end',
        block: expect.objectContaining({ type: 'tool-call', name: 'web_search' }),
      }))
      expect(ordinary.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })

      const auxiliary: StreamChunk[] = []
      for await (const chunk of ctx.llm.stream({
        provider: 'fixture',
        model: 'm',
        messages: [],
        purpose: 'session-title',
      })) auxiliary.push(chunk)
      expect(auxiliary).toEqual(script)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
