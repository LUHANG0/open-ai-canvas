# 画布全流程交互统一实施记录

## 范围与约束

- 仅修改 PC 端画布前端，不修改后端、Admin、数据库、API、权限与业务规则。
- 保留节点创建、素材插入、上传、拖放、生成结果、播放、自动整理和历史记录的原调用链。
- 不执行任何付费生成；浏览器回归使用隔离画布夹具和既有本地视频素材。

## Git 回滚机制

| 节点 | 标识 | 用途 |
| --- | --- | --- |
| 原始基线 | `canvas-interaction-system-r0-20260901` | 本次实施前的完整状态 |
| 实施分支 | `feat/canvas-interaction-system-20260901` | 本次画布交互改造 |
| 功能提交 | `34ecf22` / `canvas-interaction-system-r1-20260901` | 尺寸、避让、拖拽、媒体、工具栏、外观与专项测试 |
| 验证提交 | 本文档提交 / `canvas-interaction-system-r2-20260901` | 浏览器回归、待验收项与交付记录 |

## 统一规则

### 素材尺寸

- 图片、视频继续保留原始宽高比。
- 常规素材会放大到可读预览尺寸；极端横图和竖图优先遵守最大边界，不再因为最小宽高冲突而突破画布占位。
- 旧节点仍保留自由缩放、锁定与生成规格语义，不改变接口数据。

### 插入与布局

- 工具栏创建、文件夹、上传图片/视频/音频、素材图片、剪贴板文本、项目章节与批量素材统一复用碰撞检测。
- 首选用户指定位置；发生冲突时由近到远查找相邻空位，避免重复插入完全重叠。
- 自动整理完成后自动适应内容范围，避免整理结果落到当前视口之外。

### 拖拽与媒体

- 每个可拖节点标题前提供相同的显式拖拽把手；文字正文继续支持选择和编辑，不再依赖不可发现的顶部热区。
- 视频和音频资源加载后保持暂停，只有明确点击播放器控件才播放。
- 视频画面手势与节点拖拽分层；在播放器表面移动指针不会触发播放或移动节点，通过统一把手拖动节点。

### 工具栏与外观

- 主 Dock 保留移动、框选、撤销/重做、添加、素材、外观等高频入口。
- 工具栏设置和清空画布收拢到“更多画布操作”；清空不再长期暴露在主 Dock。
- 图片快捷托盘明确命名为“图片素材”，与支持混合媒体的主“素材”入口区分。
- 画布底纹从点阵、方格、纯色扩展为点阵、方格、细网格、稿纸、蓝图、纯色，并兼容旧 `solid` 值。

## 修改文件

- 算法与主题：`web/src/lib/canvas/canvas-node-size.ts`、`canvas-node-placement.ts`、`canvas-theme.ts`
- 节点与媒体：`web/src/components/canvas/canvas-node.tsx`、`canvas-node-content.tsx`
- 工具与外观：`web/src/components/canvas/canvas-toolbar.tsx`、`canvas-asset-tray.tsx`、`infinite-canvas.tsx`
- 页面协调：`web/src/pages/canvas/project.tsx`、`shared.tsx`、`use-canvas-node-operations.ts`、`use-canvas-upload.ts`、`use-canvas-project-lifecycle.ts`
- 工具注册：`web/src/lib/canvas/tool-registry/definitions/main-toolbar-tools.tsx`、`tool-definition.ts`
- 验证：`web/test/canvas-interaction-system.test.ts`、`web/scripts/canvas-p0-chrome-e2e.mjs`

## 验证记录

- `bun test test/canvas-interaction-system.test.ts`：8 项通过。
- `bun run build`：TypeScript 与 Vite 生产构建通过；仅保留项目既有的大 chunk 提示。
- 1440 × 900 浏览器回归：统一拖拽把手、六种底纹、更多面板和图片素材入口通过。
- 本地视频加载后 `autoplay=false`、`paused=true`、`currentTime=0`；播放器表面拖动后仍保持暂停且节点不误移动。
- 浏览器控制台：无 warning/error。

## 风险与后续确认

- 已存在的极端比例媒体会在其既有尺寸校正流程触发时收敛到新边界，位置保持以原中心点为基准。
- 主素材入口支持混合媒体；左下快捷托盘仍专注图片，这是明确的功能分工，不是两个同义入口。
- 上线前建议用一个包含 30 个以上节点、横竖图、视频、音频、文字和文件夹的真实副本做一次用户验收。
