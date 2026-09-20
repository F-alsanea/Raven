# Agent Note：Raven 原样挂载 Fable 5.1 capture

Status: implemented

[English](2026-09-20-raven-fable-system-prompt.md) | 中文

## 问题

Raven 基于 DeepSeek Harness。Harness 默认会把身份、部署 persona、工具指导以及
运行时上下文快照组合成 system prompt。Raven 的 owner 明确要求把
`asgeirtj/system_prompts_leaks` 中第三方的
`Anthropic/claude-fable-5.1.md` capture 作为 Raven 的 system prompt，且不能
重写、改名、删减或改编正文。

把约 47.4 万字符的文本直接塞进配置会让审计困难，也更容易被误改；在它前后追加
Raven 指令同样会破坏逐字节一致性的要求。修改 agent loop 则违背 Harness 的插件
架构。

## 决策

Raven 将源文件 vendoring 到
`packages/core/system-prompt/prompts/claude-fable-5.1.md`。采用时复制文件的
Git blob SHA 为 `a2c71e80faf50bcdab30dd60ff04c4799e7d9538`，与源仓库中的
blob 完全一致。

`@deepseek-ai/dsh-system-prompt/raven-fable` 读取该 asset，并注册唯一一个
`complete: true`、名称为 `raven:fable-5.1` 的 section，同时关闭动态
runtime-context prompt 快照。因此 complete-section 约定会移除其他 system-prompt
文本，但仍保留工具 schema、运行时策略、sandbox、审批、持久化和标准 agent loop。

base bundle 会在 `@deepseek-ai/dsh-system-prompt` 之后挂载该兼容插件，因此所有
基于 base 的 Raven profile 默认使用这份原样 capture。

另外提供可选的 `@deepseek-ai/dsh-tools/raven-fable-compat` 入口，只为有真实
Raven 对应能力的 Fable 工具名做参数适配：
`web_search_fast -> web_search`、`present_files -> present`、
`conversation_search -> session_search`。它不会在 base 中全局挂载，因为
`present` 和面向模型的 session-query 工具并不是所有已发布 profile 都具备。
Claude 专属插件目录、专有 connector 和 UI 工具不会被伪造。

## 来源与信任边界

vendored 文本来自公开仓库中的第三方 capture。Raven 不会把其中关于 Anthropic
产品、模型身份、可用性或内部行为的描述视为经过 Raven 独立验证的事实。正文保持
不变，正是为了把“来源保真”与“运行时适配”分开。

## 影响

- Prompt 仍会把助手称作 Claude，并保留 Anthropic 专属产品和工具指令。这是刻意
  的；改掉这些字符串就不再是用户要求的原样 prompt。
- Raven 实际发送给模型的 tool schema 仍是运行时权威来源。Prompt 中提到不存在的
  Claude 专属工具，不会因此创建出对应能力。
- 即使其他 policy prompt 文本被抑制，Raven 的运行时策略仍会继续强制执行。
- 更新 capture 必须显式进行：替换 asset、确认 Git blob SHA 与选定上游 blob
  一致，然后更新固定 SHA 和测试。
- compatibility adapter 继续保持可选，除非某个 composition 能证明所需目标工具
  已被挂载。

## 测试

`packages/core/system-prompt/tests/raven-fable.spec.ts` 固定 complete-prompt 组装、
runtime-context 抑制、工具 schema 保留、源 SHA 和未修改的 Claude 身份标记。

`packages/core/tools/tests/raven-fable-compat.spec.ts` 固定三个 adapter 的参数转换，
以及缺少所需 Raven 目标工具时明确失败的行为。

采用时还会额外核对源文件与 vendored 文件的 Git blob SHA 完全一致。
