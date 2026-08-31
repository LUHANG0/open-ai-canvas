# S12 · R6 全局样式与代码清理

- 清理基线：`310890d`
- 执行分支：`refactor/pc-user-ui-20260901`
- 范围：只处理 PC 用户端样式竞争、设计 Token 引用与阶段台账；不修改业务、API、权限、后端或 Admin。
- 审计结论：无 P0；上线前最小 P1 已处理，低收益高扰动项明确延后。

## 已完成

1. Settings / Plugins 分类栏继承公共滚动容器中的 sticky 偏移，不再重复计算壳层 Topbar 高度；插件分区锚点同步改为容器内偏移。
2. 钱包旧全局表格强制样式限定到 `<1024px`，PC 端由 `wallet-pc.css` 唯一负责表格边框、表头、行高、背景和 hover。
3. 公共 PC 组件、Settings、Plugins 与 Eagle 的 8 个未定义 `--app-*` 名称改为已经定义的规范变量；胶囊圆角回归全局 Primitive `--r-full`，其余映射使用 Foundation Token，并保留可用 fallback。

## Token 映射

| 旧引用 | 规范引用 |
| --- | --- |
| `--app-control-height-md` | `--app-control-height` |
| `--app-radius-control-sm` | `--app-control-radius-sm` |
| `--app-radius-control` | `--app-control-radius` |
| `--app-radius-surface` | `--app-surface-radius` |
| `--app-action-secondary-hover-bg` | `--app-action-secondary-hover` |
| `--app-selection-hover-bg` | `--app-selection-hover` |
| `--app-shadow-control` | `--app-shadow-surface` |
| `--app-radius-badge` | 既有全局 `--r-full` |

## 提交与回滚

1. `f286e7d` · `fix(pc-ui): align subnav sticky offsets`
2. `475982a` · `fix(pc-ui): isolate legacy wallet table styles`
3. `5fa61cd` · `refactor(pc-ui): use canonical foundation tokens`

集成后按 `5fa61cd` → `475982a` → `f286e7d` 逆序 `git revert`。不使用强制重置。

## 明确延后

- 不在上线前大范围清扫 `globals.css` / Admin UI 的历史 `!important`。
- 不重命名 Settings 与 Admin 共用的 `model-capability-editor` 中既有 `admin-*` 类。
- 不抽象 Canvas 的动态内联几何样式、节点 JSX 或交互算法。
- Canvas 全局 `max-width: 1024px` 与 PC `min-width: 1024px` 的边界已由 Canvas 私域复位保护；断点重写延后，避免扩大影响面。
- 历史死选择器、Dialog 宽度字面值与少量 reduced-motion 重复规则留作上线后债务，不阻塞本轮。

## 静态验证

- `git diff --check`：通过。
- CSS 中使用但未定义的 `--app-*` 变量集合：清理后为空。
- R6 修改未触及 Admin、backend、数据库、API、services、stores、router、权限或业务回调。
- 完整格式、类型、测试、构建和浏览器回归尚未运行，按总计划在 R7 集中执行。
