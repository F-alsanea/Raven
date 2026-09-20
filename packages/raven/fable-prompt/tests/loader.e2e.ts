import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as FablePrompt from '@deepseek-ai/dsh-raven-fable-prompt'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('loads the literal Fable prompt through the real Cordis Loader composition', async () => {
  expect('default' in FablePrompt).toBe(false)

  const root = await mkdtemp(join(tmpdir(), 'raven-fable-loader-'))
  roots.push(root)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, JSON.stringify([
    { id: 'prompt', name: 'prompt' },
    { id: 'fable', name: 'fable' },
  ]))

  const modules = new Map<string, unknown>([
    ['prompt', SystemPrompt],
    ['fable', FablePrompt],
  ])
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      const module = modules.get(specifier)
      if (module === undefined) throw new Error(`Unexpected fixture module ${specifier}`)
      return module
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>

  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()

  const promptPath = new URL('../prompt/claude-fable-5.1.md', import.meta.url)
  const expected = await readFile(promptPath, 'utf8')
  expect(renderPrompt(await ctx.systemPrompt.assemble())).toBe(expected)

  const entries = [...ctx.loader.entries()]
  expect(entries.find(entry => entry.options.id === 'prompt')?.fiber?.state).toBe(2)
  expect(entries.find(entry => entry.options.id === 'fable')?.fiber?.state).toBe(2)
})
