# S13 — R7 集中测试与修复

## 范围

- 集成分支：`refactor/pc-user-ui-20260901`
- 基线：R6 `217a022`
- R7 代码点：`4705169`
- R7 回滚标签：`pc-user-ui-r7-20260901`
- 仅执行 PC 用户端测试、前端兼容修复和交付文档；未修改 backend、Admin、数据库、API、权限或业务规则。

## 完成内容

1. 补齐 Web 与 Canvas Agent 依赖，保持 lockfile 不变。
2. 完成格式差分、类型、官方/全发现单测、生产构建、Director Chrome E2E 和 Canvas Agent 边界检查。
3. 完成 768/1024/1440/1920px、亮暗主题、主路由、设置深链、公开分享错误页、404 与 Admin 只读浏览器回归。
4. 修复 Token 价格在 Create 发送按钮的保留展示，以及提示卡片逐字竖排和图标错位。
5. 恢复 Assets 批量栏“取消选择”文案契约，并将脆弱源码换行测试改为组件顺序契约。

## 修改文件

- `web/src/pages/create/index.tsx`
- `web/src/pages/create/creation-workspace.css`
- `web/src/pages/assets/index.tsx`
- `web/test/create-library-button.test.ts`
- `web/test/assets-page-batch-toolbar.test.ts`
- `docs/design/pc-user-ui-test-report.md`
- `docs/design/pc-user-ui-change-log.md`
- `docs/design/pc-user-ui-git-checkpoints.md`
- `docs/design/pc-user-ui-known-issues.md`
- `docs/design/pc-user-ui-sessions/S13-centralized-testing.md`

## 提交与回滚

| 提交      | 内容                                        | 回滚                 |
| --------- | ------------------------------------------- | -------------------- |
| `2fae2e3` | 格式化本轮新增/新退化文件                   | `git revert 2fae2e3` |
| `e5c80bc` | 恢复 Token 价格与提示词优化器源码契约       | `git revert e5c80bc` |
| `4705169` | 修复 Token 提示布局、图标和 Assets 文案契约 | `git revert 4705169` |

需整体回到 R6 时，直接检出 `pc-user-ui-r6-20260901`。需保留测试前页面但撤回 R7 修复时，按 `4705169` → `e5c80bc` → `2fae2e3` 逆序 revert。

## 验证结果

- 官方测试：1116/1116 通过。
- 类型检查和生产构建：通过。
- Director Chrome E2E：58/58 通过。
- 真实浏览器：主路由、多宽度、亮暗主题、上传入口、Token 提示和设置深链通过。
- 禁区对照：backend、Admin、services、stores、router 相对 R0 零差异。

## 风险与依赖

- 全发现测试、全仓格式和 Canvas Agent 测试存在可从 R0 复现的历史债务，详见集中测试报告。
- 真实付费生成、外部集成、长列表和 Projects/Canvas 详情验收依赖隔离账号、测试凭据与数据夹具。
- Firefox/Safari 未在本机自动化链路中执行，上线前保留关键路径手工回归。
