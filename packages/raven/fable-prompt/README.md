---
description: Literal Fable 5.1 system prompt and ANTML compatibility plugin for Raven.
kind: reference
---

# Raven Fable Prompt

## Summary

`@deepseek-ai/dsh-raven-fable-prompt` loads Raven's pinned Fable 5.1 prompt as one complete system-prompt section and converts faithfully supported textual ANTML function calls into Harness-native tool-call chunks.

## Configuration

The plugin has no runtime tuning surface. The prompt asset is intentionally pinned in `prompt/claude-fable-5.1.md`; changing that asset is a source update, not ordinary configuration.

## Prompt integrity

The checked-in prompt is pinned to Git blob `a2c71e80faf50bcdab30dd60ff04c4799e7d9538`. Tests recompute the blob identity from the checked-in bytes and pin assembled prompt output.

The source is the public file selected for Raven. This package does not claim that the public file is an independently authenticated Anthropic distribution.

## Runtime behavior

The plugin registers the pinned text through the system-prompt service as a `complete: true` section. It also listens to the LLM stream and rewrites a complete, well-formed Fable ANTML function-call response into provider-neutral tool-call chunks.

Native tool calls, malformed ANTML, auxiliary model calls, and abnormal finishes pass through without forced translation. Unsupported proprietary operations are not approximated.

## Model Experience

The complete Fable prompt replaces ordinary system-prompt sections for the affected model request, while Harness still owns tool schemas, execution policy, approvals, session durability, and provider routing.

#### KV Cache effect

The large, stable pinned prompt becomes a substantial prefix of affected model requests. Providers that support compatible prefix caching may reuse that stable prefix. Any change to the vendored prompt invalidates that exact prompt prefix. ANTML translation occurs after model output and does not add prompt tokens.

## Known Limitations and Deferred Work

- The full prompt has a substantial per-request token footprint.
- ANTML function-call responses are buffered until a complete response is available, so translated turns do not preserve incremental streaming latency.
- Claude/Fable-specific integrations without a faithful Harness equivalent remain unsupported.
- The plugin does not authenticate the provenance of the selected public prompt source beyond pinning the exact bytes included in Raven.

## Verification

```sh
pnpm exec vitest run packages/raven/fable-prompt/tests
pnpm exec vitest run --config vitest.e2e.config.ts packages/raven/fable-prompt/tests/loader.e2e.ts
pnpm exec tsc -b packages/raven/fable-prompt/tsconfig.json --pretty false
```
