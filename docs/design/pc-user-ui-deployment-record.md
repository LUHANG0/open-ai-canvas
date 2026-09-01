# PC 用户端部署记录

## 2026-09-01 Brand V2 本地部署

| 项目     | 结果                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 部署时间 | 2026-09-01 09:06 CST                                                    |
| 目标仓库 | `/Users/hanglu/Documents/影策/open-ai-canvas`                           |
| 目标分支 | `main`                                                                  |
| 合并提交 | `54eaf9d`（`refactor/pc-ui-brand-v2-20260901`，使用 `--no-ff` 合并）    |
| 受测代码 | `5208cd0`（`pc-user-ui-brand-v2-r4-tested-20260901`）                   |
| 树一致性 | 受测代码与合并提交的 Git tree 完全一致                                  |
| 远端状态 | 未推送                                                                  |
| 禁改范围 | 后端、Admin 页面/样式、services、stores、router、globals 相对 R8 零差异 |

### 构建与服务

- 在原项目 `web` 目录重新执行 `bun run build` 成功，共转换 13,510 个模块；只有既有的大 chunk 警告。
- 前端仍使用唯一的 `yingce-web` Screen，监听 `*:8888`，进程 PID `73948`。
- 前端代理目标仍为 `http://127.0.0.1:8080`。
- 后端未重启、未修改，继续监听 `127.0.0.1:8080`，PID 仍为 `21178`。
- 日志位置保持 `.local/web.log` 与 `.local/backend.log` 不变。

### 部署后验证

- `GET /`、`GET /@vite/client`、`GET /api/health`、`GET /api/auth/session` 均返回 `200`。
- 合并提交的代码树与已完成 1123/1123 官方测试、五档 PC 视口 30/30 和 768px 移动端 11/11 回归的受测代码树一致。
- Brand V2 详细结果见 `docs/design/pc-user-ui-brand-v2-test-report.md`。

### 回滚

- R8 部署基线：`pc-user-ui-brand-v2-r0-20260901`。
- 公共基础层：`pc-user-ui-brand-v2-r2-foundation-20260901`。
- 全页面代码点：`pc-user-ui-brand-v2-r3-pages-20260901`。
- 集中测试通过点：`pc-user-ui-brand-v2-r4-tested-20260901`。
- Brand V2 部署点：`pc-user-ui-brand-v2-deployed-20260901`。
- 代码恢复使用 `git revert 54eaf9d` 或按阶段逆序 revert，禁止 `reset --hard` 与强推。

## 2026-09-01 本地上线验证

| 项目     | 结果                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 部署时间 | 2026-09-01 07:28 CST                                                       |
| 目标仓库 | `/Users/hanglu/Documents/影策/open-ai-canvas`                              |
| 目标分支 | `main`                                                                     |
| 部署代码 | `c8751e309567145a4fa81ba3d293e6509c4c8919`（`pc-user-ui-r8-20260901`）     |
| 合并方式 | `f41be733` → `c8751e3`，`git merge --ff-only refactor/pc-user-ui-20260901` |
| 远端状态 | 未推送；本地 `main` 领先 `origin/main` 84 个提交                           |
| 禁改范围 | `backend/**`、Admin、services、stores、router 相对 R0 均为零差异           |

## 构建与服务替换

- 原项目执行 `bun run build` 成功；共转换 13,508 个模块，只有既有的大 chunk 提示。
- 只替换前端 `yingce-web` Screen 服务，端口保持 `8888`，代理目标保持 `http://127.0.0.1:8080`。
- 前端监听进程由 PID `62972` 替换为 PID `60100`，新 Screen 为 `60095.yingce-web`。
- 后端未重启、未修改；`8080` 监听 PID 在替换前后均为 `21178`。
- 前端继续监听 `*:8888`，后端继续只监听 `127.0.0.1:8080`。
- 日志继续写入 `.local/web.log`；后端日志仍为 `.local/backend.log`。

## 部署后验证

- `GET http://127.0.0.1:8888/`：`200`。
- `GET http://127.0.0.1:8888/@vite/client`：`200`。
- `GET http://127.0.0.1:8888/api/health`：`200`。
- 1440 × 900 PC 浏览器检查通过；创作页无横向溢出。
- 创作页的本机上传、素材库、模型选择、声音配置和 Token 计费提示均正常显示。
- `/home`、`/create`、`/projects`、`/canvas`、`/tasks`、`/assets`、`/skills`、`/plugins`、`/wallet`、`/settings` 共 10 个主路由均完成渲染，无致命错误文本和页面级横向溢出。

## 回滚与恢复

- 部署标记：`pc-user-ui-deployed-20260901`。
- R8 代码回滚参考：`pc-user-ui-r8-20260901`；原始版本参考：`pc-user-ui-r0-20260901`。
- 本次主分支采用快进合并，没有单独的 merge commit。若整体恢复到 R0，必须按第一父链逆序 `git revert` R0…R8 范围内提交，禁止 `reset --hard` 和强推。
- 服务恢复仍使用唯一的 `yingce-web` Screen 和端口 `8888`；启动前必须先确认端口已释放，避免重复实例。

## 已知部署注意项

- 当前 `8888` 与部署前一致，监听所有 IPv4 接口；是否收紧为回环地址应作为独立运维变更处理。
- 当前运行的是 Vite 开发服务，不是静态生产服务器；上线到公网前仍需另行确认正式托管、TLS、缓存和访问边界。
