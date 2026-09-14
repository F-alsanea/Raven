# Agent Note: Raven task contracts and evidence-gated completion

Status: implemented

## Problem

A long natural-language task can combine a goal with repository instructions, forbidden operations, conditional actions, and completion requirements. Leaving those constraints only in conversation text makes them easy for a model to lose across tool calls, retries, subagents, or context compaction. Model confidence also cannot establish that tests, typechecking, builds, commits, or other requested verification actually happened.

Raven needs a control layer that preserves explicit user constraints, denies unauthorized high-risk actions before execution, and requires observable evidence when the user requested verification. The layer must use DeepSeek Harness extension points rather than modifying the agent loop.

## Decision

Raven adds two packages under `packages/raven/`.

`dsh-raven-control-plane` is a model-independent library. It compiles explicit Arabic, English, and mixed-language instructions into a `RavenTaskContract`, with a goal, requirements, forbidden operations, high-risk action permissions, conditional rules, and completion evidence requirements. High-risk `commit`, `push`, `deploy`, and `migrate` permissions default to denied and become enabled only through explicit positive instructions. Its verifier evaluates observable evidence independently from model assertions.

`dsh-raven-control-plane-runtime` mounts the contract on existing Harness lifecycle events. `agent/pre-step` compiles ordinary user text and adds a compact logged plugin instruction. `tools/pre-execute` denies classified operations that the current contract does not authorize. `tools/result` records verification evidence from settled engineering commands. `agent/turn-stopping` evaluates the completion gate and uses bounded steering when requested evidence is absent.

The runtime does not modify `agent-loop`. The task state is process-local and keyed by the live Agent. A new ordinary user input creates a new contract for that task turn.

## Verification semantics

Evidence is chronological. For one evidence key, the latest state is authoritative, so a failing test run followed by a passing test run is repaired rather than permanently poisoning the task. Failed current evidence, blockers, or missing requested evidence prevent the completion gate from passing.

A successful tool result counts as evidence only when its tool name or JSON arguments deterministically identify a supported engineering check. The initial set covers tests, typechecking, builds, and Git commits. Raven does not infer success from assistant prose.

## Loop behavior

When completion evidence is missing at `agent/turn-stopping`, Raven steers the agent to gather or repair the missing evidence. Verification steering is bounded to two retries. The final retry explicitly instructs the model not to claim success and to report unresolved verification as blockers. This bound prevents an unavailable external prerequisite from producing an infinite turn.

## Security and authority

Tool denial occurs at `tools/pre-execute`, the operation that authorizes dispatch, rather than only in prompts. The first classifier covers common Git, migration, and deployment command forms. Provider-specific high-risk tools will join a registry as Raven integrations are added.

The task contract complements, rather than replaces, the Harness approval and sandbox layers. Raven policy can deny an action before those layers; an allowed Raven action still remains subject to every downstream Harness permission and sandbox rule.

## Consequences

Explicit constraints become structured runtime state and requested verification becomes observable. The deterministic compiler intentionally does not invent requirements from ambiguous prose. Later milestones may add model-assisted semantic compilation, but its output must validate against the same task-contract schema and deterministic permission policy.

Task continuation across ordinary user turns is not yet represented as a durable Raven task object. That belongs to a later task service rather than hidden merging in this runtime plugin.
