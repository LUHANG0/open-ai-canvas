# PC 用户端重构中央台账

| 会话 | 模块 | 分支 | 基线 | 提交 | 风险/依赖 | 合并 SHA | 回滚 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I | R0 基线 | `refactor/pc-user-ui-20260901` | `f41be733` | 基线无代码改动 | 现有 Create UIUX 分支冻结 | — | 回到 R0 Tag |
| I | R1 规范冻结 | `refactor/pc-user-ui-20260901` | `f41be733` | 设计系统、页面清单、计划、检查点与会话模板 | 无代码和接口变化 | — | Revert R1 文档提交 |
| S01 | Token 与主题 | `refactor/pc-ui-r2-tokens` | `6d8415c` | `db2d64c` | Admin 保留独立主题合同 | `047a4b9` | `git revert -m 1 047a4b9` |
| S02 | 壳层与页面骨架 | `refactor/pc-ui-r2-layout` | `6d8415c` | `4fbe32c`、`bed3d14` | Tasks 临时兼容；Projects 后续显式滚动合同 | `7532402` | `git revert -m 1 7532402` |
| S03 | 中性公共组件 | `refactor/pc-ui-r2-components` | `6d8415c` | `8884281` | 尚未接入页面；由页面 owner 按需消费 | `6988c09` | `git revert -m 1 6988c09` |

## R2/R3 冻结结论

- `--app-*` Token、AntD 用户主题、224/64/52/10 壳层合同和中性公共组件已合入。
- 所有模块均使用非快进合并，支持单模块整体回滚。
- 本阶段仅执行文件范围审查和 `git diff --check`；完整测试继续延后到 R6 后集中执行。
- 页面分支统一从 R2/R3 冻结提交创建，不再修改 Foundation 公共文件。

## 已冻结的并行工作

- `feat/create-uiux-polish-f41be73` 位于独立 worktree，已有 5 个 Create UI 提交。
- 本次设计系统冻结后逐提交审查，决定择取、重做或废弃；在结论前禁止任何新会话覆盖其文件。
