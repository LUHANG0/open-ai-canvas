# PC 用户端 Git 检查点

| 节点 | 目标 | Tag | 状态 |
| --- | --- | --- | --- |
| R0 | 原始基线 `f41be733` | `pc-user-ui-r0-20260901` | 已建立 |
| R1 | 规范、清单、计划与台账 | `pc-user-ui-r1-20260901` | 已建立 |
| R2 | Token、主题、公共组件 | `pc-user-ui-r2-20260901` | 已建立 |
| R3 | 用户壳层与公共框架 | `pc-user-ui-r3-20260901` | 已建立；与 R2 同一冻结点 |
| Wave 1 | Core、Projects、Create 第一批页面 | `pc-user-ui-page-wave1-20260901` | 已建立；第二批共同基线 `86d10ad` |
| R4 | 普通页面完成 | 待创建 | 进行中；Core 已完成，Settings/Plugins/Auth/状态页待完成 |
| R5 | 复杂工作台完成 | 待创建 | 进行中；Projects/Create 已完成，Canvas 待完成 |
| R6 | 全局清理完成、尚未集中测试 | 待创建 | 未开始 |
| R7 | 集中修复完成 | 待创建 | 未开始 |
| R8 | 最终交付候选 | 待创建 | 未开始 |

## 分支规则

- 集成分支：`refactor/pc-user-ui-20260901`。
- 基线备份：`backup/pc-user-ui-r0-f41be73`。
- 每个模块独立 branch 和 worktree，从冻结的共同 SHA 创建。
- 使用显式 `git add -- <owned-files>`；禁止 `git add -A`。
- 使用 `merge --no-ff` 保留模块回滚点；冲突只由 Integration 处理。
- 禁止 `reset --hard`、强推和覆盖式回滚；使用 `git revert`。
- 未经授权不推送远端。
