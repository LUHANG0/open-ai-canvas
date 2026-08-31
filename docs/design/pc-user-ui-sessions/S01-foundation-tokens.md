# S01 · Foundation Token 与 AntD 主题

- 会话：S01 Foundation Token
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`
- 分支：`refactor/pc-ui-r2-tokens`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r2-tokens`
- 基线 SHA：`6d8415c`
- 允许文件：`web/src/styles/globals.css` 的用户端/通用 Token 区、`web/src/styles/pc-user-foundation.css`、`web/src/lib/app-theme.ts`、`web/src/application.tsx`、`web/components.json`、本记录
- 禁止文件：Admin、后端、数据库、services、stores、路由、权限、API 合同及其他会话目录

## 完成内容

1. 新建 PC 用户端 Foundation 变量文件，建立 `--app-*` 的 Primitive → Semantic → Component 三层 Token。
2. 补齐亮色/暗色的画布、页面、四层表面、三层文字、三档边框、主/次操作、选中、焦点和五类状态 Token。
3. 统一系统字体、30/36/42px 控件、6/8/10/12px 圆角、120/180/240ms 动效以及 224/64px 侧栏、52px 顶栏、24px 页面 gutter 和 1440px 内容宽度。
4. 将旧 `workspace` 尺寸、表面、边框、主操作与动效变量桥接到新 Token，保证页面会话可渐进迁移。
5. 重构 AntD 主题：导出 Foundation/亮暗色板，用户端别名和组件 Token 均从同一语义对象派生。
6. Admin 继续使用原有别名与高密度配置，不注入新 PC 用户端背景、文字、圆角和状态别名。
7. 移除 `application.tsx` 中重复的 body 字体命令式赋值，字体改由 Foundation 唯一声明。
8. 修正 shadcn 配置中已失效的全局 CSS 路径，便于后续公共组件按正确 Token 文件生成。

## 修改文件

- `web/src/styles/pc-user-foundation.css`：新增 PC 用户端 Foundation Token。
- `web/src/styles/globals.css`：导入 Foundation，桥接旧 Token，将全局字体改为 CSS 单一来源。
- `web/src/lib/app-theme.ts`：以结构化语义常量派生用户端 AntD 主题，保留 Admin 旧主题合同。
- `web/src/application.tsx`：删除 body 字体运行时赋值。
- `web/components.json`：将 shadcn CSS 入口指向 `src/styles/globals.css`。
- `docs/design/pc-user-ui-sessions/S01-foundation-tokens.md`：本会话实施与回滚记录。

## 提交

- 主题：`refactor(pc-ui): establish R2 semantic tokens and theme`
- SHA：以包含本记录的分支提交为准，由交付消息和 `git rev-parse HEAD` 回溯。

## 风险与依赖

- 新 Foundation 为全局变量声明，本身不含页面选择器；后续页面必须通过语义 Token 消费，不应再复制色值。
- `workspace-shell.css` 及历史页面 CSS 仍有局部变量覆盖，它们会在 R2 Layout 与后续页面阶段按同名 Token 逐步收敛。
- AntD 用户端的基础背景、文字、状态和圆角将随新主题统一；具体页面视觉回归属于 R7 集中测试。
- R2 Layout 与 R2 Components 依赖本提交的精确 `--app-*` 名称；集成时应先合入本分支。
- `globals.css` 的历史格式尚未全量整理，避免在本会话产生与 Token 无关的万行格式差异。

## 行为保护

- API、权限、业务规则：未修改。
- 路由与查询参数：未修改。
- 上传、分页、轮询、持久化：保持原行为。
- Admin：未修改 Admin 文件或私有 Token；`getAdminAntThemeConfig` 显式保留旧基础配置。

## 验证

- 文件所有权检查：通过，只修改任务允许文件。
- `git diff --check`：通过。
- 单文件 TypeScript 静态核对：`app-theme.ts` 使用当前仓库 TypeScript/AntD 类型通过。
- 专属新增/修改文件 Prettier 检查：通过；`globals.css` 保留历史格式，本次不做全量重写。
- 完整测试：未运行，按总计划在 R6 后集中执行。

## 回滚

1. 在集成分支定位本会话提交：`git log --oneline --grep='establish R2 semantic tokens and theme'`。
2. 使用 `git revert <S01-提交-SHA>` 整体回滚 Token、主题、字体和配置变更。
3. 不使用 `git reset --hard` 或强制推送。
