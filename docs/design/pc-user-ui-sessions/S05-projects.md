# S05 · Projects 与六阶段生产工作流

- 会话：PC 用户端 R4/R5 Projects
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`
- 分支：`refactor/pc-ui-r4-projects`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r4-projects`
- 基线 SHA：`b66da08`
- 允许文件：`web/src/pages/projects/**`、Projects/Workflow 专项测试、本记录
- 禁止文件：Admin、后端、数据库、router、services、stores、layout、公共 UI、全局样式、主题、Canvas 与其他会话目录

## 完成内容

### 项目库

1. 按统一 PC 页面合同补齐项目页头、状态摘要、主操作、AI 故事起稿区和项目列表区。
2. 复用 `Surface`、`SectionHeader`、`StatusBadge`、`SearchField` 与 `DialogFrame`，页面私有规则全部限定在 `pc-projects-*` 作用域。
3. 项目卡保留原封面、阶段、删除、统计和跳转逻辑，将章节完成度改为语义化 `progress`。
4. 保留每页 50 条无限加载，以及只对当前已加载项目执行搜索、状态筛选和排序的既有语义。
5. 补齐“完全没有项目”的空状态；此前空状态仅在存在搜索或状态筛选时显示。

### 项目详情

1. 明确 `WorkspacePage scroll={false}`，由详情标准页或章节/工作流内部容器分别拥有滚动，避免双滚动。
2. 统一项目顶栏的返回入口、项目身份、状态、六个详情视图导航与新建画布主操作。
3. 统一 Overview、Chapters、Assets、Canvases、Settings 的页头、Surface、状态、表单、网格、侧栏和弹窗视觉。
4. Settings 使用公共 `FormSection` 划分基础信息、模型、主图、画风和项目状态；保存与归档 Mutation 保持不变。
5. Assets 继续使用服务端分页、候选资产分页、目录树、角色卡、声音绑定和素材选择器；Canvases 继续使用独立画布分页和章节关联。
6. Chapters 保留章节 CRUD、拖拽与长距离排序、虚拟列表、编辑器、未保存拦截、角色提取和分镜任务恢复。

### 六阶段工作流

1. 新增可横向滚动的六阶段导航，所有链接复用现有深链接：剧情、资产、分镜、预演、视频、交付。
2. 剧情、资产和交付概览消费公共 `SectionHeader`、`Surface`、`StatTile`。
3. 统一资产栏、镜头脚本、生成设置、产物预览和底部镜头轨道的中性表面、边框、选中与滚动合同。
4. 使用公共 `StatusBadge` 统一草稿、保存中、待生成、运行、成功、失败和过期状态，并移除 Workflow 内对应的 AntD Tag 强覆盖。
5. 保留任务提交、任务状态轮询、报价、模型兼容、技能运行、素材引用、脚本版本、产物历史、下载与删除确认逻辑。

## 修改文件

- `web/src/pages/projects/index.tsx`
- `web/src/pages/projects/projects.css`
- `web/src/pages/projects/detail.tsx`
- `web/src/pages/projects/detail/assets.tsx`
- `web/src/pages/projects/detail/canvases.tsx`
- `web/src/pages/projects/detail/chapters.tsx`
- `web/src/pages/projects/detail/overview.tsx`
- `web/src/pages/projects/detail/settings.tsx`
- `web/src/pages/projects/detail/workflow.tsx`
- `web/src/pages/projects/detail/workflow.css`
- `web/src/pages/projects/detail/workflow-chapter-navigator.tsx`
- `web/src/pages/projects/detail/workflow-production-workbench.tsx`
- `web/src/pages/projects/detail/workflow-shared.tsx`
- `web/src/pages/projects/detail/workflow-stage-views.tsx`
- `docs/design/pc-user-ui-sessions/S05-projects.md`

## 提交

- `ebb6f47` · `refactor(pc-ui): projects - rebuild project library experience`
- `baf9eec` · `refactor(pc-ui): projects - unify detail workbench and views`
- `1a6ae34` · `refactor(pc-ui): projects - rebuild six-stage production workflow`
- 本记录提交：由最终交付消息与 `git rev-parse HEAD` 回溯。

## 风险与依赖

- 依赖 R2/R3 冻结的 `--app-*` Token、Workspace Page 骨架及 `@/components/ui/pc` 公共组件，合并顺序必须位于 `b66da08` 之后。
- `projects.css` 由项目库和项目详情两个路由入口共同加载；规则均以 `pc-projects-*`、`pc-project-*` 开头，不影响其他业务页。
- 新六阶段导航只创建现有路由链接，不创建或推进 Workflow Step；阶段状态仍完全来自现有 Workflow 数据。
- 工作流仍在 1050px 以下隐藏左侧资产栏，这是现有窄宽降级合同；1024px 下限需在 R7 视觉回归中确认。
- Project Assets、Settings 的 PC 结构已重排；移动端未进行视觉重构，只保留现有控件、数据和行为，需在 R7 做保护性回归。
- 当前独立 Worktree 没有可用的完整前端依赖环境，也没有真实项目/画布测试数据；类型、构建、路由截图和付费生成验证全部留到集中测试阶段。

## 行为保护

- API、响应、权限、功能开关与业务规则：未修改。
- Router、查询参数和深链接格式：未修改。
- 项目无限加载及“已加载数据”筛选排序：保持原行为。
- 项目素材和候选资产的服务端分页：保持原行为，没有机械改造成项目库的无限加载。
- 章节 CRUD、虚拟列表、排序、任务恢复与 SessionStorage 记忆：保持原行为。
- 角色声音绑定、画布关联、归档、工作流任务、轮询、报价、版本与下载：保持原行为。
- Services、Stores、Canvas、Admin、后端和全局文件：零修改。

## 验证

- 文件所有权检查：通过；代码仅修改 `web/src/pages/projects/**`，另有本会话记录。
- 禁区检查：通过；无 `admin-*`、`--admin-*` 或新增 `!important`，无 services/stores/router/backend/Admin diff。
- `git diff --check`：三个代码提交前均通过。
- 静态审查：核对所有新增组件均为纯展示/受控回调，现有 Query、Mutation、轮询、分页和路由构造未迁移。
- 类型、完整测试、构建和浏览器回归：未运行，按总计划在 R6 后集中执行。

## 回滚

按从新到旧顺序回滚，避免详情代码引用尚未回滚的页面样式：

1. `git revert 1a6ae34`：回滚六阶段导航、公共状态与 Workflow 视觉。
2. `git revert baf9eec`：回滚项目详情壳层和各详情视图。
3. `git revert ebb6f47`：回滚项目库、创建弹窗和页面私有样式文件。
4. 本记录可随所属文档提交单独 `git revert <S05-文档-SHA>`。
5. 不使用 `git reset --hard` 或强制推送。
