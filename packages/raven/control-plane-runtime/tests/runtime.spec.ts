import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import * as RavenRuntime from '../src/index.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

async function harness(): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(RavenRuntime)
  return ctx
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise(resolve => {
    const dispose = ctx.on('agent/status', ({ agent: observed, status }) => {
      if (observed === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

function pluginMessages(agent: Agent): string[] {
  return agent.session.snapshotEvents()
    .filter((event): event is SessionEvent<'user/message'> => (
      event.type === 'user/message' && event.data.source.kind === 'plugin'
    ))
    .map(event => event.data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n'))
}

describe('Raven control-plane runtime', () => {
  it('denies a forbidden high-risk action before the tool body executes', async () => {
    const ctx = await harness()
    let invoked = false
    ctx.tools.register(defineContentToolFixture({
      name: 'git-push',
      description: 'push changes',
      parameters: {},
      async execute() {
        invoked = true
        return [{ type: 'text', text: 'pushed' }]
      },
    }))
    ctx.llm.registerAdapter(['mock'], new MockAdapter([
      toolCallResponse('c1', 'git-push', {}),
      textResponse('done'),
    ]))

    const agent = await ctx.agentLoop.create(SessionId('deny-push'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Fix it. Do not push.' }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    expect(invoked).toBe(false)
    const results = agent.session.snapshotEvents().filter(event => event.type === 'tool/result')
    expect(results).toHaveLength(1)
    expect(JSON.stringify(results[0])).toContain('Raven task contract denies push')
  })

  it('accepts successful requested verification evidence without extra steering', async () => {
    const ctx = await harness()
    ctx.tools.register(defineContentToolFixture({
      name: 'test',
      description: 'run tests',
      parameters: {},
      async execute() {
        return [{ type: 'text', text: '6 tests passed' }]
      },
    }))
    ctx.llm.registerAdapter(['mock'], new MockAdapter([
      toolCallResponse('c1', 'test', {}),
      textResponse('done'),
    ]))

    const agent = await ctx.agentLoop.create(SessionId('test-evidence'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Fix it and run tests.' }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    const messages = pluginMessages(agent)
    expect(messages.filter(text => text.includes('Raven task contract:'))).toHaveLength(1)
    expect(messages.filter(text => text.includes('Raven verification gate:'))).toHaveLength(0)
  })

  it('records failed verification evidence with its error detail', async () => {
    const ctx = await harness()
    ctx.tools.register(defineContentToolFixture({
      name: 'test',
      description: 'run tests',
      parameters: {},
      async execute() {
        throw new Error('tests exploded')
      },
    }))
    ctx.llm.registerAdapter(['mock'], new MockAdapter([
      toolCallResponse('c1', 'test', {}),
      textResponse('cannot complete'),
      textResponse('reporting blocker'),
    ]))

    const agent = await ctx.agentLoop.create(SessionId('failed-test-evidence'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Fix it and run tests.' }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    const verification = pluginMessages(agent).filter(text => text.includes('Raven verification gate:'))
    expect(verification.length).toBeGreaterThan(0)
    expect(verification[0]).toContain('tests: tests exploded')
  })

  it('bounds missing-evidence steering and tells the model to report blockers', async () => {
    const ctx = await harness()
    ctx.llm.registerAdapter(['mock'], new MockAdapter([
      textResponse('done without tests'),
      textResponse('still no tests'),
      textResponse('reporting blocker'),
    ]))

    const agent = await ctx.agentLoop.create(SessionId('missing-evidence'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Fix it and run tests.' }],
      source: { kind: 'user' },
    }))
    await waitForIdle(ctx, agent)

    const verification = pluginMessages(agent).filter(text => text.includes('Raven verification gate:'))
    expect(verification).toHaveLength(2)
    expect(verification[0]).toContain('Continue only with actions needed')
    expect(verification[1]).toContain('Do not claim success')
    expect(verification[1]).toContain('report these unresolved items as blockers')
  })
})
