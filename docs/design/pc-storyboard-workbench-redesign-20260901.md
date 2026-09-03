# PC 镜头创作导演工作台专项记录

## 范围与约束

- 仅重构 PC 端 `/create` 的镜头创作模式；移动端保留原 DOM、文案和交互。
- 后端、Admin、数据库、API、接口返回格式、权限、计费与业务规则均未修改。
- `globals.css`、router、services、stores 保持冻结。
- 连续对话、镜头创作、图片/视频生成、首尾帧、声音、素材上传、素材库、下载、重新生成、添加到画布等原链路继续复用。

## 信息架构

PC 镜头创作改为导演工作台结构：

1. 顶部固定工具条：镜头轨开关、连续对话/镜头创作切换、新增镜头、新建创作与历史记录。
2. 左侧镜头轨：按稳定镜头 ID 展示顺序、缩略图、脚本摘要与生成状态，独立滚动。
3. 中央结果舞台：集中展示当前镜头的生成中、完成、失败和停止状态；视频完整适配，图片采用主预览与缩略图条。
4. 右侧镜头信息：脚本、参考素材与生成参数独立展示和滚动。
5. 底部镜头输入器：明确“每次提交创建新镜头”，与舞台、信息栏及镜头轨保持正常文档流，不互相遮挡。

## 交互与数据修复

- 镜头选择从数组索引改为消息支持的稳定 ID，异步结果和列表变化不会选错镜头。
- 重试先完成参数、模型和技能校验，再原子替换原消息；失败时保留原镜头，不再提前删除。
- 重试复用原 `shotId`，重试前后 React identity、镜头选中态与轨道位置保持稳定。
- “生成变体”在 PC 端明确改为“复用为新镜头”，恢复提示词、素材和参数后进入新镜头草稿，不误导为原位覆盖。
- `streaming`、`cancelled`、`pending`、`done`、`error` 在 PC 镜头轨和结果卡使用统一状态映射。
- 空白创作页也显示固定模式切换；进入镜头模式后输入占位词从 `SC.01` 开始。
- 镜头轨使用 `<ol>`、原生按钮和 `aria-current`；轨道不存在或收起时不输出失效的 `aria-controls`。
- 1024px 下结果/镜头信息使用同位切换，1280px 及以上同时展示，避免挤压预览。
- 多结果下载收进紧凑菜单；详细说明使用折叠层，主要操作保留在固定标题栏。

## 响应式与视觉规范

- `1024–1279px`：80px 紧凑镜头轨，结果与镜头信息单列切换，配置栏完整收纳。
- `1280–1359px`：216px 镜头轨、280px 信息栏，配置控件使用紧凑宽度。
- `1360px+`：240px 镜头轨、320px 信息栏，主预览获得更完整空间。
- 高度 `≤700px`：压缩镜头上下文、参考素材条、输入区和配置区；舞台内容在自身区域滚动。
- 视频使用 `object-fit: contain`；多图使用主图加缩略图条，点击仍进入原大图预览。
- 新样式全部位于 `creation-workspace.css` 的 PC 媒体查询内，并继续使用现有 `--app-*` 设计 Token。

## 修改文件

- `web/src/pages/create/index.tsx`
- `web/src/pages/create/creation-workspace.css`
- `web/test/create-chat-shot-layout.test.ts`

## 验证记录

| 项目 | 结果 |
| ---- | ---- |
| 模式切换 | 1024px 下连续对话和镜头创作均为 `248 × 36px`，坐标保持 `x=505, y=71` |
| 1024px | 页面无横向溢出；镜头配置栏 `clientWidth=580, scrollWidth=580`；结果与信息视图可切换 |
| 1280px | 镜头配置栏 `clientWidth=700, scrollWidth=700`；216px 轨道、结果舞台与 280px 信息栏同时可见 |
| 1440px | 工作区 `1184 × 774px`；240px 轨道、主舞台和 320px 信息栏无重叠 |
| 低高度 | `1280 × 640` 下舞台与输入器各占独立网格行，多图完整适配且页面无溢出 |
| 状态与操作 | 生成中、失败、已停止、已完成逐项切换通过；重试、变体、画布与多结果下载入口保留 |
| 移动端隔离 | `390 × 844` 下 PC 工具条与导演工作台 DOM 数量均为 0，继续渲染原移动端入口 |
| TypeScript | `bun run typecheck` 通过 |
| 前置门禁 | `bun run pretest`：25 pass，0 fail，348 assertions |
| 专项与关联测试 | 50 pass，0 fail，556 assertions |
| 全量测试 | 主测试 1113 pass，跨运行时测试 1 pass，0 fail |
| 生产构建 | `bun run build` 通过，13,510 modules transformed |
| 差异检查 | `git diff --check` 通过；禁改目录无差异 |

浏览器验收使用本地真实登录态完成，但没有提交任何付费生成请求；视觉状态使用临时本地夹具验证，验收后已从代码和本地创作记录中完整删除。

## Git 回滚节点

- 开始前基线 Tag：`pc-storyboard-workbench-r0-20260901`（`cc9992b`）。
- 候选实现提交：`a79b744`（`refactor/storyboard-workbench-20260901`）。
- 完成候选 Tag：`pc-storyboard-workbench-r1-20260901`（`a79b744`）。
- 主分支合并提交：`449ee45`。
- 部署完成 Tag：`pc-storyboard-workbench-deployed-20260901`。
- 回滚优先使用 `git revert` 撤销本专项提交或合并提交，不执行覆盖式回滚。

## 部署记录

- 原 `yingce-web` Screen 已原位替换，继续监听 `*:8888`，未启动第二个长期前端服务。
- 新前端进程 PID `92625`，工作目录为主分支 `/Users/hanglu/Documents/影策/open-ai-canvas/web`。
- `/create` 返回 HTTP 200；主分支浏览器复核无横向溢出，模式开关位置稳定，素材上传和素材库入口均可见。
- 后端仍为原进程 PID `21178`，继续监听 `127.0.0.1:8080`；本专项未修改或重启后端。

## 已知边界

- 空会话首次生成前继续使用统一创作落地页；进入镜头模式后会显示固定模式开关与 `SC.01` 输入提示，首条生成后进入完整导演工作台。
- 低于约 520px 的极端 PC 窗口高度不作为本阶段目标；正常 PC 低高度已覆盖到 640px。
- 项目既有的大 chunk 构建提示仍存在，建议作为独立性能专项处理。

## R2 真实数据细化记录（2026-09-01）

### 目标与回滚点

- 工作分支：`refactor/storyboard-workbench-polish-20260901`。
- 本轮开始前 Tag：`pc-storyboard-polish-r0-20260901`（`744a92b`）。
- R2 实现提交：`1a7013c`（`refactor(create): 细化镜头工作台真实数据交互`）。
- R2 完成候选 Tag：`pc-storyboard-polish-r1-20260901`。
- 本轮继续遵守 PC 前端限定范围；后端、Admin、API、数据库、权限、计费和业务规则均未修改。

### 细化内容

- 镜头轨道使用真实提示词作为两行标题，并将类型、时长与生成状态分层展示；缩略图状态点覆盖完成、失败、生成中、停止和草稿。
- 当前镜头标题由固定“镜头 N”改为真实提示词，长标题自动截断；“复用为新镜头”提升为明确的主操作，添加到画布、下载等原入口保留。
- 镜头信息补充“生成方式”，继续展示类型、模型、画幅、清晰度、时长、声音与参考素材。
- 下一镜草稿态改为紧凑镜头简报板，增加“主体与动作 / 景别与运镜 / 场景与氛围”撰写提示；只增强前端引导，不改变提交数据和生成逻辑。
- 轨道悬停、选中、状态和预览舞台层级进一步统一，减少无意义边框和背景噪声，并补充 `prefers-reduced-motion` 降级。

### 真实历史回归

使用浏览器现有登录态与 2026-09-01 真实历史记录复核，未发起新的付费生成请求：

| 场景 | 结果 |
| ---- | ---- |
| SC.01 失败视频 | 失败提示、重试入口、脚本、参考素材和参数完整，镜头轨状态一致 |
| SC.02 已完成视频 | 视频预览、下载、添加到画布、复用为新镜头和镜头信息完整 |
| SC.03 下一镜草稿 | 草稿轨道、镜头简报、输入器上下文与收起入口一致，未覆盖舞台或时间线 |
| 轨道收起 | 主舞台扩展至剩余宽度，轨道 DOM 收起，页面无横向溢出 |
| 1024 × 768 | 80px 紧凑轨道生效；舞台底边与输入器顶边均为 `524px`，无重叠、无横向溢出 |
| 1024 镜头信息 | 结果/信息同位切换正常，真实视频 7 项参数完整，页面无横向溢出 |
| 默认 1680 × 818 | 240px 轨道、结果舞台和 320px 信息栏稳定，真实视频标题与操作无遮挡 |

### 本地入口约定

- 本地浏览器回归统一使用 `http://localhost:8888`。`localhost` 与 `127.0.0.1` 属于不同浏览器 Origin，IndexedDB/localForage 中的历史记录不会互通。
- 不增加前端强制跳转或后端重定向，避免丢失既有 Cookie、登录态和本地创作历史；正式环境只有一个域名，不受此本地开发边界影响。

### R2 修改文件

- `web/src/pages/create/index.tsx`
- `web/src/pages/create/creation-workspace.css`
- `web/test/create-chat-shot-layout.test.ts`
- `web/test/create-canvas-handoff.test.ts`
- `docs/design/pc-storyboard-workbench-redesign-20260901.md`

### R2 风险与依赖

- 视觉细化依赖现有 `--app-*` Token，不引入第三方 UI 依赖。
- 镜头标题直接复用现有提示词字段，不改变历史数据结构；无提示词时继续回退到“镜头 N”。
- 本轮浏览器复核覆盖真实失败、完成和草稿状态；生成中状态继续由既有自动化测试与状态映射门禁覆盖。

### R2 集中验证

| 项目 | 结果 |
| ---- | ---- |
| 前置门禁 | 25 pass，0 fail，361 assertions |
| 镜头工作台专项 | 9 pass，0 fail，226 assertions |
| 主测试 | 1113 pass，0 fail，7012 assertions |
| 跨运行时测试 | 1 pass，0 fail，8 assertions |
| TypeScript 与生产构建 | 通过，13,510 modules transformed |
| 差异检查 | `git diff --check` 通过；禁改目录无差异 |

## R3 内容显示细化记录（2026-09-01）

### 调整内容

- 回滚基线继续使用 `pc-storyboard-polish-r1-20260901`；本轮仅修改 PC 创作页前端与对应回归门禁。
- R3 实现提交：`b4fed5c`（`refactor(create): 优化镜头内容显示层级`）。
- R3 完成候选 Tag：`pc-storyboard-polish-r2-20260901`。
- 镜头标题栏改为两级信息：第一行显示真实镜头内容，第二行显示类型与模型，状态和主要操作保持独立，避免标题、模型、状态挤在同一行。
- 右侧信息栏去除“镜头信息 / 镜头脚本”的重复命名，统一为“镜头信息 / 创作内容”，并使用 `SC.xx` 标记当前镜头。
- 创作内容改为带轻量引导线的正文段落；生成参数从重复卡片改为紧凑键值行，减少边框噪声。
- PC 镜头模式不再在视频或图片下方显示内容重复的“视频结果 / 导演说明”折叠条；生成结果、时间和操作分别由舞台标题与镜头标题栏承载。

### 浏览器复核

| 场景 | 结果 |
| ---- | ---- |
| 默认 1680 × 818 | 标题两级显示，视频下方无多余折叠条，右侧 7 项参数完整且无需内部滚动 |
| 1024 × 768 结果态 | 长标题按可用空间截断，全部操作保留；页面无横向溢出，舞台与输入器边界一致 |
| 1024 × 768 信息态 | 创作内容和 7 项参数完整显示，信息区 `clientHeight = scrollHeight = 335px` |

### R3 修改文件

- `web/src/pages/create/index.tsx`
- `web/src/pages/create/creation-workspace.css`
- `web/test/create-chat-shot-layout.test.ts`
- `docs/design/pc-storyboard-workbench-redesign-20260901.md`

### R3 集中验证

| 项目 | 结果 |
| ---- | ---- |
| 前置门禁 | 25 pass，0 fail，366 assertions |
| 主测试 | 1113 pass，0 fail |
| 跨运行时测试 | 1 pass，0 fail |
| TypeScript 与生产构建 | 通过，13,510 modules transformed |
| 差异检查 | `git diff --check` 通过；禁改目录无差异 |

## R4 主预览无黑边记录（2026-09-01）

- 回滚基线：`pc-storyboard-polish-r2-20260901`。
- R4 实现提交：`d1afbb3`（`fix(create): 移除视频主预览黑边`）。
- R4 完成候选 Tag：`pc-storyboard-polish-r3-20260901`。
- 视频主预览容器改为读取当前生成设置的真实画幅，不再以横向满宽容器强行包裹视频。
- 保留 `object-fit: contain`，不通过裁切画面消除黑边；容器背景改为透明。
- 默认 `1680 × 818` 下，16:9 视频容器为 `526 × 296px`，视频内容为 `524 × 294px`，无额外黑边。
- `1024 × 768` 下视频容器为 `437 × 246px`；页面无横向溢出，舞台与输入器边界仍为 `524px`。
- 修改范围：`web/src/pages/create/index.tsx`、`web/src/pages/create/creation-workspace.css`、`web/test/create-chat-shot-layout.test.ts` 与本记录。
- 集中验证：前置门禁 25 pass，主测试 1113 pass，跨运行时测试 1 pass，生产构建通过。

## 上线前 P0 回归与前端告警清理（2026-09-01）

### 范围与回滚

- 工作分支：`refactor/storyboard-workbench-polish-20260901`。
- P0 开始前 Tag：`pc-launch-p0-r0-20260901`（`9df4ae4`）。
- 仅修改 PC 前端兼容代码与本记录；后端、Admin、数据库、API 合同、权限、计费和业务规则均未修改。
- 没有发起新的付费生成请求，没有重试失败任务，没有新增、删除或覆盖用户项目和素材。

### 创作主链路回归

| 场景 | 结果 |
| ---- | ---- |
| 真实历史恢复 | 2026-09-01 的 2 镜头会话可恢复；SC.01 失败状态和 SC.02 完成状态完整 |
| 模式切换 | 连续对话与镜头创作按钮在两种模式下均为 `118.5 × 28px`，坐标保持不变 |
| 结果操作 | 视频预览、下载、添加到画布、复用新镜头和失败重试入口均存在；未触发写操作 |
| 镜头轨与草稿 | 轨道可收起和恢复；下一镜草稿可展开和收起，不覆盖舞台或输入区 |
| 素材入口 | 本机上传、素材库入口均存在；素材库展示 17 个账号素材并按模型能力禁用不支持的类型 |
| 生成方式 | 自动判断、文生视频、首/尾帧入口完整；不支持的全模态和音频驱动明确禁用 |
| 可美 Token 模型 | `artsdance-2-5-pro-260801` 显示 `42 积分/百万 Token`，说明完成后按实际 usage 结算 |
| 可美规格 | 720P/1080P、首尾帧、声音、4–30 秒能力可见；提交前按量计费提示正确 |
| 固定价格模型 | `MiniMax-H3-open` 显示 480P/720P 分档及 `0.105–0.175 积分/秒`，5 秒 720P 预估 `0.875` |
| 提交门禁 | 空提示词禁用提交；输入占位内容后按钮启用并显示价格；随后已清空，未提交 |

### PC 页面与交互回归

- 已覆盖 `/home`、`/projects`、`/canvas`、`/tasks`、`/assets`、`/skills`、`/plugins`、`/wallet`、`/settings`。
- 设置页进一步覆盖个人渠道、模型选择、生成偏好、提示词偏好、对象存储和问题诊断 6 个分区。
- 任务详情、素材详情、插件文档和项目创建表单均可正常打开与关闭；全部页面文档级横向溢出为 `0px`。
- 浏览器复验未发现页面级错误、警告或可见 `alert`；本轮不测试 Admin 页面，也未修改 Admin 代码。

### 前端兼容清理

Ant Design 新版会将已废弃属性记录为控制台错误。本轮保持原交互语义不变，统一替换为新版写法：

- Modal：`maskClosable` → `mask.closable`。
- Modal：`focusTriggerAfterClose` → `focusable.focusTriggerAfterClose`。
- Drawer：`width` → `size`。

修改文件：

- `web/src/components/assets/asset-library-picker-modal.tsx`
- `web/src/components/canvas/canvas-upload-modal.tsx`
- `web/src/components/ui/pc/forms.tsx`
- `web/src/pages/plugins/plugin-details-dialog.tsx`
- `web/src/pages/plugins/plugin-documentation-modals.tsx`
- `web/src/pages/projects/index.tsx`
- `web/src/pages/skills/skill-install-modal.tsx`
- `docs/design/pc-storyboard-workbench-redesign-20260901.md`

### 集中验证

| 项目 | 结果 |
| ---- | ---- |
| 前置门禁 | 25 pass，0 fail，369 assertions |
| TypeScript | `tsc --noEmit` 通过 |
| 主测试 | 1113 pass，0 fail，7012 assertions |
| 跨运行时测试 | 1 pass，0 fail，8 assertions |
| 测试合计 | 1139 pass，0 fail |
| 生产构建 | 通过，13,510 modules transformed，约 7.3 秒 |
| 浏览器控制台 | 新开标签页复验创作素材弹窗、任务抽屉、插件文档和项目表单，0 error / 0 warning |
| 差异检查 | `git diff --check` 通过；禁改目录无差异 |

### 遗留项

- Vite 仍提示部分产物压缩后超过 500 kB，属于既有的非阻断性能项；建议上线稳定后单独进行路由级拆包和动态加载优化。
- P0 初始回归未触发真实付费生成；随后已按下方 MiniMax 冒烟记录补充一次完整付费链路验证。

## MiniMax 实际付费冒烟（2026-09-01）

- 测试模型：`MiniMax-H3-open`。
- 请求规格：文生视频、16:9、480P、5 秒、有声音，不携带参考素材。
- 测试提示词：`清晨海边，一只白色纸船随着微风缓缓前行，镜头平稳推进，柔和电影感光线。`
- 任务 ID：`44525adc5b685b6dfc344aa2bac87d8e`。
- 提交前预估：`0.525` 积分；任务完成后结算：`0.525` 积分。
- 精确余额：`84.194468 → 83.669468`；积分流水于 `2026/09/01 18:57:22` 记录 `-0.525`。
- 返回视频：MP4、`864 × 480`、`5.167s`、约 `976 KB`；浏览器媒体 `readyState = 4`。
- 创作页可预览，下载和添加到画布链接均已生成；页面刷新后对话与结果可恢复。
- 任务中心状态为“已完成 / 已结算”；素材库总数 `17 → 18`，视频素材 `8 → 9`。
- 前端、后端继续使用原进程和原端口；本次验证没有修改后端、Admin、数据库、API 合同或计费规则。

### 冒烟观察项

- 任务成功瞬间出现两条相同的 `AbortError: The operation was aborted` 资源化警告。
- 实际资源化成功：任务输出包含资源 ID，创作页预览和下载正常，素材库新增记录，刷新恢复正常。
- 结论：当前属于并发观察生命周期取消产生的非阻断控制台噪声，不影响本次链路；后续可在前端对预期 `AbortError` 静默处理，避免生产控制台误报。

## MiniMax 资源化取消误报修复（2026-09-01）

### 问题与修复

- 付费冒烟任务已经成功生成、资源化并恢复，但任务完成瞬间出现两条相同的 `AbortError` 警告。
- 原因是创作页订阅依赖变化或页面卸载时会主动取消旧的结果资源化观察；另一次有效观察已经成功完成，旧观察的取消不属于生成或资源化失败。
- `materializeCreationTaskResults` 现在先识别预期的取消信号，直接保留原任务状态，不再输出失败警告，也不再给已成功任务写入 `creationError`。
- 真实的网络、接口或资源化错误仍按原逻辑输出警告并记录错误，本次没有放宽真实失败处理。
- 修改范围仅包含 PC 创作页前端、对应回归门禁与本记录；后端、Admin、数据库、API 合同、权限、计费和业务规则均未修改。

### 修改文件

- `web/src/pages/create/index.tsx`
- `web/test/create-chat-shot-layout.test.ts`
- `docs/design/pc-storyboard-workbench-redesign-20260901.md`

### 集中验证

| 项目 | 结果 |
| ---- | ---- |
| 资源化取消专项门禁 | 10 pass，0 fail，239 assertions |
| 前置门禁 | 26 pass，0 fail，374 assertions |
| 主测试 | 1113 pass，0 fail |
| 跨运行时测试 | 1 pass，0 fail |
| 测试合计 | 1140 pass，0 fail |
| TypeScript 与生产构建 | 通过，13,510 modules transformed |
| 浏览器快速切页复验 | `/create` 加载后切换 `/tasks`，0 error / 0 warning |
| 差异检查 | `git diff --check` 通过；禁改目录无差异 |
