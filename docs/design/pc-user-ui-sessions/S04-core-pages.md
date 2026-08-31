# S04 · R4 核心普通页面

- 会话：PC 用户端 R4 Core Pages
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`
- 分支：`refactor/pc-ui-r4-core`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r4-core`
- 基线 / R2-R3 冻结点：`b66da086d6a8146e0d965399a9e9e3b72f8a7a5c`
- 独占范围：`web/src/pages/home/**`、`tasks/**`、`assets/**`、`skills/**`、`wallet/**`、本记录

## 完成内容

### Home

- 将自定义滚动根容器迁移到冻结的 `WorkspacePage`，并使用统一 `PageHeader`。
- 以 `StatTile`、`Surface`、`SearchField` 统一统计、图表、最近项目与快捷入口。
- 保留项目查询降级、任务活跃度、独立画布创建和 Home 当前无 `RequireAuth` 的合同。

### Tasks

- 统一页头、状态切换、搜索筛选、列表/网格切换、内容 Surface、分页、新建对话框、详情抽屉和媒体预览。
- 使用 `SearchField`、`ViewToggle`、`Surface`、`DialogFrame`、`DrawerFrame` 替代页面自定义外壳。
- 未改变 10/60 秒轮询、页面可见性恢复、任务合并、失败重试、上游恢复、Canvas 同步、分组和本地分页语义。

### Assets

- 统一页头、容量摘要、搜索、双分类导航、素材网格、批量操作、分页、编辑对话框、档案抽屉和删除确认。
- 使用 `SearchField`、`Surface`、`SelectionBar`、`DialogFrame`、`DrawerFrame` 建立稳定的 PC 信息层级。
- 保留文本/图片新建编辑、图片上传确认、3D 模型上传、ZIP 导入导出、Eagle 入口、批量删除和本地/远端同步语义。
- 未修改共享 `components/assets/**`，卡片数据与媒体预览仍使用原处理器。

### Skills

- 将居中 Hero 收敛为标准页头，统一范围切换、搜索、分类、排序、分类标题、技能网格和服务端分页。
- 安装使用 `DialogFrame`，编辑使用 `DrawerFrame`；详情文件工作台保留 82vw 专用 Modal，但表面、搜索、边框和亮暗色全部对齐 Token。
- 保留服务端分页查询、250ms 搜索防抖、加入/收藏/同步/删除、Markdown/ZIP/GitHub 安装、AI 起草、技能包文件树与原文访问逻辑。

### Wallet

- 使用 `WorkspacePage`、`PageHeader`、`Surface`、`SectionHeader`、`StatusBadge` 统一账户摘要、兑换和流水表。
- 移除该页两组独立入场动画，页面只保留公共系统的动效与减少动画策略。
- 保留服务端分页、请求序号防竞态、签到、32 位兑换码、刷新事件和积分显示精度。

### PC 与移动边界

- 新增五个页面私有 CSS，全部限定在 `@media (min-width: 1024px)` 中。
- 减少动画规则同时限定为 PC；未新增移动断点或修改移动数据/交互逻辑。

## 修改文件

- `web/src/pages/home/index.tsx`
- `web/src/pages/home/home-pc.css`
- `web/src/pages/tasks/index.tsx`
- `web/src/pages/tasks/tasks-pc.css`
- `web/src/pages/assets/index.tsx`
- `web/src/pages/assets/assets-pc.css`
- `web/src/pages/skills/index.tsx`
- `web/src/pages/skills/skill-detail-drawer.tsx`
- `web/src/pages/skills/skill-editor-drawer.tsx`
- `web/src/pages/skills/skill-install-modal.tsx`
- `web/src/pages/skills/skills-pc.css`
- `web/src/pages/wallet/index.tsx`
- `web/src/pages/wallet/wallet-pc.css`
- `docs/design/pc-user-ui-sessions/S04-core-pages.md`

## 提交

1. `efa326e1f1cc59af870a6d74030ad719d04646ef` `refactor(pc-ui): home - unify dashboard page structure`
2. `8504d8c79c63b29ce9bd6363a8f14bd128f90d54` `refactor(pc-ui): tasks - standardize task center presentation`
3. `2a51dac49c1df90d518c16c1973338398a51507b` `refactor(pc-ui): wallet - align account and ledger surfaces`
4. `0232cd1259e4dc38aeb6e5e67f7596e561edb8cc` `refactor(pc-ui): assets - unify library and asset workflows`
5. `aa1757a88f5c79913dd9570791fa1350338f2cfa` `refactor(pc-ui): skills - unify catalog and skill workflows`
6. `7e3f53995d18fcb0f6cf06bfb915c0d8c88fb890` `refactor(pc-ui): core pages - scope visual overrides to desktop`
7. 本记录的最终 SHA 以交付消息和 `git rev-parse HEAD` 为准。

## 行为保护

- 后端、Admin、数据库、API 合同、服务、Store、路由、权限和功能开关：未修改。
- 查询 key、请求参数、错误语义、上传处理器、轮询、分页、任务恢复和用户数据同步：保持原行为。
- 公共组件只接收原页面状态与回调，未把业务请求或 Store 放入 UI 基础层。

## 风险与依赖

- 依赖 R2/R3 冻结的 `--app-*`、`WorkspacePage` 和 `components/ui/pc` 公共 API；合并顺序必须在 R2/R3 之后。
- 页面私有 CSS 与 `globals.css` 的历史页面规则暂时并存，R6 只能在完成集中视觉对照后删除确认被取代的旧选择器。
- Skills 详情是文件工作台，未强行压缩为 920px 通用对话框，以避免文件树和 Markdown 预览可用性回归。
- Assets 的共享卡片和媒体预览组件不在本会话所有权中，本阶段仅通过页面 scoped CSS 对齐视觉。
- 1024/1280/1440/1600/1920、亮暗主题、长列表、真实上传、浮层 Portal 和跨浏览器仍待 R7 集中验证。

## 验证

- 逐页面静态审查：已完成。
- 修改文件 Prettier 格式化：已完成。
- 分支相对 `b66da08` 的文件所有权检查：通过，只有五个允许的页面目录和本记录。
- 新增 `admin-*`、`--admin-*` 与 `!important` 检查：通过，无新增匹配。
- `git diff --check`：通过。
- 完整格式检查、类型检查、测试、构建、路由、浏览器、接口与功能回归：未运行，按总计划留到 R7 集中执行。

## 回滚

1. 优先按页面倒序使用 `git revert <页面提交 SHA>`，可独立回滚 Skills、Assets、Wallet、Tasks 或 Home。
2. 回滚任何页面前，先回滚 `7e3f53995d18fcb0f6cf06bfb915c0d8c88fb890`，避免留下只针对已删除 CSS 的 PC 媒体包装提交。
3. 集成后使用 `git revert`，不使用 `git reset --hard` 或强制推送。
