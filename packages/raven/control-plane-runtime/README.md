# Raven Control Plane Runtime

`@deepseek-ai/dsh-raven-control-plane-runtime` binds Raven's deterministic task contract to DeepSeek Harness extension points without modifying `agent-loop`.

## Runtime behavior

- `agent/pre-step` compiles ordinary user text into a fresh task contract and prepends a compact logged plugin instruction for that step.
- `tools/pre-execute` denies classified high-risk actions when the task contract does not authorize them.
- `tools/result` records observable test, typecheck, build, and commit evidence from settled tool results.
- `agent/turn-stopping` checks the completion gate. Missing evidence steers the agent to gather it; a bounded final steering tells the model to report unresolved verification as blockers instead of claiming success.

The verification retry count is bounded to prevent a missing external prerequisite from creating an infinite loop.

## Model Experience

### Task contract context

#### What the model sees

A compact plugin-authored task contract containing the current goal, explicit requirements, forbidden actions, and requested completion evidence.

#### Token effect

Conditional and bounded by the compiled contract fields. One contract message is prepended when a step contains ordinary user text.

#### KV Cache effect

A new user task replaces the prior runtime task state and introduces a new contract message. Tool-only continuation steps do not add another task contract.

### Verification steering

#### What the model sees

Only when requested completion evidence is missing: a short notice listing unresolved evidence and directing the model either to gather it or, on the final bounded retry, report it as a blocker without claiming success.

#### Token effect

Conditional. At most two verification steering messages are produced for one compiled task.

#### KV Cache effect

Append-only within the active task while verification remains incomplete.

## Known Limitations and Deferred Work

- **Classifier coverage** — enforcement currently recognizes common Git, migration, and deployment command forms from tool names and JSON arguments. Provider-specific deployment tools will be added to a registry rather than hard-coded as Raven integrations grow.
- **Evidence semantics** — a successful tool result is treated as passing evidence for recognized engineering checks. Structured test-count extraction and browser assertions are deferred to dedicated evidence providers.
- **Task continuation** — a new ordinary user message compiles a fresh contract. Cross-turn task continuation and explicit contract amendments will move to the Raven task service in a later milestone.
