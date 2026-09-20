/**
 * Translate Fable's textual ANTML function-call protocol into Harness tool-call chunks.
 *
 * The vendored system prompt remains byte-identical. This adapter operates only on
 * successful model output after generation and never edits the prompt text.
 *
 * @module @deepseek-ai/dsh-raven-fable-prompt/antml
 */

import {
  ToolCallId,
  type ContentBlock,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

interface AntmlCall {
  name: string
  arguments: Record<string, unknown>
}

type TextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'calls'; calls: AntmlCall[] }

const FUNCTION_OPEN = '<antml:function_calls>'
const FUNCTION_CLOSE = '</antml:function_calls>'
const INVOKE = /<antml:invoke\s+name="([^"]+)">([\s\S]*?)<\/antml:invoke>/g
const PARAMETER = /<antml:parameter\s+name="([^"]+)">([\s\S]*?)<\/antml:parameter>/g

function parseScalar(raw: string): unknown {
  const jsonCandidate = raw.trim()
  if (jsonCandidate.length === 0) return raw
  try {
    return JSON.parse(jsonCandidate) as unknown
  } catch {
    return raw
  }
}

function parseInvokeBody(body: string): Record<string, unknown> | undefined {
  const parameters: Record<string, unknown> = {}
  let cursor = 0
  PARAMETER.lastIndex = 0
  for (const match of body.matchAll(PARAMETER)) {
    const full = match[0]
    const name = match[1]!
    const value = match[2]!
    const index = match.index
    if (body.slice(cursor, index).trim().length > 0) return undefined
    if (Object.hasOwn(parameters, name)) return undefined
    parameters[name] = parseScalar(value)
    cursor = index + full.length
  }
  if (body.slice(cursor).trim().length > 0) return undefined
  return parameters
}

function parseFunctionBody(body: string): AntmlCall[] | undefined {
  const calls: AntmlCall[] = []
  let cursor = 0
  INVOKE.lastIndex = 0
  for (const match of body.matchAll(INVOKE)) {
    const full = match[0]
    const name = match[1]!
    const invokeBody = match[2]!
    const index = match.index
    if (body.slice(cursor, index).trim().length > 0) return undefined
    const parameters = parseInvokeBody(invokeBody)
    if (parameters === undefined) return undefined
    calls.push({ name, arguments: parameters })
    cursor = index + full.length
  }
  if (calls.length === 0 || body.slice(cursor).trim().length > 0) return undefined
  return calls
}

function parseText(text: string): TextSegment[] | undefined {
  const segments: TextSegment[] = []
  let cursor = 0
  let transformed = false
  while (cursor < text.length) {
    const open = text.indexOf(FUNCTION_OPEN, cursor)
    if (open === -1) {
      const tail = text.slice(cursor)
      segments.push({ kind: 'text', text: tail })
      break
    }
    const before = text.slice(cursor, open)
    if (before.length > 0) segments.push({ kind: 'text', text: before })
    const contentStart = open + FUNCTION_OPEN.length
    const close = text.indexOf(FUNCTION_CLOSE, contentStart)
    if (close === -1) return undefined
    const calls = parseFunctionBody(text.slice(contentStart, close))
    if (calls === undefined) return undefined
    segments.push({ kind: 'calls', calls })
    transformed = true
    cursor = close + FUNCTION_CLOSE.length
  }
  if (!transformed) return undefined
  return segments
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizeSearch(call: AntmlCall): AntmlCall {
  const query = asString(call.arguments.query)
  if (query === undefined) return call
  return { name: 'web_search', arguments: { queries: [query] } }
}

function normalizeWebFetch(call: AntmlCall): AntmlCall {
  const url = asString(call.arguments.url)
  if (url === undefined) return call
  const unsupported = Object.entries(call.arguments)
    .some(([key, value]) => key !== 'url' && value !== null && value !== undefined)
  return unsupported ? call : { name: 'web_fetch', arguments: { url } }
}

function normalizeBash(call: AntmlCall): AntmlCall {
  const command = asString(call.arguments.command)
  const description = asString(call.arguments.description)
  if (command === undefined || description === undefined) return call
  return { name: 'bash', arguments: { command, description } }
}

function normalizeStrReplace(call: AntmlCall): AntmlCall {
  const path = asString(call.arguments.path)
  const description = asString(call.arguments.description)
  const oldString = asString(call.arguments.old_str)
  const newString = call.arguments.new_str === undefined ? '' : asString(call.arguments.new_str)
  if (path === undefined || description === undefined || oldString === undefined || newString === undefined) return call
  return {
    name: 'edit',
    arguments: {
      file_path: path,
      old_string: oldString,
      new_string: newString,
    },
  }
}

function normalizePresentFiles(call: AntmlCall): AntmlCall {
  const paths = call.arguments.filepaths
  if (!Array.isArray(paths) || paths.length === 0
    || !paths.every((path): path is string => typeof path === 'string')) return call
  return {
    name: 'present',
    arguments: {
      files: paths.map(path => ({ path })),
    },
  }
}

function normalizeRangedView(call: AntmlCall): AntmlCall {
  const path = asString(call.arguments.path)
  const description = asString(call.arguments.description)
  const range = call.arguments.view_range
  if (path === undefined || description === undefined || !Array.isArray(range) || range.length !== 2) return call
  const [start, end] = range
  if (typeof start !== 'number' || typeof end !== 'number'
    || !Number.isInteger(start) || !Number.isInteger(end)
    || start < 1 || end < start) return call
  return {
    name: 'read',
    arguments: {
      file_path: path,
      offset: start,
      limit: end - start + 1,
    },
  }
}

function normalizeAsk(call: AntmlCall): AntmlCall {
  const rawQuestions = call.arguments.questions
  if (!Array.isArray(rawQuestions)) return call
  const questions: Record<string, unknown>[] = []
  for (const [index, value] of rawQuestions.entries()) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return call
    const question = value as Record<string, unknown>
    const text = asString(question.question)
    const type = asString(question.type) ?? 'single_select'
    if (text === undefined || type === 'rank_priorities'
      || (type !== 'single_select' && type !== 'multi_select')) return call
    const output: Record<string, unknown> = {
      id: `fable-q${index + 1}`,
      question: text,
    }
    if (Array.isArray(question.options)) {
      if (!question.options.every(option => typeof option === 'string')) return call
      output.options = question.options.map(label => ({ label }))
    }
    if (type === 'multi_select') output.multi_select = true
    questions.push(output)
  }
  if (questions.length === 0) return call
  return { name: 'ask_user_question', arguments: { questions } }
}

/**
 * Map only Fable calls whose Raven equivalent preserves the requested operation.
 *
 * Unsupported proprietary calls retain their original names and therefore fail
 * through the normal unknown-tool path instead of being silently approximated.
 *
 * @param call - parsed ANTML invocation.
 * @returns the Raven-native call when a safe mapping exists.
 */
function normalizeAntmlCall(call: AntmlCall): AntmlCall {
  switch (call.name) {
    case 'bash_tool':
      return normalizeBash(call)
    case 'str_replace':
      return normalizeStrReplace(call)
    case 'present_files':
      return normalizePresentFiles(call)
    case 'view':
      return normalizeRangedView(call)
    case 'web_search':
    case 'web_search_fast':
      return normalizeSearch(call)
    case 'web_fetch':
      return normalizeWebFetch(call)
    case 'ask_user_input_v0':
      return normalizeAsk(call)
    default:
      return call
  }
}

function transformedBlocks(blocks: readonly ContentBlock[]): ContentBlock[] | undefined {
  const output: ContentBlock[] = []
  let changed = false
  for (const block of blocks) {
    if (block.type !== 'text') {
      output.push(block)
      continue
    }
    const segments = parseText(block.text)
    if (segments === undefined) {
      if (block.text.includes(FUNCTION_OPEN)) return undefined
      output.push(block)
      continue
    }
    changed = true
    for (const segment of segments) {
      if (segment.kind === 'text') {
        output.push({ type: 'text', text: segment.text })
        continue
      }
      for (const parsed of segment.calls) {
        const call = normalizeAntmlCall(parsed)
        output.push({
          type: 'tool-call',
          id: ToolCallId(`antml-${output.length}`),
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        })
      }
    }
  }
  return changed ? output : undefined
}

function emitBlock(block: ContentBlock, index: number): StreamChunk[] {
  const start: StreamChunk = { type: 'block-start', index, blockType: block.type }
  if (block.type === 'text') {
    return [
      start,
      { type: 'text-delta', index, text: block.text },
      { type: 'block-end', index, block },
    ]
  }
  if (block.type === 'reasoning') {
    return [
      start,
      { type: 'reasoning-delta', index, text: block.text },
      { type: 'block-end', index, block },
    ]
  }
  if (block.type === 'tool-call') {
    return [
      start,
      {
        type: 'tool-call-delta',
        index,
        id: block.id,
        name: block.name,
        argumentsDelta: block.arguments,
      },
      { type: 'block-end', index, block },
    ]
  }
  return [start, { type: 'block-end', index, block }]
}

function terminalFinish(chunks: readonly StreamChunk[]): Extract<StreamChunk, { type: 'finish' }> | undefined {
  const finish = chunks.findLast((chunk): chunk is Extract<StreamChunk, { type: 'finish' }> => chunk.type === 'finish')
  return finish
}

/**
 * Buffer one successful model response and translate complete ANTML calls.
 *
 * Responses that already contain native tool calls, terminate abnormally, contain
 * malformed ANTML, or contain no ANTML are replayed byte-for-byte at the chunk
 * object level. A translated response preserves completed non-tool blocks and
 * usage, drops provider replay metadata whose block alignment no longer matches,
 * and terminates with `tool-calls`.
 *
 * @param source - provider stream to inspect.
 * @returns a provider-neutral stream consumable by the Harness agent loop.
 */
export async function* transformAntmlStream(source: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
  const chunks: StreamChunk[] = []
  for await (const chunk of source) chunks.push(chunk)

  const finish = terminalFinish(chunks)
  const hasNativeToolCall = chunks.some(chunk =>
    (chunk.type === 'block-start' && chunk.blockType === 'tool-call')
    || (chunk.type === 'block-end' && chunk.block.type === 'tool-call'))
  if (finish?.reason.kind !== 'stop' || hasNativeToolCall) {
    yield* chunks
    return
  }

  const completedBlocks = chunks
    .filter((chunk): chunk is Extract<StreamChunk, { type: 'block-end' }> => chunk.type === 'block-end')
    .map(chunk => chunk.block)
  const blocks = transformedBlocks(completedBlocks)
  if (blocks === undefined) {
    yield* chunks
    return
  }

  for (const [index, block] of blocks.entries()) {
    yield* emitBlock(block, index)
  }
  for (const chunk of chunks) {
    if (chunk.type === 'usage') yield chunk
  }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
