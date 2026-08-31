# S03 · R2 中性公共 UI 组件

- 会话：R2 Foundation Components
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`
- 分支：`refactor/pc-ui-r2-components`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r2-components`
- 基线 SHA：`6d8415c`
- 允许文件：`web/src/components/ui/pc/**`、本记录
- 禁止文件：Admin、后端、数据库、services、stores、router、页面、layout、assets、canvas、全局样式、主题及其他会话目录

## 完成内容

- 建立 PC 用户端中性公共组件入口，组件均为受控 Props、组合内容和回调，不读取业务 Store、不发起请求。
- 建立基础表面与区块标题：`Surface`、`SectionHeader`。
- 建立筛选工具：`SearchField`、`FilterBar`、`FilterChip`、`ViewToggle`。
- 建立数据展示：`StatusBadge`、`StatTile`、`SelectionBar`。
- 建立表单与浮层框架：`FormSection`、`DialogFrame`、`DrawerFrame`。
- 建立上传视觉外壳：`UploadField`、`FileDropzone`、`UploadProgress`；只向调用方传回原始 `File[]`，不校验、不上传、不改变五条既有上传链路。
- 建立媒体展示：`MediaThumbnail`、`MediaFallback`；仅使用原生媒体元素，不请求或转换资源。
- 建立二级导航：`SubnavLayout`；只管理受控选中回调，不改变路由。
- 统一键盘焦点、图标按钮可访问名称、动态状态语义和减少动画模式。
- 所有样式均限定在 `pc-*` 类作用域，消费冻结的 `--app-*` Token，并对现有中性 Token 提供嵌套 fallback；PC 双栏布局只在 `min-width: 1024px` 启用。

## 修改文件

- `web/src/components/ui/pc/index.ts`
- `web/src/components/ui/pc/surface.tsx`
- `web/src/components/ui/pc/filters.tsx`
- `web/src/components/ui/pc/data-display.tsx`
- `web/src/components/ui/pc/forms.tsx`
- `web/src/components/ui/pc/upload.tsx`
- `web/src/components/ui/pc/media.tsx`
- `web/src/components/ui/pc/subnav-layout.tsx`
- `web/src/components/ui/pc/pc-ui.css`
- `docs/design/pc-user-ui-sessions/S03-foundation-components.md`

## 提交

- `refactor(pc-ui): add R2 neutral shared UI primitives`
- 最终 SHA 由集成记录和 Git 历史登记。

## 风险与依赖

- 依赖 Foundation Token 会话提供冻结的 `--app-*` 语义变量；当前嵌套 fallback 可保证组件在合并前仍有中性样式。
- `DialogFrame`、`DrawerFrame` 依赖当前 Ant Design 6 的受控 `Modal` / `Drawer` API，浮层业务关闭条件、保存状态和脏数据判断仍由页面传入。
- `MediaThumbnail` 对跨域资源只做原生展示和错误降级，不代理、不缓存、不改变鉴权方式。
- `FileDropzone` 的拖入态与 `MediaThumbnail` 的加载失败态属于局部视觉状态，不保存业务数据。
- 本会话没有迁移任何页面；页面 owner 应通过 `@/components/ui/pc` 统一入口消费，避免直接复制组件样式。

## 行为保护

- API、权限、业务规则：未修改
- 路由与查询参数：未修改
- 上传、分页、轮询、持久化：保持原行为
- Admin 与移动端：未修改；移动端没有新增断点规则，PC 专属双栏仅在 1024px 以上启用

## 验证

- 文件所有权检查：通过；代码仅位于 `web/src/components/ui/pc/**`，另有本会话记录。
- 禁区检查：未发现 `admin-*`、`--admin-*`、API、services、stores 或 `!important` 依赖。
- `git diff --check`：通过。
- 完整测试、类型检查和构建：未运行，按总计划在 R6 后集中执行。

## 回滚

- 集成前：删除本 worktree/分支即可，不影响基线。
- 集成后：使用 `git revert <本会话最终 SHA>` 回滚整组公共组件。
