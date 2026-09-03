# 前端 UI 技术栈收敛记录（2026-09-03）

## 目标

在不修改接口、数据、权限和页面业务流程的前提下，逐批减少并行 UI 实现，形成可持续的公共组件边界。首批只处理空、加载、错误状态组件，视觉与交互合同保持不变。

## 基线与范围

- 开始基线：`9192418`。
- 分支：`release/v1.2.2-preview.3-rc-20260903`。
- 涉及：用户端公共 UI、页面导入路径、对应静态回归门禁和设计系统文档。
- 不涉及：Admin、后端、数据库、接口、账号数据、品牌设置、计费与真实生成。

## 首批决策

1. `web/src/components/ui/pc/workspace-state.tsx` 是通用状态组件的唯一实现位置。
2. 页面统一使用 `WorkspaceState`、`WorkspaceLoadingState`、`WorkspaceErrorState`；原 `components/layout/workspace-state.tsx` 被移除。
3. 删除未被页面使用的第二套 `EmptyState` 与对应 112 行样式，避免后续继续分叉。
4. 画布、创作等包含业务引导动作的专属空态继续保留，不强行抽象为通用组件。
5. Ant Design 继续承担复杂控件，项目公共组件承担品牌化中性结构，Tailwind/页面 CSS 只做布局与局部编排。

## 验证记录

- 静态门禁：新增 `web/test/ui-stack-convergence.test.ts`，阻止旧导入路径和重复空态重新出现。
- `bun run typecheck`：通过。
- `bun test`：235 个文件、1657 项测试全部通过。
- `bun run build`：生产构建通过，启动壳、画布/创作入口、最大业务入口及最大 JS/CSS 文件体积预算全部通过。
- 本批为结构收敛，保留原组件 DOM 类名和样式消费方式，不引入页面视觉变化。

## 回滚

- 首批代码提交：`da6215a`（`refactor(ui): 公共状态组件 - 收敛重复状态体系`）。
- 如需撤回首批，使用 `git revert da6215a`，禁止 `reset --hard` 或强推。
- 回滚只影响前端组件组织和导入路径，不需要回滚数据库、用户数据、品牌设置或本地配置。
