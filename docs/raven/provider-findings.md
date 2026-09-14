# Raven Provider Findings

Current DeepSeek Harness already exposes provider support through its LLM seam and built-in provider catalog. Anthropic and OpenAI-compatible providers are available in the upstream provider experience, so Raven should reuse that capability instead of duplicating adapters.

## Raven decisions

- DeepSeek: use upstream support.
- Anthropic/Claude: use upstream provider support first; add Raven-specific routing and role policy above it.
- OpenAI: use upstream provider support first.
- Codex: treat separately from generic OpenAI API model selection. Upstream documentation currently notes that OAuth-login providers such as Codex are not supported through the normal provider-add flow. Raven will implement Codex through a dedicated integration surface after reviewing the existing hooks bridge and current official Codex integration options.

## Model and role separation

Raven agent roles are not provider names. `Planner`, `Executor`, `Reviewer`, and `Verifier` are Raven orchestration roles. A role binding selects a provider/model at runtime or follows an explicit user selection.

## Routing constraints

Routing must consider:

- required tool capabilities;
- context and modality needs;
- explicit user provider selection;
- provider availability;
- privacy/data-handling policy;
- retry/fallback policy;
- task role;
- configured budget.

A fallback that changes provider is not silent when that would materially change authorization, privacy, or user intent.
