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
- Token 计费提示独立为警示摘要，明确“积分/百万 Token”和预授权、实际用量结算规则；不再将 Token 单价挤入提交按钮。固定积分计价仍原样显示预估积分。
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

## 修改文件

- `web/src/pages/create/creation-empty-state.tsx`
- `web/src/pages/create/creation-workspace.css`
- `web/src/pages/create/index.tsx`
- `docs/design/pc-user-ui-sessions/S06-create.md`

## 提交与回滚点

- `09a636d` `refactor(create): reshape PC creation workspace`
- 本记录提交 SHA 由 Git 历史和集成台账登记。

## 风险与依赖

- 依赖 R2/R3 基线 `b66da08` 已定义冻结的 `--app-*` Token、224/64 侧栏、52px 顶栏和 PC 页面骨架。
- 页面仍复用现有 `GenerationToolCard`、`AssetLibraryPickerModal`、`CanvasPromptOptimizerDrawer` 和 `ModelPicker`；本会话不修改公共组件。
- Create 本地原有没有新增“立即取消任务”的页面 API。本次完整呈现任务中心回传的 cancelled 状态并保留重试，没有在前端伪造取消请求或改变任务幂等/恢复逻辑。
- CSS 中对旧全局 Create 规则使用了页面专属选择器覆盖；后续集中测试需覆盖浅/深主题、1024px 下限、较长模型名称、六项视频配置和 1/2/4 张批量结果。
- 本阶段未启动服务、未端到端操作上传/生成，用于避免在页面并行重构阶段改变外部状态。

## 行为保护

- API、权限、计费、模型能力和业务规则：未修改
- 路由、查询参数、功能开关和鉴权：未修改
- 文本流式生成、图/视频批量、请求时序、幂等/恢复、任务订阅、取消/失败/重试：保持原行为
- 素材上传、本地物化、Eagle、素材库、`@` 引用、首尾帧、音频、加入画布和下载：保持原回调和数据路径
- Token 计费数值与预授权逻辑：未修改，仅调整文案和展示位置
- Admin、后端、数据库、services、stores、router、layout 和公共 UI：未修改
- `<1024px` 信息架构和移动端行为：未重构

## 验证

- 文件所有权检查：通过；代码仅修改 `web/src/pages/create/**`，另有本会话记录。
- 禁区检查：未修改 globals、theme、layout、公共 UI、services、stores、router、Admin 或后端。
- 业务范围复审：提交前逐段检查 `index.tsx` diff，业务 state、effect、生成/上传/恢复函数与请求调用未变。
- `git diff --check`：通过。
- 完整测试、类型检查、构建、路由、权限、上传和生成回归：未运行，按总计划在全部页面完成后集中执行。

## 回滚

- 集成前：丢弃 `refactor/pc-ui-r5-create` 分支或删除本 worktree 即可，不影响基线。
- 集成后：使用 `git revert 09a636d` 回滚 Create 代码，再回滚本记录提交；不使用强制重置。
