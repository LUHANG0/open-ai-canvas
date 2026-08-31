# S06 · Create 创作工作台

- 会话：PC 用户端 R5 Create
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`、`docs/design/pc-user-ui-refactor-plan.md`
- 分支：`refactor/pc-ui-r5-create`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-r5-create`
- 基线 SHA：`b66da08`
- 允许文件：`web/src/pages/create/**`、文件名明确属于 create/creation 的专项测试、本记录
- 禁止文件：Admin、后端、数据库、API、services、stores、router、layout、公共 UI、全局样式、主题及其他会话目录

## 完成内容

- 重建 PC 新建空态的层级：标题、说明、“灵感起点”技能卡与 Composer 形成明确的首次创作路径。
- 保留并强化参考素材架：“本机上传”与“素材库”两个永久入口均保留，上传中、失败、拖入、替换、无效引用和首尾帧角色使用中性状态表面。
- 重组提示词工作区和配置 Dock：PC 端显示类型、模型、方式、规格、时长和声音字段标签，宽度不足时由配置组内换行，不隐藏功能。
- Token 计费提示在 PC 端独立为警示摘要，保留原有“积分/百万 Token”和预授权、实际用量结算文案；不再将 Token 单价挤入提交按钮。固定积分计价仍原样显示预估积分。
- 统一连续对话的用户消息、AI 标识、模型/状态徽标、文本流、生成中占位、失败/取消/重试、图片/视频结果、结果明细与操作区。
- 统一分镜工作台的顶部工具条、镜头时间线浮层、镜头卡、用户/AI 交接、生成管线、结果和下一镜待撰写状态。
- 统一历史 Drawer、参数和模式浮层、媒体预览 Modal 的表面、边框、阴影、选中和键盘焦点反馈。
- 增加 `aria-busy`、动态 `role=status`、错误 `role=alert` 及生成中/失败/取消的可辨识状态。
- 所有 PC 专项样式限定在 `@media (min-width: 1024px)`，并消费冻结的 `--app-*` Token；保留现有 Token 和安全字面值 fallback。配置字段 wrapper 在非 PC 断点使用 `display: contents`，不改移动端布局 DOM 行为。

## 旧分支审查与取舍

已只读审查冻结分支 `feat/create-uiux-polish-f41be73` 的 5 个提交：

- `dc773c5` `docs(create): 创作页 - 记录 UI UX 优化基线`
- `713416d` `feat(create): 创作页 - 优化信息层级与生成配置`
- `ed8adf8` `refactor(create): 创作页 - 撤回移动端专用改造`
- `b797a25` `docs(create): 创作页 - 记录验证与交付证据`
- `7690d61` `docs(create): 创作页 - 补齐阶段提交台账`

采用：空态分区标题、Token 结算摘要、配置字段标签、状态表面和不在提交按钮重复 Token 单价的纯 UI 思路。

放弃：整分支合并、旧 `workspace-*` Token 作为主合同、移动端专项改造及任何业务状态拆分。本次以 R2/R3 的 `--app-*`、224/64/52 壳层和 10px 外壳间隙重写，未 cherry-pick 旧提交。

## 交叉审查修复

交叉审查后建立修复检查点 `eab0c28`：

- 将 Create 根级 `--app-*` Token 映射完整移入 `@media (min-width: 1024px)`；全局浅色、深色 `--creation-*` 恢复为基线值。
- 空态卡区的基线宽度与间距、Token 提示的 DOM 与文案恢复为 `b66da08` 行为；新增“灵感起点”标题在 `<1024px` 隐藏，仅 PC 显示。
- 配置字段 wrapper 在 `<1024px` 仅使用 `display: contents`，字段标签隐藏，因此原有移动工具条的控件顺序、滚动和点击区域不变。
- 32 个新增 `!important` 全部移除；文件现有 `!important` 总数由审查前 148 回落到基线 116，基线相对新增数为 0。

### `!important` 逐项审计

| 组别 | 数量 | 处理与理由 |
| --- | ---: | --- |
| Composer 常态与 focus 阴影 | 2 | 删除覆盖；保留基线无阴影合同，PC 焦点由统一 `outline` 表达，避免与旧 Composer 强覆盖继续竞争。 |
| 参考素材操作按钮高度 | 1 | 删除优先级升级；页面末端 PC 作用域的普通声明足够约束自有按钮。 |
| 配置按钮高度、边框、圆角、背景、文字 | 5 | 删除；基线按钮规则继续负责稳定控件盒模型，PC 根 Token 在断点内提供颜色映射。 |
| 模型选择器宽度 | 1 | 删除；使用普通 PC 作用域声明，允许既有窄宽规则继续降级。 |
| 配置按钮 hover 边框与背景 | 2 | 删除；保留普通作用域状态声明，不再压过组件自身禁用/展开状态。 |
| 声音选中态边框、背景、文字 | 3 | 删除；普通 `[aria-pressed=true]` 选择器已能表达状态，不需要强制覆盖。 |
| 提交按钮最小宽度与高度 | 2 | 删除；沿用现有提交组件尺寸，避免破坏其 pending/cancel 图标盒模型。 |
| Portal 表面边框、圆角、背景、文字、阴影 | 5 | 删除；既有浮层主题规则继续作为第三方 Portal 兼容层，PC 规则只做普通优先级补充。 |
| Portal 标题文字 | 1 | 删除；沿用既有浅/深主题标题色，避免新增第二层强覆盖。 |
| Portal 辅助文字 | 1 | 删除；沿用既有浮层辅助色。 |
| Portal 选项常态边框、背景、文字 | 3 | 删除；既有选项主题规则保持不变。 |
| Portal hover 边框、背景、文字 | 3 | 删除；既有 hover 合同保持不变。 |
| Portal selected 边框、背景、文字 | 3 | 删除；既有 selected 合同保持不变。 |

没有保留任何本轮新增 `!important`；第三方 Portal 也未新增例外。

## 修改文件

- `web/src/pages/create/creation-empty-state.tsx`
- `web/src/pages/create/creation-workspace.css`
- `web/src/pages/create/index.tsx`
- `docs/design/pc-user-ui-sessions/S06-create.md`

## 提交与回滚点

- `09a636d` `refactor(create): reshape PC creation workspace`
- `eab0c28` `fix(create): protect mobile styles and trim overrides`
- 本记录提交 SHA 由 Git 历史和集成台账登记。

## 风险与依赖

- 依赖 R2/R3 基线 `b66da08` 已定义冻结的 `--app-*` Token、224/64 侧栏、52px 顶栏和 PC 页面骨架。
- 页面仍复用现有 `GenerationToolCard`、`AssetLibraryPickerModal`、`CanvasPromptOptimizerDrawer` 和 `ModelPicker`；本会话不修改公共组件。
- Create 本地原有没有新增“立即取消任务”的页面 API。本次完整呈现任务中心回传的 cancelled 状态并保留重试，没有在前端伪造取消请求或改变任务幂等/恢复逻辑。
- CSS 中对旧全局 Create 规则使用页面专属普通优先级选择器；没有新增 `!important`。后续集中测试需覆盖浅/深主题、1024px 下限、较长模型名称、六项视频配置和 1/2/4 张批量结果。
- 本阶段未启动服务、未端到端操作上传/生成，用于避免在页面并行重构阶段改变外部状态。

## 行为保护

- API、权限、计费、模型能力和业务规则：未修改
- 路由、查询参数、功能开关和鉴权：未修改
- 文本流式生成、图/视频批量、请求时序、幂等/恢复、任务订阅、取消/失败/重试：保持原行为
- 素材上传、本地物化、Eagle、素材库、`@` 引用、首尾帧、音频、加入画布和下载：保持原回调和数据路径
- Token 计费数值、文案与预授权逻辑：未修改，仅在 PC 断点重排视觉
- Admin、后端、数据库、services、stores、router、layout 和公共 UI：未修改
- `<1024px` 信息架构和移动端行为：未重构

## 验证

- 文件所有权检查：通过；代码仅修改 `web/src/pages/create/**`，另有本会话记录。
- 禁区检查：未修改 globals、theme、layout、公共 UI、services、stores、router、Admin 或后端。
- 业务范围复审：提交前逐段检查 `index.tsx` diff，业务 state、effect、生成/上传/恢复函数与请求调用未变。
- PC 断点审查：根 Token、空态标题/尺寸和 Token 提示增强均位于 `@media (min-width: 1024px)`；media 外新增规则只有隐藏 PC 空态标题、配置 wrapper `display: contents` 与隐藏字段标签三项移动保护规则。
- `!important` 审查：`b66da08` 为 116，当前为 116；`git diff --unified=0 b66da08 -- web/src/pages/create | rg '^\+.*!important'` 无输出。
- `git diff --check`：通过。
- 完整测试、类型检查、构建、路由、权限、上传和生成回归：未运行，按总计划在全部页面完成后集中执行。

## 回滚

- 集成前：丢弃 `refactor/pc-ui-r5-create` 分支或删除本 worktree 即可，不影响基线。
- 集成后：先 `git revert eab0c28` 回滚交叉审查修复，再 `git revert 09a636d` 回滚 Create 重构，最后回滚文档提交；不使用强制重置。
