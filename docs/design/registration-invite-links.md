# 用户管理邀请注册验收记录

本项目在不开放全局公开注册的前提下，为管理员提供单次、限时、可撤销的普通用户邀请链接。本文档是实现、验证证据和回滚边界的单一交付索引。

## 安全与数据边界

- 基线为 `873edfcf1c1285279bb27c9d718f68bd27240fbb`，在独立 `feat/user-registration-invites` 分支和独立 worktree 开发。
- 不读写生产数据，不部署、不推送、不发送真实邮件，不调用付费渠道。
- 原始 token 只在创建响应和短期 HttpOnly Cookie 中存在；持久层只保存 SHA-256。
- 邀请分支的角色由后端固定为 `user`，积分由管理员创建邀请时固定为 50、100 或自定义整数，注册请求不能改写金额。

```mermaid
sequenceDiagram
    participant A as 管理员
    participant B as 匿名浏览器
    participant S as Backend
    participant D as SQLite/PostgreSQL
    A->>S: 创建邀请（1/3/7 天 + 固定积分）
    S->>D: 保存 SHA-256、积分与审计
    S-->>A: 仅一次返回原始 token
    B->>S: 交换 URL token
    S-->>B: HttpOnly / SameSite=Lax Cookie
    B->>B: replace 移除地址栏 token
    B->>S: 提交现有注册接口
    S->>D: 同一事务占用邀请+用户+指定积分+会话
    S-->>B: 自动登录并进入 next/工作台
```

## 验收范围

| 层      | 验收结果                                                                                                                                                        | 尚未执行 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Backend | 权限、状态、哈希、审计、关闭公开注册、并发单次、失败回滚、邀请指定积分、Cookie 属性、SQLite/PostgreSQL Schema 8 和全量 Go 测试均通过                            | 无       |
| Web     | 管理入口、50/100/自定义积分、链接只显示一次、复制成功/失败、状态/撤销、token replace、注册金额提示和各错误态合同；1686 项测试、类型检查、生产构建与体积预算通过 | 无       |
| 闭环    | 隔离 SQLite 已完成管理创建 → 匿名交换 → 地址栏清理 → 注册 → 自动登录 → 已使用 → 再访拒绝；已另测过期和撤销                                                      | 无       |

## 可复现命令

```bash
cd backend
go test ./internal/database ./internal/service ./internal/handler
go test ./...

cd ../web
bun test test/registration-invites.test.ts test/auth-login-experience.test.ts
bun test
bun run typecheck
bun run build
```

PostgreSQL 仅使用专用测试库：

```bash
cd backend
CANVAS_TEST_POSTGRES_DSN='<isolated-test-dsn>' \
  go test ./internal/database ./internal/service \
  -run 'Postgres.*RegistrationInvite' -count=1

CANVAS_TEST_POSTGRES_DSN='<isolated-test-dsn>' go test ./... -count=1
```

不得用生产 DSN 替代缺失的隔离 PostgreSQL。

## 浏览器与视觉证据

浏览器验收使用 `CANVAS_REGISTRATION_ENABLED=false`、独立临时数据目录和本地端口，不发送邮件或触发任何付费渠道。结果如下：

- 首位本地管理员创建 7 天、275 自定义积分邀请；匿名会话交换后地址从 `?invite=...` 立即替换为 `?invited=1`，并显示“注册成功后将自动获得 275 积分”。
- 无邮箱和验证码创建 `user` 角色账号，成功后自动进入创作台；工作台余额、数据库积分账户、邀请金额和积分流水均为 275，管理员记录显示“已使用”“注册积分：275”和使用用户名。
- 同一链接的新匿名会话显示“邀请已使用”；另一个链接经管理端撤销后显示“邀请已撤销”；第三个链接在隔离数据库中前移到期时间后显示“邀请已过期”。三种终态地址栏均无 token。
- Clipboard 正常路径显示复制成功；注入拒绝时显示“复制失败，请手动选中链接复制”。Esc 关闭含一次性链接的抽屉时显示确认，Tab 可从关闭按钮进入用户名字段，Enter 触发表单原生校验。
- 1366×768 和 390×844 的亮暗主题截图均无横向溢出；移动端抽屉实测宽度为 390px。受邀注册采用既有深色电影入口视觉，但分别在亮、暗应用主题状态下复验。
- 干净的受邀、已撤销、已过期会话无页面异常，网络记录无 `4xx/5xx`。

本地证据位于 `.local/evidence/registration-invites/`（目录被 Git 忽略，避免把一次性链接截图提交到仓库）。其中包括 SQLite/PostgreSQL 全量与专项测试日志、构建日志、状态页截图和四组桌面/移动端视觉截图。

## PostgreSQL 证据链

| Evidence | Finding | Path |
| --- | --- | --- |
| PostgreSQL 16 独立容器中的 Schema 6→8 和真实 Schema 7 旧表升级测试均通过；旧邀请回填为 100 积分，字段为 `NOT NULL DEFAULT 100000000` | 两条受支持升级路径都能到达完整 Schema 8，历史邀请不会变成 0 积分 | `backend/internal/database/schema_postgres_test.go` |
| 275 积分注册后邀请、普通用户、积分账户、积分流水和登录会话同时存在；注入积分流水异常后这些写入全部回滚 | 邀请积分与账号创建在 PostgreSQL 上具有同一事务边界 | `backend/internal/service/registration_invites_postgres_test.go` |
| 同一邀请双并发消费连续 10 轮，每轮均只有一个用户、账户、流水和会话 | PostgreSQL 条件占用可阻止重复领用与重复发放积分 | `.local/evidence/registration-invites/postgres-invite-concurrency-10x.log` |

## 验证结果

| 验证                          | 结果                                                            |
| ----------------------------- | --------------------------------------------------------------- |
| `go test ./...`               | 通过                                                            |
| `bun test`                    | 1686 通过，0 失败                                               |
| `bun run typecheck`           | 通过                                                            |
| `bun run build`               | 通过，全部体积预算通过                                          |
| 本次 Web 改动文件 Prettier    | 通过                                                            |
| 仓库级 `bun run format:check` | 基线仍有 386 个既有未格式化文件；本功能未扩大该范围             |
| PostgreSQL Schema 8 专项      | 通过：6→8、7→8/历史回填、原子提交、故障回滚；并发 10 轮通过    |
| 带 PostgreSQL DSN 的后端全量 | 通过                                                            |

## 回滚边界

提交按依赖顺序组织：已知 Web 格式门禁为独立提交，功能实现和文档/证据各自独立。完成后从最新提交向前逐项执行 `git revert <commit>`；不回退 Schema 8 字段或删除已有邀请数据，而是先回退应用读写再另行制定数据保留策略。
