# S02 · Foundation Layout

- 会话：PC 用户端 R2/R3 公共壳层与页面骨架
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`
- 分支：`refactor/pc-ui-r2-layout`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r2-layout`
- 基线 SHA：`6d8415c`
- 允许文件：`web/src/components/layout/**`、`web/src/layouts/user-layout.tsx`、本记录
- 禁止文件：Admin、后端、数据库、router、services、stores、API 与其他会话目录

## 完成内容

- 将 PC 工作区壳层固定到 224px 展开侧栏、64px 折叠侧栏、52px 顶栏和 10px 壳层间隙，全部通过 `--app-*` Token 消费并保留原 Token fallback。
- 为路由舞台增加明确的 clipping boundary，`WorkspacePage` 标记页面级纵向滚动 owner，浸入式工作台仍可使用原有内部滚动。
- 统一标准页面 1440px 最大内宽和 24px PC gutter；`fluid` 页面保留全宽、全高合同。
- 升级 `WorkspacePage`、`PageHeader`、`ListToolbar`、`TableSurface`、`CollectionGrid`、`PaginationBar`、`WorkspaceState`。
- 移除用户公共组件输出的 `admin-*` 类，用中性 `app-*` 类实现筛选、表面和分页骨架。
- 补齐页头标题关联、筛选展开状态、当前导航、分页标签、loading/error 状态和键盘焦点反馈。
- `/canvas/:id` 和 `/admin` 的 hide-Chrome 判定、导航、公告、命令面板、登录与功能开关逻辑保持不变。

## 修改文件

- `web/src/components/layout/app-top-nav.tsx`
- `web/src/components/layout/workspace-page.tsx`
- `web/src/components/layout/workspace-shell.css`
- `web/src/components/layout/workspace-sidebar-nav.tsx`
- `web/src/components/layout/workspace-state.tsx`
- `web/src/components/layout/workspace-top-bar.tsx`
- `web/src/layouts/user-layout.tsx`
- `docs/design/pc-user-ui-sessions/S02-foundation-layout.md`

## 提交

- `refactor(pc-ui): unify R2 workspace shell and page scaffolds`
- 最终 SHA 由集成会话台账和本会话交付消息记录。

## 风险与依赖

- 依赖 R2 Token 分支定义冻结的 `--app-*` 值；本分支已为每个新 Token 保留现有工作区 Token 或安全字面值 fallback。
- Tasks 现有页面 CSS 仍定位旧 `admin-list-toolbar-main`；本次在壳层 CSS 中保留了同等的 `app-list-toolbar-main` 换行兼容，R4 Tasks owner 应将它收回页面样式。
- Home、Wallet、Plugins 和 Settings 尚使用页面私有滚动容器；本次不改动其结构，由后续页面会话迁移至统一骨架。
- Projects 详情当前通过页面 class 强制隐藏 `WorkspacePage` 滚动；R5 Projects owner 应显式传入 `scroll={false}` 以使 DOM 标记与实际 owner 一致。
- 本阶段未运行视觉与完整功能回归，需在 R6 后的集中测试中验证长筛选栏、分页换行和 1024px 下限宽度。

## 行为保护

- API、权限、业务规则：未修改
- 路由与查询参数：未修改
- 上传、分页数据语义、轮询、持久化：保持原行为
- 导航数据、功能开关、登出、公告与命令面板：保持原行为
- `<1024px` 信息架构与侧栏展开方式：未重构

## 验证

- 文件所有权检查：仅修改允许的布局目录、`user-layout.tsx` 和本会话记录
- `admin-*` 输出检查：`web/src/components/layout/**` 与 `web/src/layouts/user-layout.tsx` 无匹配
- `git diff --check`：通过
- 完整测试：未运行，按总计划在 R6 后集中执行

## 回滚

- 集成前：丢弃 `refactor/pc-ui-r2-layout` 分支即可。
- 集成后：使用 `git revert <本会话最终 SHA>` 回滚，不使用强制重置。
