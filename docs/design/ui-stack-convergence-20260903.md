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

## 第二批：页面骨架边界

1. 将 `WorkspacePage`、`PageHeader`、`ListToolbar`、`TableSurface`、`CollectionGrid`、`PaginationBar` 整体迁入 `web/src/components/ui/pc/page.tsx`。
2. 用户端 16 个直接依赖入口切换到公共 UI 层；组件 DOM、类名、筛选展开和分页算法均保持不变。
3. `web/src/components/layout/workspace-page.tsx` 缩为兼容转发层，只供现有 Admin 页面使用；本批不修改 Admin 文件和样式。
4. 公共组件 Props 改为显式导出类型，后续页面扩展不再从组件实现反推合同。
5. 静态门禁要求所有非 Admin 代码不得重新依赖旧 layout 路径，并检查兼容文件不再承载实现。
6. 页面与集合组件采用同一显式子路径导入，不从 `ui/pc` 总 barrel 再导出，也不拆成多个物理模块；完整构建曾检测到拆分模块改变分包归属并导致画布、创作首访预算超限，因此在提交前恢复单一共享模块。

## 验证记录

- 静态门禁：新增 `web/test/ui-stack-convergence.test.ts`，阻止旧导入路径和重复空态重新出现。
- `bun run typecheck`：通过。
- `bun test`：第二批最终状态为 235 个文件、1658 项测试全部通过。
- `bun run build`：生产构建通过，启动壳、画布/创作入口、最大业务入口及最大 JS/CSS 文件体积预算全部通过。
- 第二批试拆期间体积门禁曾阻止一次分包回退；恢复单一共享模块后，启动壳 595.0 KiB、画布首访新增 833.0 KiB、创作首访新增 399.5 KiB，均回到预算内。
- 本批为结构收敛，保留原组件 DOM 类名和样式消费方式，不引入页面视觉变化。

## 回滚

- 首批代码提交：`da6215a`（`refactor(ui): 公共状态组件 - 收敛重复状态体系`）。
- 如需撤回首批，使用 `git revert da6215a`，禁止 `reset --hard` 或强推。
- 回滚只影响前端组件组织和导入路径，不需要回滚数据库、用户数据、品牌设置或本地配置。
- 第二批代码提交：`22f91f7`（`refactor(ui): 页面骨架组件 - 统一用户端公共边界`）。
- 如需只撤回第二批，使用 `git revert 22f91f7`；它不会影响首批状态组件收敛、数据或配置。
