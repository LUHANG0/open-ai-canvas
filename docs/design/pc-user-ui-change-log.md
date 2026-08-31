# PC 用户端重构中央台账

| 会话 | 模块 | 分支 | 基线 | 提交 | 风险/依赖 | 合并 SHA | 回滚 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I | R0 基线 | `refactor/pc-user-ui-20260901` | `f41be733` | 基线无代码改动 | 现有 Create UIUX 分支冻结 | — | 回到 R0 Tag |
| I | R1 规范冻结 | `refactor/pc-user-ui-20260901` | `f41be733` | 设计系统、页面清单、计划、检查点与会话模板 | 无代码和接口变化 | — | Revert R1 文档提交 |
| S01 | Token 与主题 | `refactor/pc-ui-r2-tokens` | `6d8415c` | `db2d64c` | Admin 保留独立主题合同 | `047a4b9` | `git revert -m 1 047a4b9` |
| S02 | 壳层与页面骨架 | `refactor/pc-ui-r2-layout` | `6d8415c` | `4fbe32c`、`bed3d14` | Tasks 临时兼容；Projects 后续显式滚动合同 | `7532402` | `git revert -m 1 7532402` |
| S03 | 中性公共组件 | `refactor/pc-ui-r2-components` | `6d8415c` | `8884281` | 尚未接入页面；由页面 owner 按需消费 | `6988c09` | `git revert -m 1 6988c09` |
| S04 | Home / Tasks / Assets / Skills / Wallet | `refactor/pc-ui-r4-core` | `b66da08` | `efa326e`…`fe6a048` | 保留轮询、分页、上传、技能安装与钱包合同；交叉审查后恢复素材筛选移动横向滚动 | `f227298` | `git revert -m 1 f227298` |
| S05 | Projects 与六阶段工作流 | `refactor/pc-ui-r4-projects` | `b66da08` | `ebb6f47`…`0cdfe8a` | 保留无限加载、任务恢复、轮询、报价、版本和下载；DialogFrame 小屏等价性留集中浏览器回归 | `86d10ad` | `git revert -m 1 86d10ad` |
| S06 | Create 创作工作台 | `refactor/pc-ui-r5-create` | `b66da08` | `09a636d`…`13b9d35` | 保留生成、上传、计费和恢复链路；交叉审查移除 32 个新增 `!important` 并完成 PC-only 保护 | `b10d635` | `git revert -m 1 b10d635` |
| S07 | Settings / Plugins / Eagle | `refactor/pc-ui-r6-settings-plugins` | `c949021` | `88b982d`…`94c079c` | Admin 共用弹窗恢复为基线零差异；保留设置、插件启停、Eagle 上传/分页合同与移动端反馈 | `2487057` | `git revert -m 1 2487057` |
| S08 | Canvas 画布库 | `refactor/pc-ui-r6-canvas-library` | `c949021` | `14c0c16`…`2e102cb` | 保留模式 query、ZIP 导入、50 条无限加载、Store/API 与同步合同 | `673004e` | `git revert -m 1 673004e` |
| S09 | Canvas 编辑器与公开分享 | `refactor/pc-ui-r6-canvas-editor` | `c949021` | `ede47f9`…`88619ef` | 保留持久化、历史、上传、生成、轮询、Director 与分享权限；交叉审查修复 1024px/多列/Portal 边界 | `a46c265` | `git revert -m 1 a46c265` |
| S10 | Auth / 系统状态 / 语音原型 | `refactor/pc-user-ui-20260901` | `c949021` | `3d67934`、`eee0a91`、`a9e8657` | 保留 next/OAuth/验证码/倒计时/Session/语音回调；状态页新增信息限定 PC | 直接提交 | 按 `a9e8657` → `eee0a91` → `3d67934` 逆序 `git revert` |
| S11 | 生产用户页面覆盖审计 | `refactor/pc-user-ui-20260901` | `a46c265` | `310890d` | 全生产用户路由覆盖，router/权限/services/stores/backend/Admin 相对原始基线零差异 | 直接提交 | `git revert 310890d` |
| S12 | R6 全局清理 | `refactor/pc-user-ui-20260901` | `310890d` | `f286e7d`、`475982a`、`5fa61cd` | 修复 subnav sticky、钱包 PC 表格竞争和 8 个未定义 Token；高扰动历史债务延后 | 直接提交 | 按 `5fa61cd` → `475982a` → `f286e7d` 逆序 `git revert` |

## R2/R3 冻结结论

- `--app-*` Token、AntD 用户主题、224/64/52/10 壳层合同和中性公共组件已合入。
- 所有模块均使用非快进合并，支持单模块整体回滚。
- 本阶段仅执行文件范围审查和 `git diff --check`；完整测试继续延后到 R6 后集中执行。
- 页面分支统一从 R2/R3 冻结提交创建，不再修改 Foundation 公共文件。

## 已冻结的并行工作

- `feat/create-uiux-polish-f41be73` 位于独立 worktree，已有 5 个 Create UI 提交。
- 本次设计系统冻结后逐提交审查，决定择取、重做或废弃；在结论前禁止任何新会话覆盖其文件。

## 第一批页面冻结结论

- 第一批代码集成 HEAD：`86d10ad`；冻结文档提交与标签：`74c630c` / `pc-user-ui-page-wave1-20260901`。
- 三条页面分支均经过其他会话交叉审查，业务合同检查通过；审查发现的 PC/mobile 边界与强制覆盖问题已在合并前修复。
- 当前仍按总计划不运行完整构建和回归测试；下一批页面从同一冻结提交创建，禁止回写第一批目录。

## 第二批页面集成结论

- Settings / Plugins / Eagle、Canvas 画布库、Canvas 编辑器、Auth / 系统状态 / 语音原型均已合入集成分支，当前页面代码集成 HEAD 为 `a46c265`。
- S07、S08、S09 均经过独立会话交叉审查；审查发现的 Admin 间接影响、移动端错误反馈、sticky 遮挡、1024px 模式开关、顶部栏和多列裁切问题均在合并前修复。
- 本阶段没有修改后端、Admin 页面、数据库、API、权限或业务规则；完整构建与业务回归继续按计划延后到 R6 全局整理完成后统一执行。
