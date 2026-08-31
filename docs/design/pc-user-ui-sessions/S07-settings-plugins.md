# S07 · Settings 与 Plugins / Eagle

- 会话：PC 用户端 R6 Settings + Plugins / Eagle
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`、`docs/design/pc-user-ui-refactor-plan.md`
- 分支：`refactor/pc-ui-r6-settings-plugins`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r6-settings-plugins`
- 基线 SHA：`c949021df4886e070d535128c56963f3d4a7ca76`
- 允许文件：`web/src/pages/settings/**`、`web/src/pages/plugins/**`、本记录
- 禁止文件：Admin、后端、数据库、router、services、stores、API、layout、公共 UI、全局样式、主题及其他会话页面

## 完成内容

### Settings

- 将设置页收敛到 `WorkspacePage` + `PageHeader` + `SubnavLayout`，统一页标题、分类导航、内容表面和唯一滚动容器。
- 保留 `section`、`continue`、`taskId`、`projectId` 查询参数和原有返回创作页交互；功能开关仍决定个人渠道、RunningHub 与 ComfyUI 分类是否可见。
- 统一本机 Runtime / Dreamina CLI、个人渠道、模型默认值、生成偏好、提示词编辑器、对象存储和诊断工具的区块层级、边框、密度、状态和焦点反馈。
- 对个人渠道模型的能力、请求协议和视频计费抽屉接入 `DrawerFrame`，Token / 按次 / 按秒数值与更新回调保持原状。
- RunningHub 与 ComfyUI 继续使用原工作流拓扑、字段映射和测试工作台，只统一表单表面、JSON 折叠区和操作区视觉。

### Plugins

- 将插件中心收敛到标准页头和 `SubnavLayout`，按文本、图片、视频、音频和应用插件呈现数量与过滤状态。
- 搜索接入 `SearchField`，启停状态接入 `StatusBadge`；保留来源、状态、可信筛选、分类滚动、刷新、启停和管理员跳转。
- 新增服务端插件列表的可见 error / retry 和 loading 状态；加载失败时仍可使用已注册内置插件，不改变原有降级数据来源。
- 统一插件卡片、权限摘要、用户设置对话框和用户文档对话框；用户侧两类浮层接入 `DialogFrame`。
- 删除用户页面新 DOM 不再使用的旧插件侧栏、工具栏操作区和详情对话框强制宽度；Admin 上传弹窗的既有强制宽度原样保留，本轮相对基线没有新增 `!important`。
- 交叉审查确认 `UploadPluginModal` 仅由 Admin 调用后，将原共享模块恢复为基线 `Modal` 合同；用户侧详情另建 `PluginDetailsDialog`，避免通过共享组件和依赖图间接改变 Admin。

### Eagle

- 统一 Eagle 页头连接状态、左侧文件夹树、面包屑、工具栏、素材网格和分页密度。
- 用 `WorkspaceState`、`WorkspaceLoadingState` 和 `WorkspaceErrorState` 区分未启用、读取中、连接失败、空文件夹与搜索无结果。
- 素材档案接入 `DrawerFrame`，并修正 Drawer Portal 下预览与下载样式原先无法命中页面后代选择器的问题。
- 上传、新建文件夹、目录切换、搜索、分页、预览和原文件下载回调均保持原状。
- 操作失败但已有缓存素材时保留网格，并在各端显示紧凑错误条；只有首次/重新读取失败且无素材时才进入完整错误态。

### PC 与非 PC 边界

- 新的高密度 Surface、导航栏、卡片、工作流与 Eagle 框架视觉集中在 `@media (min-width: 1024px)`。
- Settings 在 `<768px` 保留横向分类导航，`768–1023px` 保留原有 200px 纵向导航合同。
- Plugins 在 `<=900px` 保留横向导航和换行筛选，`901–1023px` 保留 208px 纵向导航并取消吸顶，避免被公共页头遮挡；未隐藏或删除移动端控件。
- 共用响应式 Dialog / Drawer 仅替换视觉外壳，原 `open`、`onCancel` / `onClose`、footer、焦点恢复和内容滚动合同保留。
- Settings 与 Plugins 的 sticky 分类栏避开 52px 页面头部，插件分区同步设置滚动锚点偏移，避免滚动后被页头遮挡。

## 修改文件

### Settings

- `web/src/pages/settings/index.tsx`
- `web/src/pages/settings/settings.css`
- `web/src/pages/settings/channel-settings-pane.tsx`
- `web/src/pages/settings/channel-video-pricing.tsx`
- `web/src/pages/settings/comfyui-bridge-settings-pane.tsx`
- `web/src/pages/settings/runninghub-settings-pane.tsx`
- `web/src/pages/settings/local-cli-settings.tsx`
- `web/src/pages/settings/model-default-grid.tsx`
- `web/src/pages/settings/prompt-preferences-pane.tsx`
- `web/src/pages/settings/diagnostics-panel.tsx`

### Plugins / Eagle

- `web/src/pages/plugins/index.tsx`
- `web/src/pages/plugins/plugins.css`
- `web/src/pages/plugins/plugin-documentation-modals.tsx`
- `web/src/pages/plugins/plugin-details-dialog.tsx`
- `web/src/pages/plugins/eagle.tsx`
- `web/src/pages/plugins/eagle.css`
- `docs/design/pc-user-ui-sessions/S07-settings-plugins.md`

## 提交

1. `88b982da5efab54c05f22b4f07f0fafcaa75afa2` `refactor(settings): unify PC settings workspace`
2. `335536eb88cb82006e35a0ddd396001e061673fc` `refactor(plugins): rebuild PC plugin and Eagle workspaces`
3. `b9f4c552b1f05e5cdd605c6246dc7146aa23f98a` `fix(pc-ui): preserve settings and plugin responsive contracts`
4. Admin 间接影响保护提交与本记录最终 SHA 以交付消息和 `git rev-parse HEAD` 为准。

## 风险与依赖

- 依赖基线已冻结的 `--app-*`、`WorkspacePage`、`SubnavLayout`、`DialogFrame`、`DrawerFrame` 与状态组件，必须在 R2/R3 公共基础后合并。
- `plugins.css` 仍保留插件 Markdown、上传与移动保护样式；本轮已删除新 DOM 不再使用的旧侧栏规则，后续只能在 R6/R7 视觉对照后继续压缩。
- Settings 中的工作流图编辑器和测试工作台是共享组件，本会话只通过页面 scope 对齐外壳，未改其内部视觉或数据流。
- 待 R7 集中验证 1024 / 1280 / 1440 / 1600 / 1920、浅深主题、长模型名、大量插件、Eagle 深层文件树、浮层 Portal 与实际上传。

## 行为保护

- Admin、后端、数据库、API 合同、services、stores、router、layout、公共 UI、全局样式和主题：未修改。
- Settings `section` 查询参数、个人渠道开关、工作流插件可见性、配置验证与返回创作：保持原行为。
- 渠道模型拉取、API Key / Secret / Header、协议、能力、Token 计费、真实模型测试：保持原请求和更新回调。
- Dreamina CLI、RunningHub、ComfyUI Bridge、OSS 与诊断导出：保持原请求、授权、一次性 Token、下载与持久化逻辑。
- 插件可见性的管理员绕过、功能开关、启停、配置、文档、Eagle 路径、原文件读写和分页：保持原行为。

## 验证

- 规范、页面清单、计划与会话模板：已完整阅读。
- 逐文件静态自审：已完成；原 API / Store 调用与主要 handler 未改。
- 文件所有权检查：通过；相对 `c949021` 仅修改 `pages/settings/**`、`pages/plugins/**` 和本记录。
- `admin-*`、`--admin-*` 与新增 `!important` 检查：通过，无匹配。
- Admin 间接依赖检查：通过；`UploadPluginModal` 的 JSX、强制宽度、Markdown、Dropzone 和响应规则与 `c949021` 保持一致。
- 交叉审查修复：Eagle 缓存素材不再被操作错误遮挡；Settings / Plugins sticky rail 与插件滚动锚点已计入页面头部高度。
- PC-only 与 `<1024px` 边界静态检查：通过；桌面视觉规则位于 `min-width: 1024px`，非 PC 保护规则显式保留旧导航方向和控件可达性。
- `git diff --check`：通过。
- 完整格式、类型、测试、构建、路由、权限、表单、上传、Eagle 实机和浏览器回归：未运行，按总计划在全部页面完成后集中执行。

## 回滚

1. 单独回滚非 PC 保护层：`git revert b9f4c552b1f05e5cdd605c6246dc7146aa23f98a`。
2. 单独回滚 Plugins / Eagle：`git revert 335536eb88cb82006e35a0ddd396001e061673fc`。
3. 单独回滚 Settings：`git revert 88b982da5efab54c05f22b4f07f0fafcaa75afa2`。
4. 合并后只使用 `git revert` 建立可追溯回滚点，不使用 `git reset --hard` 或强制推送。
