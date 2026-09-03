# 影策 UI 设计系统

> 状态：PC 用户端重构基线。Admin 仅作为视觉参照；移动端暂不重构。

## 1. 适用范围

- PC 用户端：视口宽度 `>= 1024px`。
- 移动端保留现有行为，不借本次重构改变信息架构或交互。
- `/canvas/:id`、公开分享、登录注册可使用独立页面结构，但仍消费统一字体、颜色、焦点、表单和状态 Token。
- `/admin/**`、后端、数据库、API 合同、权限和业务规则不属于本设计系统的修改范围。

## 2. 原则

1. 先使用 Primitive Token，再使用 Semantic Token，最后使用组件 Token。
2. 用户页面不得依赖 `.admin-*` 类或 `--admin-*` Token。
3. 公共 UI 组件只负责结构和视觉，不发请求、不读取业务 Store、不改变数据语义。
4. 主操作、普通选中、表单勾选、开关和危险操作使用不同语义角色。
5. 一个页面只允许一个主滚动容器；表格和工作台内部滚动必须显式声明所有权。
6. 所有页面提供 loading、empty、error、disabled、pending 和 success 状态。
7. 所有图标按钮提供可访问名称，并保留 `focus-visible` 和 `prefers-reduced-motion`。

## 3. Foundation

### 3.1 间距

以 4px 为基础栅格：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`。

- 2px 只用于细线、节点端口或极高密度画布元素。
- 普通页面不能引入 5、7、9、11px 等随意间距。

### 3.2 字体

| 用途 | 大小 | 建议字重 |
| --- | ---: | ---: |
| 辅助标识 | 11–12px | 500–600 |
| 控件、表格 | 13px | 500–600 |
| 正文 | 14px | 400–500 |
| 区块标题 | 16–18px | 600–650 |
| 页面标题 | 22–24px | 650–700 |

默认使用系统无衬线字体栈；字体来源只在主题层定义一次。

### 3.3 尺寸与圆角

- 控件高度：小型 30px、默认 36px、大型 42px。
- 控件圆角：6–8px。
- 普通 Surface：10–12px。
- 媒体卡：12–16px。
- 普通业务页禁止使用无语义的大圆角或胶囊化容器。

### 3.4 动效

- 即时状态：120ms。
- 普通过渡：180ms。
- 抽屉、布局切换：240ms。
- 不用动画表达业务成功与否；减少动画模式下移除非必要位移和缩放。

## 4. Semantic Token

统一使用 `--app-*` 命名空间：

- 背景：`--app-bg-canvas`、`--app-bg-page`。
- 表面：`--app-surface-1`、`--app-surface-2`、`--app-surface-3`、`--app-surface-overlay`。
- 文字：`--app-text-primary`、`--app-text-secondary`、`--app-text-muted`、`--app-text-inverse`。
- 边框：`--app-border-subtle`、`--app-border-default`、`--app-border-strong`。
- 操作：`--app-action-primary-*`、`--app-action-secondary-*`。
- 选择：`--app-selection-*`。
- 状态：`--app-status-info/success/warning/error/running-*`。
- 焦点：`--app-focus-ring`。

基础表面建议：

| 角色 | 亮色 | 暗色 |
| --- | --- | --- |
| Canvas | `#f3f4f6` | `#111315` |
| Surface 1 | `#ffffff` | `#1a1d20` |
| Surface 2 | `#f7f8fa` | `#22262a` |
| Surface 3 | `#eceff3` | `#2b3035` |

具体颜色必须通过 Semantic Token 消费，页面中不得直接复制表格值。

## 5. 布局合同

- PC 侧栏：展开 224px，折叠 64px。
- 顶栏：52px。
- 壳层外间隙：10px。
- 普通页面 gutter：20–24px。
- 数据与表单页面内容最大宽度：1440px。
- 创作、项目生产工作台、画布编辑器可以全宽。
- 表格：42px 表头、52px 行高、44px 分页栏。
- 弹窗：480 / 640 / 920px 三档，采用固定标题、可滚动正文、固定操作区。

## 6. 组件合同

优先升级并复用：`WorkspacePage`、`PageHeader`、`ListToolbar`、`TableSurface`、`CollectionGrid`、`PaginationBar`、`WorkspaceState`。

技术边界固定如下：

- Ant Design 负责表单、弹窗、抽屉、表格、分页等复杂交互控件；主题差异统一进入 `web/src/lib/app-theme.ts`。
- `web/src/components/ui/pc` 负责无业务语义的项目公共组件；页面只负责组合，不再创建同职责的第二套公共组件。
- 用户端页面骨架、工具栏、表格/网格容器和分页固定从 `ui/pc/page` 使用；这组含较重依赖且需要稳定共享分包的组件使用显式子路径，不进入 `ui/pc` 总 barrel，`layout/workspace-page` 只作为 Admin 兼容出口。
- Tailwind 与页面 CSS 负责布局和局部编排，不复制公共组件的完整视觉合同，不通过全局选择器覆盖第三方组件内部实现。
- 页面可保留具有明确业务语义的专属空态，例如画布引导和创作起步页；通用空、加载、错误状态统一使用 `WorkspaceState`、`WorkspaceLoadingState`、`WorkspaceErrorState`。
- 普通业务操作直接使用 Ant Design `Button`；完全相同的业务操作组合应在所属领域内提取，例如任务查看/重试，不再额外包装一套全局 Button。原生 `button` 只用于卡片点击面、媒体预览、编辑器和画布工具等需要专属命中区或交互语义的场景。

允许新增的中性组件：

- 页面：`PageScaffold`、`SectionHeader`、`Surface`、`SubnavLayout`。
- 筛选：`SearchField`、`FilterBar`、`FilterChip`、`ViewToggle`。
- 数据：`DataTable`、`SelectionBar`、`RowActions`、`StatusBadge`、`StatTile`。
- 状态：`WorkspaceState`、`WorkspaceLoadingState`、`WorkspaceErrorState`、`FullScreenState`。
- 表单：`FormSection`、`DialogFrame`、`DrawerFrame`、`ConfirmDialog`。
- 上传：`UploadField`、`FileDropzone`、`UploadQueue`、`UploadProgress`。
- 媒体：`MediaThumbnail`、`MediaPreviewDialog`、`MediaFallback`。

上传组件只能统一视觉和状态展示；资源、Agent、Skill、ZIP、Eagle 五条上传链路继续使用原处理函数。

## 7. Admin 协调边界

允许协调：中性表面、三层文字、细边框、低阴影、224/64 侧栏、页头节奏、表格密度、状态色和空态思想。

禁止：修改 Admin 文件、复制 Admin 私有类名/Token、将用户端改造成管理后台密度、迁移 Admin CSS。
