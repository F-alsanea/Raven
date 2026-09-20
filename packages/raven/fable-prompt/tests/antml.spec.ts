import { describe, expect, it } from 'vitest'
import { ToolCallId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { transformAntmlStream } from '@deepseek-ai/dsh-raven-fable-prompt'

async function* source(chunks: readonly StreamChunk[]): AsyncIterable<StreamChunk> {
  yield* chunks
}

async function collect(chunks: readonly StreamChunk[]): Promise<StreamChunk[]> {
  const output: StreamChunk[] = []
  for await (const chunk of transformAntmlStream(source(chunks))) output.push(chunk)
  return output
}

function textResponse(text: string, finish: 'stop' | 'max-tokens' = 'stop'): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: finish } },
  ]
}

function toolBlocks(chunks: readonly StreamChunk[]) {
  return chunks
    .filter((chunk): chunk is Extract<StreamChunk, { type: 'block-end' }> => chunk.type === 'block-end')
    .map(chunk => chunk.block)
    .filter(block => block.type === 'tool-call')
}

describe('Fable ANTML compatibility', () => {
  it('passes ordinary text through without rewriting stream chunks', async () => {
    const input = textResponse('ordinary answer')
    expect(await collect(input)).toEqual(input)
  })

  it('maps web_search_fast ANTML to Raven web_search and preserves surrounding prose', async () => {
    const text = [
      'Checking.\n',
      '<antml:function_calls>',
      '<antml:invoke name="web_search_fast">',
      '<antml:parameter name="query">DeepSeek Harness docs</antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
      '\nDone.',
    ].join('\n')

    const output = await collect(textResponse(text))
    const ended = output.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.block)

    expect(ended).toEqual([
      { type: 'text', text: 'Checking.\n\n' },
      {
        type: 'tool-call',
        id: ToolCallId('antml-1'),
        name: 'web_search',
        arguments: JSON.stringify({ queries: ['DeepSeek Harness docs'] }),
      },
      { type: 'text', text: '\n\nDone.' },
    ])
    expect(output.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('converts multiple invocations and parses JSON-valued parameters', async () => {
    const text = [
      '<antml:function_calls>',
      '<antml:invoke name="web_search">',
      '<antml:parameter name="query">Raven agent</antml:parameter>',
      '</antml:invoke>',
      '<antml:invoke name="custom_tool">',
      '<antml:parameter name="count">2</antml:parameter>',
      '<antml:parameter name="enabled">true</antml:parameter>',
      '<antml:parameter name="items">["a","b"]</antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
    ].join('\n')

    const calls = toolBlocks(await collect(textResponse(text)))
    expect(calls).toEqual([
      {
        type: 'tool-call',
        id: ToolCallId('antml-0'),
        name: 'web_search',
        arguments: JSON.stringify({ queries: ['Raven agent'] }),
      },
      {
        type: 'tool-call',
        id: ToolCallId('antml-1'),
        name: 'custom_tool',
        arguments: JSON.stringify({ count: 2, enabled: true, items: ['a', 'b'] }),
      },
    ])
  })

  it('maps faithful core Fable aliases while leaving create-only writes unsupported', async () => {
    const text = [
      '<antml:function_calls>',
      '<antml:invoke name="bash_tool">',
      '<antml:parameter name="command">pwd</antml:parameter>',
      '<antml:parameter name="description">Show working directory</antml:parameter>',
      '</antml:invoke>',
      '<antml:invoke name="str_replace">',
      '<antml:parameter name="path">src/a.ts</antml:parameter>',
      '<antml:parameter name="description">Rename value</antml:parameter>',
      '<antml:parameter name="old_str">old</antml:parameter>',
      '<antml:parameter name="new_str">new</antml:parameter>',
      '</antml:invoke>',
      '<antml:invoke name="present_files">',
      '<antml:parameter name="filepaths">["report.md","chart.png"]</antml:parameter>',
      '</antml:invoke>',
      '<antml:invoke name="view">',
      '<antml:parameter name="description">Read selected lines</antml:parameter>',
      '<antml:parameter name="path">src/a.ts</antml:parameter>',
      '<antml:parameter name="view_range">[3,7]</antml:parameter>',
      '</antml:invoke>',
      '<antml:invoke name="create_file">',
      '<antml:parameter name="description">Create file</antml:parameter>',
      '<antml:parameter name="path">new.txt</antml:parameter>',
      '<antml:parameter name="file_text">hello</antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
    ].join('\n')

    expect(toolBlocks(await collect(textResponse(text)))).toEqual([
      {
        type: 'tool-call',
        id: ToolCallId('antml-0'),
        name: 'bash',
        arguments: JSON.stringify({ command: 'pwd', description: 'Show working directory' }),
      },
      {
        type: 'tool-call',
        id: ToolCallId('antml-1'),
        name: 'edit',
        arguments: JSON.stringify({
          file_path: 'src/a.ts',
          old_string: 'old',
          new_string: 'new',
        }),
      },
      {
        type: 'tool-call',
        id: ToolCallId('antml-2'),
        name: 'present',
        arguments: JSON.stringify({
          files: [{ path: 'report.md' }, { path: 'chart.png' }],
        }),
      },
      {
        type: 'tool-call',
        id: ToolCallId('antml-3'),
        name: 'read',
        arguments: JSON.stringify({ file_path: 'src/a.ts', offset: 3, limit: 5 }),
      },
      {
        type: 'tool-call',
        id: ToolCallId('antml-4'),
        name: 'create_file',
        arguments: JSON.stringify({
          description: 'Create file',
          path: 'new.txt',
          file_text: 'hello',
        }),
      },
    ])
  })

  it('preserves bare scalar whitespace instead of rewriting file or command content', async () => {
    const text = [
      '<antml:function_calls>',
      '<antml:invoke name="custom_tool">',
      '<antml:parameter name="content">  keep me  </antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
    ].join('\n')
    expect(toolBlocks(await collect(textResponse(text)))[0]).toMatchObject({
      name: 'custom_tool',
      arguments: JSON.stringify({ content: '  keep me  ' }),
    })
  })

  it('maps compatible Fable user questions without approximating rank-priority input', async () => {
    const compatible = [
      '<antml:function_calls>',
      '<antml:invoke name="ask_user_input_v0">',
      '<antml:parameter name="questions">[{"question":"Pick one","options":["A","B"],"type":"single_select"},{"question":"Pick many","options":["X","Y"],"type":"multi_select"}]</antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
    ].join('\n')
    const mapped = toolBlocks(await collect(textResponse(compatible)))
    expect(mapped).toEqual([{
      type: 'tool-call',
      id: ToolCallId('antml-0'),
      name: 'ask_user_question',
      arguments: JSON.stringify({
        questions: [
          { id: 'fable-q1', question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] },
          { id: 'fable-q2', question: 'Pick many', options: [{ label: 'X' }, { label: 'Y' }], multi_select: true },
        ],
      }),
    }])

    const ranked = [
      '<antml:function_calls>',
      '<antml:invoke name="ask_user_input_v0">',
      '<antml:parameter name="questions">[{"question":"Rank","options":["A","B"],"type":"rank_priorities"}]</antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
    ].join('\n')
    expect(toolBlocks(await collect(textResponse(ranked)))[0]).toMatchObject({
      type: 'tool-call',
      name: 'ask_user_input_v0',
    })
  })

  it('maps simple web_fetch but preserves unsupported Fable-only options for normal validation failure', async () => {
    const simple = [
      '<antml:function_calls>',
      '<antml:invoke name="web_fetch">',
      '<antml:parameter name="url">https://example.com</antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
    ].join('\n')
    expect(toolBlocks(await collect(textResponse(simple)))[0]).toMatchObject({
      name: 'web_fetch',
      arguments: JSON.stringify({ url: 'https://example.com' }),
    })

    const constrained = [
      '<antml:function_calls>',
      '<antml:invoke name="web_fetch">',
      '<antml:parameter name="url">https://example.com</antml:parameter>',
      '<antml:parameter name="allowed_domains">["example.com"]</antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
    ].join('\n')
    expect(toolBlocks(await collect(textResponse(constrained)))[0]).toMatchObject({
      name: 'web_fetch',
      arguments: JSON.stringify({ url: 'https://example.com', allowed_domains: ['example.com'] }),
    })
  })

  it.each([
    [
      'text before a parameter',
      '<antml:function_calls><antml:invoke name="x">junk<antml:parameter name="a">1</antml:parameter></antml:invoke></antml:function_calls>',
    ],
    [
      'duplicate parameters',
      '<antml:function_calls><antml:invoke name="x"><antml:parameter name="a">1</antml:parameter><antml:parameter name="a">2</antml:parameter></antml:invoke></antml:function_calls>',
    ],
    [
      'text after a parameter',
      '<antml:function_calls><antml:invoke name="x"><antml:parameter name="a">1</antml:parameter>junk</antml:invoke></antml:function_calls>',
    ],
    [
      'text between invocations',
      '<antml:function_calls><antml:invoke name="x"></antml:invoke>junk<antml:invoke name="y"></antml:invoke></antml:function_calls>',
    ],
    [
      'empty function body',
      '<antml:function_calls></antml:function_calls>',
    ],
    [
      'text after an invocation',
      '<antml:function_calls><antml:invoke name="x"></antml:invoke>junk</antml:function_calls>',
    ],
  ])('passes through malformed complete ANTML: %s', async (_label, text) => {
    const input = textResponse(text)
    expect(await collect(input)).toEqual(input)
  })

  it('keeps empty ANTML scalar parameters empty', async () => {
    const text = '<antml:function_calls><antml:invoke name="custom_tool"><antml:parameter name="empty"></antml:parameter></antml:invoke></antml:function_calls>'
    expect(toolBlocks(await collect(textResponse(text)))[0]).toMatchObject({
      name: 'custom_tool',
      arguments: JSON.stringify({ empty: '' }),
    })
  })

  it.each([
    [
      'search without a string query',
      '<antml:invoke name="web_search"><antml:parameter name="query">1</antml:parameter></antml:invoke>',
      'web_search',
    ],
    [
      'fetch without a string URL',
      '<antml:invoke name="web_fetch"><antml:parameter name="url">1</antml:parameter></antml:invoke>',
      'web_fetch',
    ],
    [
      'bash without a string command',
      '<antml:invoke name="bash_tool"><antml:parameter name="command">1</antml:parameter><antml:parameter name="description">Run</antml:parameter></antml:invoke>',
      'bash_tool',
    ],
    [
      'bash without a description',
      '<antml:invoke name="bash_tool"><antml:parameter name="command">pwd</antml:parameter></antml:invoke>',
      'bash_tool',
    ],
    [
      'replace without a path',
      '<antml:invoke name="str_replace"><antml:parameter name="description">Edit</antml:parameter><antml:parameter name="old_str">a</antml:parameter></antml:invoke>',
      'str_replace',
    ],
    [
      'replace without a description',
      '<antml:invoke name="str_replace"><antml:parameter name="path">a</antml:parameter><antml:parameter name="old_str">a</antml:parameter></antml:invoke>',
      'str_replace',
    ],
    [
      'replace without old text',
      '<antml:invoke name="str_replace"><antml:parameter name="path">a</antml:parameter><antml:parameter name="description">Edit</antml:parameter></antml:invoke>',
      'str_replace',
    ],
    [
      'replace with a non-string replacement',
      '<antml:invoke name="str_replace"><antml:parameter name="path">a</antml:parameter><antml:parameter name="description">Edit</antml:parameter><antml:parameter name="old_str">a</antml:parameter><antml:parameter name="new_str">1</antml:parameter></antml:invoke>',
      'str_replace',
    ],
    [
      'present without a list',
      '<antml:invoke name="present_files"><antml:parameter name="filepaths">1</antml:parameter></antml:invoke>',
      'present_files',
    ],
    [
      'present with an empty list',
      '<antml:invoke name="present_files"><antml:parameter name="filepaths">[]</antml:parameter></antml:invoke>',
      'present_files',
    ],
    [
      'present with a non-string path',
      '<antml:invoke name="present_files"><antml:parameter name="filepaths">["a",1]</antml:parameter></antml:invoke>',
      'present_files',
    ],
  ])('retains unsupported alias input: %s', async (_label, invocation, expectedName) => {
    const text = `<antml:function_calls>${invocation}</antml:function_calls>`
    expect(toolBlocks(await collect(textResponse(text)))[0]).toMatchObject({ name: expectedName })
  })

  it('defaults an omitted str_replace replacement to deletion', async () => {
    const text = '<antml:function_calls><antml:invoke name="str_replace"><antml:parameter name="path">a</antml:parameter><antml:parameter name="description">Delete</antml:parameter><antml:parameter name="old_str">remove</antml:parameter></antml:invoke></antml:function_calls>'
    expect(toolBlocks(await collect(textResponse(text)))[0]).toMatchObject({
      name: 'edit',
      arguments: JSON.stringify({ file_path: 'a', old_string: 'remove', new_string: '' }),
    })
  })

  it.each([
    ['missing path', undefined, 'Read', [1, 2]],
    ['missing description', 'a', undefined, [1, 2]],
    ['non-array range', 'a', 'Read', 1],
    ['wrong range length', 'a', 'Read', [1]],
    ['non-number start', 'a', 'Read', ['1', 2]],
    ['non-number end', 'a', 'Read', [1, '2']],
    ['fractional start', 'a', 'Read', [1.5, 2]],
    ['fractional end', 'a', 'Read', [1, 2.5]],
    ['start below one', 'a', 'Read', [0, 2]],
    ['end before start', 'a', 'Read', [3, 2]],
  ])('does not approximate invalid ranged view: %s', async (_label, path, description, range) => {
    const params = [
      path === undefined ? '' : `<antml:parameter name="path">${path}</antml:parameter>`,
      description === undefined ? '' : `<antml:parameter name="description">${description}</antml:parameter>`,
      `<antml:parameter name="view_range">${JSON.stringify(range)}</antml:parameter>`,
    ].join('')
    const text = `<antml:function_calls><antml:invoke name="view">${params}</antml:invoke></antml:function_calls>`
    expect(toolBlocks(await collect(textResponse(text)))[0]).toMatchObject({ name: 'view' })
  })

  it.each([
    ['questions not an array', '1'],
    ['empty questions', '[]'],
    ['null question', '[null]'],
    ['primitive question', '["x"]'],
    ['array question', '[[]]'],
    ['missing question text', '[{"options":["A"]}]'],
    ['unknown question type', '[{"question":"Q","type":"other"}]'],
    ['non-string option', '[{"question":"Q","options":["A",1]}]'],
  ])('does not approximate incompatible user input: %s', async (_label, questions) => {
    const text = `<antml:function_calls><antml:invoke name="ask_user_input_v0"><antml:parameter name="questions">${questions}</antml:parameter></antml:invoke></antml:function_calls>`
    expect(toolBlocks(await collect(textResponse(text)))[0]).toMatchObject({ name: 'ask_user_input_v0' })
  })

  it('defaults compatible user-input type and accepts a question without options', async () => {
    const text = '<antml:function_calls><antml:invoke name="ask_user_input_v0"><antml:parameter name="questions">[{"question":"Continue?"}]</antml:parameter></antml:invoke></antml:function_calls>'
    expect(toolBlocks(await collect(textResponse(text)))[0]).toMatchObject({
      name: 'ask_user_question',
      arguments: JSON.stringify({ questions: [{ id: 'fable-q1', question: 'Continue?' }] }),
    })
  })

  it('preserves generic completed blocks when translating ANTML', async () => {
    const resultBlock = {
      type: 'tool-result' as const,
      toolCallId: ToolCallId('previous'),
      content: [],
    }
    const text = '<antml:function_calls><antml:invoke name="custom_tool"></antml:invoke></antml:function_calls>'
    const input: StreamChunk[] = [
      { type: 'block-start', index: 0, blockType: 'tool-result' },
      { type: 'block-end', index: 0, block: resultBlock },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text },
      { type: 'block-end', index: 1, block: { type: 'text', text } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
    const output = await collect(input)
    expect(output).toContainEqual({ type: 'block-start', index: 0, blockType: 'tool-result' })
    expect(output).toContainEqual({ type: 'block-end', index: 0, block: resultBlock })
    expect(toolBlocks(output)).toHaveLength(1)
  })

  it('passes ANTML without a terminal finish through unchanged', async () => {
    const text = '<antml:function_calls><antml:invoke name="custom_tool"></antml:invoke></antml:function_calls>'
    const input: StreamChunk[] = [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'block-end', index: 0, block: { type: 'text', text } },
    ]
    expect(await collect(input)).toEqual(input)
  })

  it('detects an already-native tool call from its completed block', async () => {
    const input: StreamChunk[] = [
      {
        type: 'block-end',
        index: 0,
        block: {
          type: 'tool-call',
          id: ToolCallId('native-end'),
          name: 'web_search',
          arguments: '{"queries":["Raven"]}',
        },
      },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
    expect(await collect(input)).toEqual(input)
  })

  it('passes malformed ANTML, abnormal finishes, and native tool calls through unchanged', async () => {
    const malformed = textResponse('<antml:function_calls><antml:invoke name="web_search">')
    expect(await collect(malformed)).toEqual(malformed)

    const truncated = textResponse([
      '<antml:function_calls>',
      '<antml:invoke name="web_search">',
      '<antml:parameter name="query">Raven</antml:parameter>',
      '</antml:invoke>',
      '</antml:function_calls>',
    ].join('\n'), 'max-tokens')
    expect(await collect(truncated)).toEqual(truncated)

    const native: StreamChunk[] = [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      {
        type: 'tool-call-delta',
        index: 0,
        id: ToolCallId('native'),
        name: 'web_search',
        argumentsDelta: '{"queries":["Raven"]}',
      },
      {
        type: 'block-end',
        index: 0,
        block: {
          type: 'tool-call',
          id: ToolCallId('native'),
          name: 'web_search',
          arguments: '{"queries":["Raven"]}',
        },
      },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]
    expect(await collect(native)).toEqual(native)
  })

  it('preserves usage and reasoning when converting a complete ANTML call', async () => {
    const text = '<antml:function_calls><antml:invoke name="custom_tool"></antml:invoke></antml:function_calls>'
    const input: StreamChunk[] = [
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'thinking' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thinking' } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text },
      { type: 'block-end', index: 1, block: { type: 'text', text } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'stop' }, replayState: { response: { id: 'provider' } } },
    ]
    const output = await collect(input)
    expect(output).toContainEqual({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } })
    expect(output).toContainEqual({
      type: 'block-end',
      index: 0,
      block: { type: 'reasoning', text: 'thinking' },
    })
    expect(output.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })
})
