# PC 用户端已知问题

## 上线前优先验收

- 本轮没有使用测试凭据或修改用户数据；真实生成、上传、计费/退款、OAuth、Eagle、OSS、RunningHub 和 Comfy 需在隔离账号与测试凭据下完成。
- 当前有 9 条任务、16 个素材、33 个技能可用于只读回归，但没有项目和画布数据；Projects 六阶段与 Canvas 保存/分享需夹具。
- 已完成 Chromium 实测与 Director Chrome E2E，Firefox/Safari 尚未做真实浏览器验收。

## 保留的业务基线缺口

- Tasks 默认只读取 30 条，页面却允许 20/50/100 的客户端分页。
- Home 请求 300 条任务，但默认 reader 单次最多 100 且没有消费 cursor。
- Eagle 固定 `limit=100, offset=0`，超过 100 条后不会进入本地分页。
- Projects 搜索和排序只作用于已经无限加载的数据，后续页项目可能暂时搜不到。
- `/home` 当前没有 `RequireAuth`，本轮保持既有路由合同。
- `/test-voice-recording` 是生产可达的内部原型，本轮保留而未扩展业务。

## 工程债务

- `bun run format:check` 仍会报告 317 个历史文件；本轮相对 R0 没有新增格式退化，不在上线前做全仓机械重写。
- `bun test` 全发现有两个未纳入官方脚本的旧测试问题；`bun run test` 官方 1116/1116 通过。
- Canvas Agent 有一个既有 poll-heartbeat 异步测试会导致 7 条 cancelled；Canvas Agent 相对 R0 零变更，构建通过。
- 浏览器控制台仅有 AntD `Modal.maskClosable`、`Modal.focusTriggerAfterClose`、`Drawer.width` 弃用警告。
- 生产构建有部分 chunk 超过 500 kB，主要来自 Canvas/3D/媒体/编辑器依赖。
- Canvas 历史全局规则在 1024px 与 PC 私域断点同时命中，当前已有更具体的私域复位保护；全局断点清债延后。
- 当前缺少全用户端 Playwright E2E 和可版本化的视觉基线；现有真浏览器自动化只覆盖 Director。
