# PC 用户端集中测试报告

> 日期：2026-09-01；分支：`refactor/pc-user-ui-20260901`；R7 代码点：`4705169` / `pc-user-ui-r7-20260901`

## 结论

PC 用户端重构已通过官方单测、类型检查、生产构建、Director Chrome E2E 与本地真实浏览器回归。本轮发现并修复了 Create Token 计费说明在 PC 宽屏下逐字竖排、图标错位，以及 Assets 批量栏文案契约漂移。

未发现由本次重构引入的 P0/P1 阻断项。因为没有修改用户数据或传输第三方凭据，真实生成、上传、OAuth、Eagle、OSS、RunningHub、Comfy 以及 Firefox/Safari 回归仍需上线前的隔离测试数据与专用凭据。

## 自动化门禁

| 检查                         | 结果     | 说明                                                                     |
| ---------------------------- | -------- | ------------------------------------------------------------------------ |
| `git diff --check`           | 通过     | 当前提交与工作树均无 whitespace error                                    |
| 变更文件格式差分             | 通过     | 相对 R0 无新增 Prettier 退化；本轮新文件和新退化文件已格式化             |
| `bun run format:check`       | 基线非绿 | 全仓仍有 317 个历史格式文件；本轮不做 317 文件的高扰动机械重写           |
| `bun run typecheck`          | 通过     | `tsc --noEmit`                                                           |
| `bun run test`               | 通过     | Admin 9/9，主测试 1106/1106，跨 Runtime 1/1；合计 1116/1116              |
| `bun test` 全发现补充        | 基线非绿 | 123 文件，1279 通过；剩余两个旧测试问题均能在 R0 或早期迁移提交复现      |
| `bun run build`              | 通过     | Bridge、TypeScript 与 Vite 生产构建通过；13,508 个模块                   |
| `bun run test:director:e2e`  | 通过     | Chrome A–F 六场景 58/58，临时端口、进程与 profile 已清理                 |
| Canvas Agent `bun run build` | 通过     | Canvas Agent 相对 R0 零代码变更                                          |
| Canvas Agent `bun run test`  | 基线非绿 | 309 通过、7 cancelled、5 skipped；取消集中在既有 poll-heartbeat 异步测试 |

### 补充全发现测试的两个既有问题

1. `project-chapter-skill-runtime.test.ts` 仍断言旧的二参数源码形态，但 R0 实现已经传入含 `dialogue` 的第三参数。
2. `canvas-skill-mentions.test.ts` 仍导入已在历史迁移提交 `2f6832f` 删除的 `expandSkillMentions` / `renderSkillPrompt`，且一直未纳入官方测试脚本。

## 真实浏览器回归

使用当前登录会话、本地后端 `127.0.0.1:8080` 和临时 Vite 前端端口执行只读回归；未改动既有 `8888` 服务，测试后临时服务已停止。

| 范围            | 结果                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1440px          | Home、Create、Projects、Canvas、Tasks、Assets、Skills、Plugins、Wallet、Settings、Eagle、Admin 全部可达，页面无水平溢出 |
| 1024px PC 边界  | 11 个用户主路由全部可达，无页面级水平溢出，Create 工具栏正常换行                                                        |
| 1920px          | Create、无效公开分享、404 系统页正常，无水平溢出                                                                        |
| 768px 保护检查  | 10 个主路由无页面级溢出，PC-only 规则未强制侵入小屏宽度                                                                 |
| 主题            | Create 亮色/暗色切换正常，表面、文字、计费警告和浮层对比正常                                                            |
| 导航            | Create → Tasks → Settings，以及 Settings `?section=channels` 深链跳转通过                                               |
| Create 核心入口 | “本机上传”、“素材库”可见且可用；视频类型、模型、方式、分辨率、时长、声音控件完整                                        |
| Token 计费      | `42 积分/百万 Token` 和 usage 结算说明同行分层正常，图标与文字不再错位                                                  |
| Console         | 未发现应用异常；仅观察到 AntD `Modal.maskClosable`、`Modal.focusTriggerAfterClose`、`Drawer.width` 弃用警告             |

## API、权限与禁区对照

- API 合同单测已覆盖 `{code,data,msg}`、Cookie、Abort、幂等键、SSE/轮询、视频/图片协议和 Token 计费。
- 相对 R0，`backend/**`、`web/src/pages/admin/**`、`web/src/styles/admin-ui.css`、`web/src/services/**`、`web/src/stores/**` 和路由合同零差异。
- Admin 实测只读数据概览；Admin 专项 9/9 单测通过，没有修改 Admin UI。
- 不使用生产凭据、不新建/删除用户数据、不发起付费生成；所以表单写入、真实上传、生成结算和第三方集成不标记为人工实测通过。

## 上线前仍需的隔离验收

1. 用专用测试账号覆盖游客、普通用户、管理员、禁用用户、功能开关和跨账号隔离。
2. 使用测试凭据完成文/图/视频生成、上传、取消/重试、计费/退款、OSS、Eagle、RunningHub、Comfy、OAuth 和邮件验证。
3. 准备项目、画布和长列表夹具，验收 Projects 六阶段、Canvas 保存/分享、上传部分失败和各页服务端分页。
4. 在 Firefox 和 Safari 完成 1024/1440px 的 sticky、Portal/focus、媒体预览、下载和 WebGL 关键路径。

## 非阻断警告

- Vite 警告部分生产 chunk 超过 500 kB；当前已路由分包，大型 Canvas/3D/编辑器依赖可在上线后做专项性能优化。
- AntD 弃用属性警告不影响当前功能，建议后续以低风险专项替换。
