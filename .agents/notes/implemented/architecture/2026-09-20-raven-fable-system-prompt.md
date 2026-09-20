# Agent Note: Raven mounts the Fable 5.1 capture verbatim

Status: implemented

English | [中文](2026-09-20-raven-fable-system-prompt.zh.md)

## Problem

Raven is built on DeepSeek Harness, whose prompt is normally assembled from a
harness identity, deployment persona, tool guidance, and runtime-context
snapshots. The Raven owner explicitly wants the third-party
`Anthropic/claude-fable-5.1.md` capture from
`asgeirtj/system_prompts_leaks` to be Raven's system prompt without rewriting,
renaming, trimming, or adapting its text.

Inlining that file into configuration would make a 474k-character prompt hard
to audit and easy to accidentally edit. Appending Raven guidance around it
would also violate the byte-for-byte requirement. Replacing the agent loop
would violate the Harness plugin architecture.

## Decision

Raven vendors the source file at
`packages/core/system-prompt/prompts/claude-fable-5.1.md`. The copied Git blob
SHA is `a2c71e80faf50bcdab30dd60ff04c4799e7d9538`, identical to the source blob
at the time of adoption.

`@deepseek-ai/dsh-system-prompt/raven-fable` reads that asset and registers one
`complete: true` section named `raven:fable-5.1`. It also suppresses dynamic
runtime-context prompt snapshots. The complete-section contract therefore
removes every other system-prompt section while preserving tool schemas,
runtime policy, sandboxing, approvals, persistence, and the normal agent loop.

The base bundle mounts this compatibility plugin after
`@deepseek-ai/dsh-system-prompt`, so base-backed Raven profiles use the
verbatim capture by default.

A separate opt-in
`@deepseek-ai/dsh-tools/raven-fable-compat` entrypoint provides argument-shape
adapters only for Fable tool names that have meaningful Raven equivalents:
`web_search_fast -> web_search`, `present_files -> present`, and
`conversation_search -> session_search`. It is not mounted in the base bundle
because `present` and model-facing session-query tools are not present in every
shipped profile. Claude-only plugin catalogs, proprietary connectors, and UI
tools are not fabricated.

## Provenance and trust

The vendored text is a third-party capture from a public repository. Raven does
not treat its claims about Anthropic products, model identity, availability, or
internal behavior as independently verified facts. The source text remains
unchanged precisely because provenance and runtime adaptation are separate
concerns.

## Consequences

- The prompt still calls the assistant Claude and contains Anthropic-specific
  product and tool instructions. That is intentional; changing those strings
  would no longer be the requested verbatim prompt.
- Raven's actual model-facing tool schemas remain authoritative at runtime.
  Instructions that name unavailable Claude-only tools do not create those
  capabilities.
- Runtime policy remains enforced by Raven even though policy text from other
  prompt contributors is suppressed.
- Updating the captured prompt is a deliberate source update: replace the asset,
  verify that its Git blob SHA matches the selected upstream blob, then update
  the pinned SHA and tests.
- Compatibility adapters remain optional unless a composition can prove their
  required target tools are mounted.

## Testing

`packages/core/system-prompt/tests/raven-fable.spec.ts` pins complete-prompt
assembly, runtime-context suppression, tool-schema preservation, source SHA, and
the unmodified Claude identity markers.

`packages/core/tools/tests/raven-fable-compat.spec.ts` pins the three adapter
argument translations and the fail-loud behavior when a required Raven target
is absent.

The source-to-vendored blob SHA equality is also verified at adoption time.
