# S08 · Canvas 画布库

- 会话：PC 用户端 R5/R6 Canvas Library
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`
- 分支：`refactor/pc-ui-r6-canvas-library`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r6-canvas-library`
- 基线 SHA：`c949021`
- 允许文件：`web/src/pages/canvas/index.tsx`、`web/src/pages/canvas/canvas-library-pc.css`、`web/src/components/canvas/canvas-folder-card.tsx`、本记录
- 禁止文件：`canvas-project-card.tsx`、Canvas 编辑器、Admin、后端、数据库、router、services、stores、layout、公共 UI、全局样式、主题及其他会话目录

## 完成内容

### 页面框架与查询模式

1. 按标准业务页合同统一 `/canvas` 的 PageHeader、主操作、导入入口、更多操作和画布总量信息。
2. 为 `mode=new|recent|choose|handoff` 增加只读上下文提示；原自动创建、最近画布回退、选择与交接导航逻辑未移动。
3. 将 PC 搜索、项目筛选、排序、已应用条件和结果计数收口到 `Surface`、`FilterBar`、`SearchField`、`FilterChip`，窄 PC 可换行而不裁切。
4. 项目列表查询失败时仅提示项目筛选/关联暂不可用，并允许复用原 Query `refetch`；本地画布仍可浏览，不将辅助查询错误升级为阻断页。

### 画布集合与状态

1. 统一画布内容 Surface、网格密度、创建卡、文件夹卡、选中态、焦点态、操作浮层和明暗主题 Token。
2. 空库与筛选无结果使用不同文案和恢复操作；加载态继续表明正在恢复本地缓存与账号同步状态。
3. 选中批量条消费公共 `SelectionBar`，保留加入项目、移出项目、导出和删除；只新增显式“清除选择”入口，调用既有 UI Store 回调。
4. 保留每批 50 个的 IntersectionObserver 无限加载，并在 PC 明确当前已加载状态。
5. 关联项目弹窗继续使用原 Modal、Select、Query 和保存函数，只通过唯一 `rootClassName` 在 PC 套用统一弹窗视觉。

### 卡片键盘与信息层级

1. 文件夹卡保留 Enter/Space 打开、复选框选择、重命名、导出和删除键盘路径。
2. 为卡片标题、元数据、编辑输入和操作组补充稳定的可访问名称与描述关系。
3. PC 预览区增加节点数量覆盖层，正文继续展示所属项目、节点量、创建时间和更新时间；小屏隐藏新增覆盖层。

### PC-only 边界

1. 所有新视觉规则位于 `canvas-library-pc.css` 的 `@media (min-width: 1024px)`，并以 `pc-canvas-library-*` 或唯一弹窗/菜单根类隔离。
2. 1024px 以下继续显示旧搜索筛选、旧批量条、旧空库创建卡和旧加载提示；PC 公共组件副本在小屏不参与布局或可访问树。
3. 小屏关联弹窗不展示新增项目查询错误块，避免本阶段改变移动端信息结构。
4. 未新增 `!important`、`.admin-*`、`--admin-*` 或全局 AntD 覆盖。

## 修改文件

- `web/src/pages/canvas/index.tsx`
- `web/src/pages/canvas/canvas-library-pc.css`
- `web/src/components/canvas/canvas-folder-card.tsx`
- `docs/design/pc-user-ui-sessions/S08-canvas-library.md`

## 提交

- `14c0c16` · `refactor(pc-ui): rebuild canvas library experience`
- `3c6cac9` · `fix(pc-ui): preserve narrow canvas library contracts`
- 本记录提交：由最终交付消息与 `git rev-parse HEAD` 回溯。

## 风险与依赖

- 依赖共同基线 `c949021` 中冻结的 `--app-*` Token、Workspace Page 和 `@/components/ui/pc` 公共组件；应在该基线之后合并。
- 页面仍以 Canvas Store 的本地数据为主，项目名称和关联候选来自 `listProjects`；项目辅助查询失败时会显示“未同步项目”或 PC 告警，这是原数据来源的降级边界。
- 卡片继续渲染 `ProjectPreview`，大画布集合仍依赖既有 `content-visibility`、媒体懒加载与每批 50 个策略；真实数据量性能留待 R7 集中回归。
- AntD Dropdown 浮层继续依赖统一主题；本会话仅为卡片菜单和关联弹窗提供唯一私有根类，没有改公共浮层主题。
- 未在独立 Worktree 启动真实登录、远端同步或浏览器会话；视觉、接口错误恢复和跨主题截图需在 R7 集中验证。

## 行为保护

- API、响应、权限、业务规则：未修改。
- Router、路径与 `mode=new|recent|choose|handoff` 查询参数：未修改。
- `createCanvasProjectWithRemoteSync`、`saveRemoteUserDataNow` 的调用、参数和本地优先/远端同步顺序：未修改。
- ZIP 解析、媒体写入、绘图文档恢复和 `importProject` 映射：未修改。
- 搜索、项目筛选、排序、每批 50 个无限加载：保持原行为。
- 项目关联、选择、导出、删除和重命名继续调用原 Store/API 回调；没有复制业务状态。
- `canvas-project-card.tsx`、Canvas 编辑器、services、stores、router、Admin、后端和全局文件：零修改。

## 验证

- 文件所有权检查：通过；代码仅修改任务允许的三个 Canvas Library 文件，另有本会话记录。
- 禁区检查：通过；无 `canvas-project-card.tsx`、编辑器、services、stores、router、Admin、后端、全局样式或主题 diff。
- 私域检查：通过；新增 CSS 仅使用 `pc-canvas-library-*`、卡片专属后代或唯一弹窗/菜单根类。
- 禁止项检查：通过；无新增 `!important`、`.admin-*` 或 `--admin-*`。
- `git diff --check c949021..HEAD`：通过。
- 静态审查：核对 mode 转发、自动打开 effect、ZIP 导入、远端同步、IntersectionObserver、项目关联与批量回调未迁移或改参。
- 类型、完整测试、构建和浏览器回归：未运行，按总计划在 R6 后集中执行。

## 回滚

按从新到旧顺序回滚：

1. `git revert 3c6cac9`：仅回滚小屏加载文案和关联错误块保护。
2. `git revert 14c0c16`：回滚 Canvas Library PC 页面、文件夹卡可访问性增强及私有样式文件。
3. 本记录可随所属文档提交单独 `git revert <S08-文档-SHA>`。
4. 不使用 `git reset --hard`、强制推送或覆盖其他会话提交。
