# Raven Implementation Plan

## Milestone 0 — Upstream foundation

- [x] Preserve DeepSeek Harness as an upstream snapshot.
- [x] Preserve upstream MIT attribution.
- [x] Create `raven/integration` for Raven development.
- [x] Define Raven architecture and extension policy.
- [ ] Add automated upstream sync with explicit review before integration.

## Milestone 1 — Raven control plane

Deliver a Raven profile that can execute a repository task while preserving explicit constraints.

- [ ] Task Contract capability: structured goal, requirements, prohibitions, conditional stops, evidence requirements, language, and budgets.
- [ ] Command Compiler provider: convert Arabic/English/mixed input into the Task Contract.
- [ ] Task Contract model context consumer: inject only the concise active contract.
- [ ] Permission policy integration: translate prohibitions and grants into executor-enforced policy where supported.
- [ ] Completion verifier: prevent a natural stop when required observable evidence is missing.
- [ ] No-progress policy: detect equivalent repeated failures and trigger recovery.
- [ ] Raven `headless` and `web` profile overlays.

Acceptance: a request such as "fix the build, do not commit or deploy, and stop if a migration is required" must preserve all restrictions through execution and must not report success when the build remains failing.

## Milestone 2 — Multi-model Raven

- [ ] Use upstream DeepSeek, Anthropic, and OpenAI provider support.
- [ ] Add Raven model-routing policy based on capability, task role, user selection, cost, and availability.
- [ ] Add explicit `@deepseek`, `@claude`, `@openai`, `@codex`, `@auto`, and `@team` selection semantics at the Raven interaction layer.
- [ ] Add Codex integration using the safest supported current integration surface; do not fake OAuth support through the generic provider path.
- [ ] Add role bindings: Planner, Executor, Reviewer, Verifier.
- [ ] Add fallback policy without silently switching providers when that changes user-authorized data handling.

## Milestone 3 — Skill intelligence

- [ ] Extend the upstream skill registry with Raven routing metadata.
- [ ] Progressive skill loading: metadata first, `SKILL.md` on selection, references on demand.
- [ ] Skill dependency/conflict graph.
- [ ] Skill provenance, license, security-review, and risk metadata.
- [ ] GitHub skill discovery/import pipeline.
- [ ] Static skill security review before activation.
- [ ] Curated core packs: coding, security, UI/UX, research, SaaS, DevOps, SEO/AEO/GEO.
- [ ] FABLE-X integration as an optional Raven skill, not an always-on giant prompt.

## Milestone 4 — Memory

- [ ] Working memory.
- [ ] Project-scoped memory.
- [ ] User preference memory.
- [ ] Episodic outcome memory.
- [ ] Retrieval policy and injection budget.
- [ ] Memory inspection and correction UI.
- [ ] Sensitive-data and cross-project isolation rules.

## Milestone 5 — Verification and evals

- [ ] Evidence registry.
- [ ] Code-task verifier recipes: tests, typecheck, build, lint, diff and repository state.
- [ ] Browser/UI verifier recipes.
- [ ] Security-review recipe.
- [ ] Arabic complex-instruction eval set.
- [ ] Mixed Arabic/English eval set.
- [ ] Constraint retention evals.
- [ ] Hallucinated completion evals.
- [ ] Tool-failure and no-progress evals.
- [ ] Multi-agent disagreement evals.

## Milestone 6 — Raven Web experience

- [ ] Raven product identity and locale dictionaries.
- [ ] Arabic RTL and English LTR.
- [ ] Conversation view.
- [ ] Task Contract inspector.
- [ ] Agent/model inspector.
- [ ] Skill inspector.
- [ ] Permission and approval UI.
- [ ] Evidence and verification UI.
- [ ] Trace view separated from concise chat output.
- [ ] Model/provider settings.
- [ ] Memory controls.

## Milestone 7 — Production hardening

- [ ] Sandbox threat model.
- [ ] Credential isolation.
- [ ] Audit log.
- [ ] Rate/budget controls.
- [ ] Plugin trust policy.
- [ ] Dependency and supply-chain checks.
- [ ] Cross-platform checks.
- [ ] Recovery and cancellation tests.
- [ ] Upgrade test against a newer DeepSeek Harness upstream snapshot.

## Engineering rules

1. Prefer Harness extension points over `agent-loop` changes.
2. Every model-visible Raven behavior is reconstructable from durable session data when the upstream architecture requires it.
3. Prompt text never substitutes for executor-level permission enforcement.
4. A model saying "done" never substitutes for observable verification.
5. Third-party skills are untrusted input.
6. Default user-facing output is concise; full trace remains inspectable.
7. Arabic and English are first-class, not translation afterthoughts.
8. Raven-specific code stays separable enough to review upstream updates before adoption.
