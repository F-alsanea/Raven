# Raven Control Plane

`@deepseek-ai/dsh-raven-control-plane` owns Raven's deterministic task contract primitives. It turns explicit bilingual user instructions into a structured contract and prevents completion from being reported without observable evidence when the command requires verification.

## Responsibilities

- Detect Arabic, English, or mixed commands.
- Extract explicit repository and execution constraints without inventing missing intent.
- Keep high-risk actions denied by default until the user explicitly requests them.
- Represent required completion evidence separately from model confidence.
- Detect observed actions that violate the compiled task contract.

The package is intentionally independent from the agent loop. Raven will mount these primitives through plugins at documented Harness extension points instead of patching `agent-loop` directly.

## Safety defaults

`commit`, `push`, `deploy`, and `migrate` are denied by default. Explicit positive instructions may enable them, while explicit negative instructions always keep them denied. Reading, editing, and testing remain available for ordinary engineering tasks and are still subject to the Harness permission layer.

## Model Experience

Indirectly, through Raven orchestration plugins that compile the user's command before planning and verify evidence before completion.

#### KV Cache effect

The library itself adds no model tokens. A future Raven orchestration consumer may project a compact task contract into model-visible context; that consumer owns the token and cache contract.

## Known Limitations and Deferred Work

- **Explicit constraints only** — the first compiler recognizes explicit bilingual directives and common engineering actions. Semantic inference for arbitrary complex conditions will be added through a model-assisted compiler with deterministic schema validation.
- **No loop mounting yet** — this milestone exposes tested primitives first. The next Raven package will bind them to `agent/pre-step`, tool execution policy, and `agent/turn-stopping`.
