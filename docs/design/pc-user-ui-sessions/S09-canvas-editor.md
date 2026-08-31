# S09 · Canvas 编辑器与公开分享页

- 会话：PC 用户端 R6 Canvas Editor
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`、`docs/design/pc-user-ui-refactor-plan.md`、`docs/design/pc-user-ui-page-inventory.md`
- 分支：`refactor/pc-ui-r6-canvas-editor`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r6-canvas-editor`
- 基线 SHA：`c949021`
- 允许文件：`web/src/pages/canvas/**`（排除 `index.tsx`、`canvas-library-pc.css`）、`web/src/components/canvas/**`（排除 `canvas-folder-card.tsx`、`canvas-project-card.tsx`）、本记录
- 禁止文件：Admin、后端、数据库、API contract、services、stores、router、layout、global/theme、非 Canvas 页面及其他会话目录

## 完成内容

- 建立 Canvas 私域 PC 根 `pc-canvas-workspace`、Portal 根 `pc-canvas-overlay`和专项样式 `canvas-editor-pc.css`；全部新样式仅在 `min-width: 1024px` 生效，使用冻结的 `--app-*` Token。
- 统一 `/canvas/:id` 的工作台外壳：顶部项目信息与操作组、模式切换、主工具栏、底部控制区、缩放和项目侧栏的表面、层级、间距与键盘焦点。
- 统一节点、分组/文件夹框、连线、框选、节点工具条、右键菜单、专注模式、小地图、缩放控件和文件拖入反馈的 PC 表达，保留原有定位、尺寸与交互算法。
- 统一 Agent/助手、本地 Agent、素材托盘、活动任务、生成配置、Composer、节点参数、时间线/导演相关表面的边框、圆角、密度和可见焦点。
- 为 Canvas 自有搜索、上传、预览、分享、字幕、视频处理、裁剪/分割/标注/遮罩/超分、文本编辑、绘图、风格、角色、剧本、导演模板、版本对比、快捷键和任务详情 Modal 增加 Canvas 私域 Portal 根，不影响非 Canvas 浮层。
- 重整 `/share/canvas/:token` 的 PC 只读头部、节点数摘要、登录入口、缩放、临时探索提示、右键菜单、节点表面以及加载/失效态；只读权限和访客临时节点行为不变。
- 完成 PC 边界加固：1024–1279px 紧凑密度、1024px 模式开关定位复位、`prefers-reduced-motion`、强制高对比焦点与公开画布层级。`<1024px` 继续由基线类名和样式负责。
- 新增 ARIA 标签、菜单角色、加载 `aria-busy`和焦点样式；未改变可点击元素的回调、禁用条件或请求时序。

## 修改文件

### 页面与工作台外壳

- `web/src/pages/canvas/canvas-assistant-panel-column.tsx`
- `web/src/pages/canvas/canvas-editor-pc.css`
- `web/src/pages/canvas/canvas-project-status-dialogs.tsx`
- `web/src/pages/canvas/canvas-project-top-bar.tsx`
- `web/src/pages/canvas/canvas-shortcuts-modal.tsx`
- `web/src/pages/canvas/components/libtv-import-dialog.tsx`
- `web/src/pages/canvas/components/tapnow-import-dialog.tsx`
- `web/src/pages/canvas/project.tsx`
- `web/src/pages/canvas/shared.tsx`

### 核心画布、节点、面板与控制件

- `web/src/components/canvas/canvas-active-task-panel.tsx`
- `web/src/components/canvas/canvas-asset-tray.tsx`
- `web/src/components/canvas/canvas-assistant-panel.tsx`
- `web/src/components/canvas/canvas-config-composer.tsx`
- `web/src/components/canvas/canvas-config-node-panel.tsx`
- `web/src/components/canvas/canvas-context-menu.tsx`
- `web/src/components/canvas/canvas-file-drop-overlay.tsx`
- `web/src/components/canvas/canvas-focus-mode-bar.tsx`
- `web/src/components/canvas/canvas-frame-node.tsx`
- `web/src/components/canvas/canvas-local-agent-panel.tsx`
- `web/src/components/canvas/canvas-mini-map.tsx`
- `web/src/components/canvas/canvas-node-prompt-panel.tsx`
- `web/src/components/canvas/canvas-node-toolbar.tsx`
- `web/src/components/canvas/canvas-node.tsx`
- `web/src/components/canvas/canvas-project-sidebar.tsx`
- `web/src/components/canvas/canvas-prompt-optimizer-drawer.tsx`
- `web/src/components/canvas/canvas-script-node.tsx`
- `web/src/components/canvas/canvas-toolbar.tsx`
- `web/src/components/canvas/canvas-workspace-overlays.tsx`
- `web/src/components/canvas/canvas-zoom-controls.tsx`
- `web/src/components/canvas/infinite-canvas.tsx`

### Canvas 私域浮层与专项编辑器

- `web/src/components/canvas/canvas-character-reference-modal.tsx`
- `web/src/components/canvas/canvas-delete-projects-dialog.tsx`
- `web/src/components/canvas/canvas-drawing-editor-modal.tsx`
- `web/src/components/canvas/canvas-node-annotation-dialog.tsx`
- `web/src/components/canvas/canvas-node-crop-dialog.tsx`
- `web/src/components/canvas/canvas-node-mask-edit-dialog.tsx`
- `web/src/components/canvas/canvas-node-search-modal.tsx`
- `web/src/components/canvas/canvas-node-split-dialog.tsx`
- `web/src/components/canvas/canvas-node-upscale-dialog.tsx`
- `web/src/components/canvas/canvas-share-modal.tsx`
- `web/src/components/canvas/canvas-style-picker-modal.tsx`
- `web/src/components/canvas/canvas-subtitle-dialog.tsx`
- `web/src/components/canvas/canvas-text-editor-modal.tsx`
- `web/src/components/canvas/canvas-timeline-dialog.tsx`
- `web/src/components/canvas/canvas-upload-modal.tsx`
- `web/src/components/canvas/canvas-version-compare-modal.tsx`
- `web/src/components/canvas/canvas-video-frame-dialog.tsx`
- `web/src/components/canvas/canvas-video-segment-dialog.tsx`
- `web/src/components/canvas/director/canvas-director-template-modal.tsx`
- `web/src/components/canvas/portrait-clearance/portrait-clearance-modal.tsx`
- `web/src/components/canvas/storyboard-assets-cell.tsx`
- `web/src/components/canvas/style-asset-binding-modal.tsx`
- `web/src/components/canvas/style-profile-editor-modal.tsx`
- `web/src/components/canvas/toolbars/toolbar-settings-modal.tsx`

### 会话记录

- `docs/design/pc-user-ui-sessions/S09-canvas-editor.md`

## 提交与回滚点

- `ede47f9` `refactor(canvas): PC editor shell - unify workspace chrome`
- `cbedd68` `refactor(canvas): PC panels and overlays - unify editor surfaces`
- `8660673` `refactor(canvas): public share - refine readonly workspace`
- `2d7eabe` `refactor(canvas): harden PC density and accessibility`
- `a9ecc9e` `fix(canvas): keep narrow workbench columns visible`
- `abf0dd5` `fix(canvas): reset mode switch at PC boundary`
- 本记录提交 SHA 由 Git 历史和集成台账登记。

## 风险与依赖

- 依赖基线 `c949021` 中的 `--app-*` 设计 Token、既有 Canvas 浅/深色主题、层级 Token 和 Ant Design 6 Portal DOM。
- 本轮是覆盖在旧 Canvas 内联颜色、Tailwind 类和专项 CSS 之上的 PC 壳层，没有重写数千行编辑器架构。集中测试需要重点检查 1024/1280/1440/1600/1920px、浅/深色、长项目名和同时打开多个悬浮面板时的层级。
- Modal 私域外观依赖 Ant Design 当前 `.ant-modal-container`、`.ant-modal-header`等结构；后续升级 Ant Design 时需重新核对。
- `color-mix()` 与 `backdrop-filter` 用于 PC 增强层；不支持时仍由原画布颜色和组件背景托底，集中测试需完成目标浏览器兼容检查。
- 本阶段按总计划不启动服务、不执行完整构建或生成/上传 E2E；交互回归证据由后续集中测试阶段补齐。

## 行为保护

- API、接口返回格式、权限、计费、模型能力和业务规则：未修改。
- 路由、查询参数、功能开关、鉴权和公开分享 token：未修改。
- 本地/远端持久化、历史版本、撤销/重做、快捷键、自动保存、网络同步与离线恢复：保持原行为。
- 上传、拖入、素材库、项目资产、生成/取消/重试、轮询、任务详情、下载和加入画布：保持原回调与数据路径。
- 节点新增/删除/拖动/尺寸、连线、框选、吸附、缩放/平移、小地图、框架分组、专注模式和 Director：保持原算法与事件。
- Composer、提示词优化、Agent、生成参数、字幕、时间线、图片/视频/绘图编辑器：仅增加类名、ARIA 与 PC 表现，处理函数未变。
- 公开分享的读取、失效判定、只读权限、访客临时节点与刷新恢复逻辑：保持原行为；PC 失效态仅新增可逆的登录导航入口。
- `web/src/pages/canvas/index.tsx`、`canvas-library-pc.css`、`canvas-folder-card.tsx`、`canvas-project-card.tsx`：未修改。
- Admin、后端、数据库、services、stores、router、layout、global/theme和非 Canvas 页面：未修改。
- `<1024px` 信息架构、视觉和移动端交互：不重构；PC 才显示的分享摘要、失效态登录入口和详细提示默认隐藏。

## 验证

- 文件所有权检查：通过；仅修改允许的 Canvas 页面/组件和本会话记录，禁止的 4 个 Canvas 文件无差异。
- 禁区检查：未修改 Admin、backend、DB、API contracts、services、stores、router、layout、global/theme 或非 Canvas 页面。
- 业务范围复审：通过；变更仅为 import、样式、className/rootClassName、语义结构和 ARIA，未增删 services/stores 引用或请求函数。
- PC 断点审查：通过；`canvas-editor-pc.css` 所有规则都位于含 `min-width: 1024px` 的 media 中，选择器均从 Canvas 工作台或 Portal 私域根起始。
- `!important` 审查：本轮新增数为 0；`canvas-editor-pc.css` 无 `!important`。
- Canvas Modal 审查：本轮涉及的 Canvas 自有 Modal 均有 `pc-canvas-overlay pc-canvas-modal` Portal 根。
- `git diff --check c949021..HEAD`：通过。
- 完整测试、类型检查、构建、路由、权限、表单、上传、生成、轮询、分享和浏览器回归：未运行，按总计划在全部页面完成后集中执行。

## 回滚

- 集成前：丢弃 `refactor/pc-ui-r6-canvas-editor` 分支或删除本 worktree，共同基线 `c949021` 不受影响。
- 集成后按阶段逆序回滚：`git revert abf0dd5`（1024px 模式开关定位）→ `git revert a9ecc9e`（1024px 列宽保护）→ `git revert 2d7eabe`（PC/移动边界加固）→ `git revert 8660673`（公开分享）→ `git revert cbedd68`（面板与浮层）→ `git revert ede47f9`（编辑器外壳），最后回滚文档提交。
- 不使用 `git reset --hard`，避免覆盖集成分支上的其他会话成果。
