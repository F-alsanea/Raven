# Agent Note: Raven literal Fable system prompt

Status: implemented

## Problem

Raven needs to reproduce the selected Fable 5.1 system-prompt behavior without maintaining a hand-edited derivative that can drift from the chosen source. Fable also emits a textual ANTML function-call protocol that differs from Harness-native tool-call chunks, while Raven must keep existing sandbox, approval, logging, and provider behavior authoritative.

## Decision

Raven vendors the selected public Fable 5.1 prompt at Git blob `a2c71e80faf50bcdab30dd60ff04c4799e7d9538` and registers it as one `complete: true` system-prompt section. The prompt bytes remain unchanged.

The compatibility plugin translates only ANTML operations with faithful Raven equivalents into native Harness tool-call chunks. Unsupported proprietary operations remain unsupported so ordinary tool validation rejects them. The adapter uses the existing LLM stream extension point instead of modifying the agent loop.

## Alternatives considered

**Rewrite Claude-specific wording in the prompt.** Rejected because the project requires the selected prompt asset to remain byte-identical.

**Teach every model provider to parse ANTML.** Rejected because ANTML belongs to this compatibility plugin rather than the generic provider transport.

**Patch the agent loop.** Rejected because the existing complete system-prompt and LLM stream extension points already provide the required integration points.

## Consequences

Raven can use the pinned Fable prompt while retaining Harness execution policy and tool ownership. The prompt increases request-token usage, and translated ANTML calls must be buffered until the complete response is available. Fable-specific integrations without a faithful Harness equivalent fail normally instead of being fabricated.
