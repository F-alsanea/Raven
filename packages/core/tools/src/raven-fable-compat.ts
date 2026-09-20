/**
 * Tool-name and argument adapters for Fable 5.1 instructions that have close
 * Raven equivalents.
 *
 * @module @deepseek-ai/dsh-tools/raven-fable-compat
 */

import type { Context } from '@deepseek-ai/cordis'
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

function translatedRunContext(
  exec: ToolRunContext,
  target: string,
  translated: unknown,
): ToolRunContext {
  return { ...exec, name: target, arguments: translated }
}

function adapterDefinition(ctx: Context, spec: AdapterSpec): ToolDefinition {
  const target = ctx.tools.get(spec.target)
  if (target === undefined) {
    throw new Error(
      `Fable compatibility tool ${JSON.stringify(spec.alias)} requires registered Raven tool ${JSON.stringify(spec.target)}`,
    )
  }

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
      return target.execute(translated, translatedRunContext(exec, spec.target, translated))
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
    ...(target.timeoutMs === undefined ? {} : { timeoutMs: target.timeoutMs }),
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
 * Register Fable tool names only where Raven has a meaningful equivalent.
 *
 * Claude-only plugin catalogs, Google Drive APIs, UI cards, and other services
 * are intentionally not fabricated. Missing required Raven targets fail at
 * activation instead of leaving a partially working compatibility layer.
 *
 * @param ctx - Cordis context carrying Raven's tool registry.
 */
export function apply(ctx: Context): void {
  for (const spec of ADAPTERS) {
    ctx.effect(
      () => ctx.tools.register(adapterDefinition(ctx, spec)),
      `raven-fable-tool-compat.${spec.alias}()`,
    )
  }
}
