# Agent Note: Raven mounts the Fable 5.1 capture verbatim

Status: implemented

English | [中文](2026-09-20-raven-fable-system-prompt.zh.md)

## Problem

Raven is built on DeepSeek Harness, whose prompt is normally assembled from a harness identity, deployment persona, tool guidance, and runtime-context snapshots. The Raven owner explicitly wants the third-party `Anthropic/claude-fable-5.1.md` capture from `asgeirtj/system_prompts_leaks` to be Raven's system prompt without rewriting, renaming, trimming, or adapting its text.

Inlining the 474k-character file into configuration makes provenance harder to audit and makes accidental edits easier. Appending Raven guidance around it violates the byte-for-byte requirement, while replacing the agent loop violates the Harness plugin architecture.

## Decision

Raven vendors the source file at `packages/core/system-prompt/prompts/claude-fable-5.1.md`. Its Git blob SHA is `a2c71e80faf50bcdab30dd60ff04c4799e7d9538`, identical to the selected source blob at adoption.

`@deepseek-ai/dsh-system-prompt/raven-fable` reads that asset and registers one `complete: true` section named `raven:fable-5.1`. It suppresses dynamic runtime-context prompt snapshots, so the complete-section contract removes every other system-prompt section while tool schemas, runtime policy, sandboxing, approvals, persistence, and the standard agent loop remain active.

The base bundle mounts the compatibility prompt after `@deepseek-ai/dsh-system-prompt`, so base-backed Raven profiles use the verbatim capture by default.

The opt-in `@deepseek-ai/dsh-tools/raven-fable-compat` entrypoint adapts only Fable tool names with meaningful Raven equivalents: `web_search_fast -> web_search`, `present_files -> present`, and `conversation_search -> session_search`. It is not mounted in the base bundle because `present` and model-facing session-query tools are not present in every shipped profile. Claude-only plugin catalogs, proprietary connectors, and UI tools are not fabricated.

The vendored text is a third-party capture from a public repository. Raven preserves it as source material but does not independently verify claims inside it about Anthropic products, model identity, availability, or internal behavior.

## Alternatives considered

**Rewrite the prompt for Raven.** Renaming Claude, changing tool instructions, or trimming product-specific sections would improve native fit but would violate the owner's explicit requirement that the Fable text remain unchanged.

**Inline the prompt in YAML or TypeScript.** This would avoid an asset loader but would make a large external source harder to compare byte-for-byte and easier to change accidentally.

**Patch the agent loop.** A loop-level special case could force the prompt but would bypass the existing complete-section extension point and conflict with Raven's plugin architecture.

**Mount every compatibility alias globally.** This would make profiles fail when their target tools are absent, so adapters remain opt-in until a composition provides their required targets.

## Consequences

- The prompt still calls the assistant Claude and contains Anthropic-specific product and tool instructions; this is intentional because changing those strings would no longer be verbatim.
- Raven's actual model-facing tool schemas remain authoritative at runtime, and references to unavailable Claude-only tools do not create those capabilities.
- Runtime policy remains enforced outside prompt prose even though other prompt sections and dynamic runtime-context snapshots are suppressed.
- Updating the capture requires replacing the asset, verifying its Git blob SHA against the chosen source blob, and updating the pinned SHA and tests.
- Compatibility adapters are available only to compositions that mount their corresponding Raven targets.

## Testing

`packages/core/system-prompt/tests/raven-fable.spec.ts` pins complete-prompt assembly, runtime-context suppression, tool-schema preservation, the source SHA, and unmodified Claude identity markers. `packages/core/tools/tests/raven-fable-compat.spec.ts` pins adapter argument translation and fail-loud activation when required Raven targets are absent. Adoption also verifies source and vendored Git blob SHA equality.
