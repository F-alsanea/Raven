/** Raven task-contract runtime policy mounted on Harness extension points. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { compileCommand, verifyCompletion } from '@deepseek-ai/dsh-raven-control-plane'
import type { RavenEvidence, RavenTaskContract } from '@deepseek-ai/dsh-raven-control-plane'
import type { PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { actionAllowed, classifyRuntimeAction, successfulEvidenceName } from './policy.ts'

export const name = 'raven-control-plane-runtime'

interface AgentTaskState {
  contract: RavenTaskContract
  evidence: RavenEvidence[]
  verificationRetries: number
}

const MAX_VERIFICATION_RETRIES = 2

function userText(messages: readonly UserMessage[]): string {
  return messages
    .filter(message => message.source.kind === 'user')
    .flatMap(message => message.content)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

function contractContext(contract: RavenTaskContract): UserMessage {
  const lines = [
    'Raven task contract:',
    `- goal: ${contract.goal || '(use the user request as the goal)'}`,
    `- required: ${contract.requirements.length > 0 ? contract.requirements.join('; ') : 'none explicitly extracted'}`,
    `- forbidden: ${contract.forbidden.length > 0 ? contract.forbidden.join('; ') : 'none explicitly extracted'}`,
    `- completion evidence: ${contract.completion.length > 0 ? contract.completion.join('; ') : 'none explicitly required'}`,
    '- obey this contract throughout the task; do not claim verified completion without the listed evidence.',
  ]
  return createUserMessage({
    content: [{ type: 'text', text: lines.join('\n') }],
    source: {
      kind: 'plugin',
      plugin: name,
      form: 'instructions',
    },
  })
}

function verificationSteer(state: AgentTaskState, finalAttempt: boolean): UserMessage {
  const result = verifyCompletion(state.contract, state.evidence)
  const unresolved = [...result.missing, ...result.failures, ...result.blockers]
  const instruction = finalAttempt
    ? 'Verification remains incomplete. Do not claim success. Report these unresolved items as blockers in the final response and stop.'
    : 'Verification is incomplete. Continue only with actions needed to gather or repair the missing evidence, then verify again.'
  return createUserMessage({
    content: [{
      type: 'text',
      text: `Raven verification gate:\n- unresolved: ${unresolved.join('; ')}\n- ${instruction}`,
    }],
    source: {
      kind: 'plugin',
      plugin: name,
      form: 'notice',
      summary: finalAttempt ? 'Verification incomplete — report blockers' : 'Verification incomplete — continue',
    },
  })
}

function evidenceKind(name: string): RavenEvidence['kind'] {
  if (name === 'tests') return 'test'
  if (name === 'typecheck') return 'typecheck'
  if (name === 'build') return 'build'
  return 'action'
}

/** Mount Raven's deterministic task contract and evidence gates. */
export function apply(ctx: Context): void {
  const states = new WeakMap<Agent, AgentTaskState>()

  ctx.on('agent/pre-step', async ({ agent, messages }, next): Promise<PreStepDecision> => {
    const downstream = await next()
    if (downstream.kind === 'reject') return downstream

    const text = userText(messages)
    if (!text) return downstream

    const contract = compileCommand(text)
    states.set(agent, { contract, evidence: [], verificationRetries: 0 })
    return {
      ...downstream,
      messages: [contractContext(contract), ...downstream.messages],
    }
  })

  ctx.on('tools/pre-execute', async (exec: ToolExecution, next): Promise<PreToolDecision> => {
    if (!exec.agent) return next()
    const state = states.get(exec.agent)
    if (!state) return next()

    const action = classifyRuntimeAction(exec.name, exec.arguments)
    if (!action || actionAllowed(state.contract, action)) return next()
    return {
      kind: 'deny',
      reason: `Raven task contract denies ${action}. The user did not authorize this action for the current task.`,
    }
  })

  ctx.on('tools/result', (exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined => {
    if (!exec.agent) return undefined
    const state = states.get(exec.agent)
    if (!state) return undefined

    const name = successfulEvidenceName(exec.name, exec.arguments)
    if (!name) return undefined
    state.evidence.push({
      kind: evidenceKind(name),
      name,
      status: result.isError ? 'failed' : 'passed',
      ...(result.isError ? { detail: result.error.message } : {}),
    })
    return undefined
  })

  ctx.on('agent/turn-stopping', ({ agent }): void => {
    const state = states.get(agent)
    if (!state || state.contract.completion.length === 0) return

    const result = verifyCompletion(state.contract, state.evidence)
    if (result.passed) return

    if (state.verificationRetries < MAX_VERIFICATION_RETRIES) {
      state.verificationRetries += 1
      agent.steer(verificationSteer(state, state.verificationRetries === MAX_VERIFICATION_RETRIES))
    }
  })

  ctx.on('agent/disposed', ({ agent }): void => {
    states.delete(agent)
  })
}

export { actionAllowed, classifyRuntimeAction, successfulEvidenceName } from './policy.ts'
