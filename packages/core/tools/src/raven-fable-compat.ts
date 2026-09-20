/**
 * Tool-name and argument adapters for Fable 5.1 instructions that have close
 * Raven equivalents.
 *
 * @module @deepseek-ai/dsh-tools/raven-fable-compat
 */

import type { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {
  ToolDefinition,
  ToolExecution,
  ToolRunContext,
  ToolResult,
} from './index.ts'

interface AdapterSpec {
  readonly alias: string
  readonly target: string
  readonly description: string
  readonly parameters: ToolDefinition['parameters']
  translate(args: unknown): unknown
}

const ADAPTERS: readonly AdapterSpec[] = [
  {
    alias: 'web_search_fast',
    target: 'web_search',
    description: 'Fable-compatible lightweight-search name backed by Raven web_search.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
    translate(args) {
      const { query } = args as { query: string }
      return { queries: [query] }
    },
  },
  {
    alias: 'present_files',
    target: 'present',
    description: 'Fable-compatible file delivery backed by Raven present.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        filepaths: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
          description: 'Files to present to the user.',
        },
      },
      required: ['filepaths'],
    },
    translate(args) {
      const { filepaths } = args as { filepaths: string[] }
      return { files: filepaths.map(path => ({ path })) }
    },
  },
  {
    alias: 'conversation_search',
    target: 'session_search',
    description: 'Fable-compatible past-conversation search backed by Raven session_search.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Short search query.' },
        max_results: { type: 'integer', minimum: 1, maximum: 10 },
        within_conversation_id: {
          oneOf: [{ type: 'string' }, { type: 'null' }],
        },
      },
      required: ['query'],
    },
    translate(args) {
      const input = args as {
        query: string
        max_results?: number
        within_conversation_id?: string | null
      }
      return {
        query: input.query,
        ...(input.within_conversation_id
          ? { session_ids: [input.within_conversation_id] }
          : {}),
      }
    },
  },
]

/** Cordis plugin name. */
export const name = 'raven-fable-tool-compat'

/** Services required by the compatibility adapters. */
export const inject = ['tools']

function translatedExecution(
  exec: Readonly<ToolExecution>,
  target: string,
  translated: unknown,
): Readonly<ToolExecution> {
  return { ...exec, name: target, arguments: translated }
}

function errorText(result: { content: readonly unknown[]; error?: { message?: string } }): string {
  const rendered = result.content
    .flatMap(block => (
      typeof block === 'object'
      && block !== null
      && 'type' in block
      && block.type === 'text'
      && 'text' in block
      && typeof block.text === 'string'
        ? [block.text]
        : []
    ))
    .join('\n')
  return rendered.length > 0 ? rendered.replace(/^Error:\s*/, '') : result.error?.message ?? 'compatibility target failed'
}

function adapterDefinition(ctx: Context, spec: AdapterSpec, target: ToolDefinition): ToolDefinition {
  const translate = spec.translate
  return {
    name: spec.alias,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: target.output.schema,
      render: (args, value) => target.output.render(translate(args), value),
      ...(target.output.presentationMeta === undefined
        ? {}
        : {
            presentationMeta: (args: unknown, value: JsonValue) =>
              target.output.presentationMeta!(translate(args), value),
          }),
    },
    async execute(args, exec) {
      const translated = translate(args)
      const result = await ctx.tools.execute({
        callId: ToolCallId(`${exec.callId}:raven-fable:${spec.target}`),
        rootCallId: exec.rootCallId,
        name: spec.target,
        arguments: translated,
        agent: exec.agent,
        parent: exec.token,
        signal: exec.signal,
      })
      for (const context of result.additionalContexts ?? []) exec.deferContext(context)
      if (result.isError) throw new Error(errorText(result))
      if (result.concludesTurn) exec.concludeTurn()
      return result.value
    },
    ...(target.finalizeContent === undefined
      ? {}
      : {
          finalizeContent: (exec: Readonly<ToolExecution>, result: Parameters<NonNullable<ToolDefinition['finalizeContent']>>[1]) => {
            const translated = translate(exec.arguments)
            return target.finalizeContent!(
              translatedExecution(exec, spec.target, translated),
              result,
            )
          },
        }),
    ...(target.isConcurrencySafe === undefined
      ? {}
      : { isConcurrencySafe: (args: unknown) => target.isConcurrencySafe!(translate(args)) }),
    ...(target.presentCall === undefined
      ? {}
      : { presentCall: (args: unknown) => target.presentCall!(translate(args)) }),
    ...(target.presentResult === undefined
      ? {}
      : {
          presentResult: (args: unknown, result: ToolResult) =>
            target.presentResult!(translate(args), result),
        }),
  }
}

/**
 * Register each Fable alias whenever its Raven target exists.
 *
 * Tool registration changes are observed for the lifetime of this plugin so
 * profile-scoped targets may appear or disappear without making the base
 * composition fail. Alias execution re-enters the real target through
 * `ctx.tools.execute`, preserving target-specific policy and cancellation.
 *
 * @param ctx - Cordis context carrying Raven's tool registry.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const active = new Map<string, { target: ToolDefinition; dispose: () => void }>()
    let syncing = false

    const sync = () => {
      if (syncing) return
      syncing = true
      try {
        for (const spec of ADAPTERS) {
          const target = ctx.tools.get(spec.target)
          const mounted = active.get(spec.alias)
          if (mounted !== undefined && mounted.target !== target) {
            active.delete(spec.alias)
            mounted.dispose()
          }
          if (target !== undefined && !active.has(spec.alias)) {
            active.set(spec.alias, {
              target,
              dispose: ctx.tools.register(adapterDefinition(ctx, spec, target)),
            })
          }
        }
      } finally {
        syncing = false
      }
    }

    const stop = ctx.on('tools/change', sync)
    sync()
    return () => {
      stop()
      for (const { dispose } of active.values()) dispose()
      active.clear()
    }
  }, 'raven-fable-tool-compat.sync()')
}
