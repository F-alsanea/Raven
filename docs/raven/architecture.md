# Raven Architecture

Raven is a bilingual, multi-model agent harness distribution built on DeepSeek Harness. Raven extends the upstream plugin tree instead of replacing the agent loop unless an extension point cannot express required behavior.

## Product goals

Raven MUST:

- accept Arabic, English, and mixed-language instructions;
- preserve explicit user constraints as executable task policy;
- route work across DeepSeek, Anthropic/Claude, OpenAI, and Codex-capable integrations;
- load skills progressively instead of placing the complete skill library in every prompt;
- verify observable completion before reporting success when verification is possible;
- stop or re-plan when progress stalls instead of repeating the same action indefinitely;
- keep user-facing answers concise by default while preserving a complete trace for inspection;
- expose dangerous actions through permission policy rather than prompt-only instructions;
- preserve upstream DeepSeek Harness updateability.

## Upstream strategy

`upstream/deepseek-harness` is a source snapshot of DeepSeek Harness. The exact imported upstream commit is recorded in `.raven-upstream-sha`.

`raven/integration` is Raven's development integration branch.

Raven-specific behavior SHOULD be implemented as Cordis plugins, profiles, bundles, and event listeners. Changes to `packages/core/agent-loop` require a demonstrated inability to implement the behavior through existing extension points.

## Raven layers

```text
User / Client
    |
    v
Raven Interaction Layer
    |
    v
Command Compiler
    |
    +--> immutable task contract
    |
    v
Context + Memory Resolver
    |
    v
Skill Router
    |
    v
Model / Agent Router
    |
    v
DeepSeek Harness Agent Loop
    |
    +--> Tools / Filesystem / Shell / Web / MCP / Subagents
    |
    v
Raven Verification Policy
    |
    +--> PASS -> concise completion
    |
    +--> FAIL -> retry / re-plan / delegate / stop
```

## Task contract

Raven converts a user request into a structured task contract before execution. The contract is durable for the turn and carries:

- goal;
- requirements;
- forbidden actions;
- conditional stop rules;
- granted permissions;
- expected evidence;
- language preference;
- execution budget.

Later agents may refine the plan but MUST NOT silently weaken explicit user constraints.

## Model routing

Raven uses the existing Harness LLM provider seam. Provider identity and agent role are separate concepts.

Initial roles:

- Planner
- Executor
- Reviewer
- Verifier

A role may be bound to any compatible provider. A typical policy can choose Claude for planning, Codex/OpenAI for implementation, DeepSeek for adversarial review, and another provider for verification without making those assignments mandatory.

## Skills

Raven uses the upstream skill registry and filesystem loader as the base capability. Raven adds selection policy and metadata for progressive disclosure.

Only skill metadata is eligible for the always-on routing context. Full `SKILL.md` content is loaded after selection. Large references are loaded only when the selected skill requests them.

The registry will record:

- id and version;
- domains and triggers;
- supported languages;
- context cost;
- required skills;
- conflicts;
- risk class;
- provenance and license;
- security-review state.

Third-party skills are untrusted until reviewed.

## Verification

A model declaration that work is complete is not sufficient completion evidence.

When observable verification exists, Raven requires evidence appropriate to the task, such as:

- tests;
- typecheck;
- build;
- lint or static checks;
- requested file state;
- HTTP response;
- browser/UI assertion;
- security review;
- permission and constraint audit.

Verification failure keeps the task unresolved unless a stop condition or budget limit has been reached.

## Progress control

Raven records progress signals after each meaningful step. Repeated equivalent failures or equivalent state without new evidence trigger a no-progress decision. Recovery may:

- change plan;
- select another skill;
- select another model;
- delegate to a reviewer;
- stop and report a blocker.

Raven MUST bound model calls, tool calls, retries, and subagent concurrency.

## Memory

Raven separates:

1. working memory — current task;
2. project memory — repository/project decisions;
3. user preferences — durable cross-project preferences;
4. episodic memory — selected prior task outcomes.

Retrieval is scoped. Project memory from one project is not injected into another unless explicitly classified as cross-project preference.

## Language

Raven supports `ar`, `en`, and `auto`. In `auto`, the response follows the user's dominant language while preserving technical identifiers exactly. The Web UI owns RTL/LTR presentation through locale dictionaries; model prompts do not hardcode UI copy.

## Output policy

Default user-facing completion is concise:

- result;
- material changes;
- verification status;
- blockers or actions intentionally not performed.

Detailed traces remain available separately. Internal orchestration chatter is not copied into the final answer.

## Permissions

Permissions are enforced at execution boundaries, not only in prompts. Initial policy classes:

- read;
- local write;
- repository commit;
- remote push;
- deployment;
- destructive delete;
- secrets/credential use;
- external side effects.

High-risk operations require an explicit policy grant or user approval according to profile configuration.

## Raven profile

Raven will ship a dedicated `raven` profile/bundle rather than modifying the upstream shipped profiles. The profile composes Raven plugins over the normal Harness base capabilities and remains patchable by the user.
