# Agent Note: Raven 原样挂载 Fable 5.1 capture

Status: implemented

[English](2026-09-20-raven-fable-system-prompt.md) | 中文

## Problem

Raven 基于 DeepSeek Harness，而 Harness 默认会把身份、部署 persona、工具指导和 runtime-context 快照组合成 system prompt。Raven owner 明确要求把 `asgeirtj/system_prompts_leaks` 中第三方的 `Anthropic/claude-fable-5.1.md` capture 作为 Raven 的 system prompt，并且正文不能重写、改名、删减或改编。

把约 47.4 万字符的文件直接放进配置会让来源审计更困难，也更容易发生误改；在正文前后追加 Raven 指令会破坏逐字节一致性的要求，而修改 agent loop 则违背 Harness 的插件架构。

## Decision

Raven 将源文件 vendoring 到 `packages/core/system-prompt/prompts/claude-fable-5.1.md`。其 Git blob SHA 为 `a2c71e80faf50bcdab30dd60ff04c4799e7d9538`，与采用时选定的源 blob 完全一致。

`@deepseek-ai/dsh-system-prompt/raven-fable` 读取该 asset，并注册唯一一个 `complete: true`、名称为 `raven:fable-5.1` 的 section。它同时抑制动态 runtime-context prompt 快照，因此 complete-section 约定会移除其他 system-prompt section，但工具 schema、运行时策略、sandbox、审批、持久化和标准 agent loop 仍保持生效。

base bundle 会在 `@deepseek-ai/dsh-system-prompt` 后挂载该兼容 prompt，因此基于 base 的 Raven profile 默认使用这份原样 capture。

base bundle 同时挂载 `@deepseek-ai/dsh-tools/raven-fable-compat`。它观察 Raven 的工具注册表，只在真实目标当前已挂载时公开对应 adapter：`web_search_fast -> web_search`、`present_files -> present` 和 `conversation_search -> session_search`。目标被移除时 alias 也会移除，因此缺少 `present` 或面向模型 session-query 的 profile 仍然有效。adapter 执行会通过 `ctx.tools.execute` 重新进入真实目标，从而保留目标策略和取消语义。Claude 专属插件目录、专有 connector 和 UI 工具不会被伪造。

vendored 文本来自公开仓库中的第三方 capture。Raven 将它作为来源材料原样保存，但不会独立确认其中关于 Anthropic 产品、模型身份、可用性或内部行为的描述。

## Alternatives considered

**为 Raven 重写 prompt。** 把 Claude 改成 Raven、修改工具指令或删除产品专属段落会提高原生适配度，但会违反 owner 要求正文完全不变的明确约束。

**把 prompt 直接内嵌在 YAML 或 TypeScript。** 这样可以省掉 asset loader，但会让大型外部来源更难做逐字节比对，也更容易被误改。

**修改 agent loop。** loop 层的特例可以强制 prompt，但会绕开现有 complete-section 扩展点，并与 Raven 的插件架构冲突。

**为了兼容而全局强制挂载全部目标工具。** 仅为了满足 Fable 工具名而额外加入 `present` 和面向模型的 session-query 会改变无关 profile 的能力，因此 compatibility plugin 只跟随 composition 本来就挂载的真实目标。

## Consequences

- Prompt 仍会把助手称作 Claude，并保留 Anthropic 专属产品和工具指令；这是刻意行为，因为修改这些字符串后就不再是原样文本。
- Raven 实际发送给模型的 tool schema 仍是运行时权威来源，Prompt 中提到不存在的 Claude 专属工具不会因此获得对应能力。
- 即使其他 prompt section 和动态 runtime-context 快照被抑制，Raven 的运行时策略仍会在 prompt 文本之外继续强制执行。
- 更新 capture 必须替换 asset、核对其 Git blob SHA 与选定源 blob 一致，并同步更新固定 SHA 和测试。
- compatibility alias 会随着对应 Raven 目标的出现和移除而同步变化，因此 base composition 不会额外增加无关能力。

## Testing

`packages/core/system-prompt/tests/raven-fable.spec.ts` 固定 complete-prompt 组装、runtime-context 抑制、工具 schema 保留、源 SHA 和未修改的 Claude 身份标记。`packages/core/tools/tests/raven-fable-compat.spec.ts` 固定 adapter 参数转换、随目标注册与移除、保留策略的嵌套 dispatch，以及插件卸载。采用时还会核对源文件与 vendored 文件的 Git blob SHA 完全一致。
