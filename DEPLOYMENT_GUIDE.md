# 统一模型目录开关验收指南

本文档只覆盖“前台模型”开关和统一模型目录的部署后验收。服务器安装、更新、备份和回退请以 [README](README.md#服务器部署) 和 [系统更新文档](docs/content/docs/backend/system-update.mdx) 为准。

## 当前行为

- 未由管理员保存功能开放配置时，`frontendModelsEnabled` 默认为 `false`，创作端使用脱敏的系统渠道模型。
- 开启“前台模型”后，目录返回逻辑模型，任务提交 `logicalModelId`。
- 关闭后，目录返回系统渠道及其公开模型，任务提交 `channelId + model`。
- `POST /api/model-catalog/quote` 在两种模式下都可报价，系统渠道报价与任务预留共用价格档、Token 估算和积分倍率逻辑。

## 部署前验证

在仓库根目录分别执行：

```bash
cd backend
test -z "$(gofmt -l internal/handler/model_catalog.go internal/service/logical_model_quote.go)"
go test ./...

cd ../web
bun install --frozen-lockfile
bun test
bun run build
```

`bun run build` 已包含 TypeScript 检查和前端构建体积预算。不要在文档中写入个人绝对路径，也不要用进程名模糊杀死已运行服务；请通过当前部署的 Compose、systemd 或进程管理器停止或替换实例。

## API 验收

以已登录浏览器为准（接口需要会话 Cookie）：

1. `GET /api/model-catalog`
   - 开启前台模型：`data.source === "frontend"`，`data.models` 非空。
   - 关闭前台模型：`data.source === "system"`，`data.channels` 只包含已启用系统渠道及已启用模型。
2. `POST /api/model-catalog/available`
   - 传入 `capability`、`operation`、`inputs` 和 `options`，确认只返回能执行当前规格的模型。
3. `POST /api/model-catalog/quote`
   - 请求体为 `{"modelId":"...","intent":{"capability":"image","operation":"text_to_image","options":{}}}`。
   - 开启前台模型时，`modelId` 使用逻辑模型 ID；关闭时使用目录中的系统渠道模型 ID。
   - 成功响应包含 `billingMode`、`quantity`、`amountMicrocredits` 和 `estimated`；停用模型、能力不匹配或未命中价格档应返回明确的 4xx，不应返回 501。

## 页面验收

1. 管理员在“功能开放”中切换“前台模型”。
2. 关闭时，管理侧不显示前台模型入口，创作端显示系统渠道模型。
3. 开启时，创作端显示逻辑模型，已下架或无可用路由的模型不可提交。
4. 切换图片质量、视频分辨率和时长时，确认报价立即更新。
5. 如要进行真实生成，先确认预算和模型渠道；最终核对页面报价、任务冻结和账单结算。

## 故障定位

- `401`：会话缺失或过期，先重新登录。
- 目录为空：检查当前模式下是否有已启用、能力匹配且具有有效价格档的模型。
- 报价被拒绝：检查 `modelId`、`intent.capability`、图片质量、视频分辨率/时长和对应价格档。
- 开关已改但页面未更新：检查 `/api/auth/session` 和 `/api/model-catalog` 响应，再确认浏览器未使用旧版静态资源。
