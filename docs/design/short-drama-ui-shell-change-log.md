# 短剧创作 PC 入口与公共框架变更记录

## 1. 工作信息

- 基线：`7f98cbb34a4e4ca53ccbfe02609bf18be07aa4a6`
- 分支：`refactor/short-drama-ui-shell-20260903`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-short-drama-ui-shell`
- 设计规范提交：`753e137`
- UI 与测试提交：`8bf6b2e`

## 2. 完成内容

- 新增已加载项目、进行中、已归档和平均章节进度四项制作总览；所有数据由当前已加载列表派生，未增加 API。
- 重排一句话故事创建台，生成参数在 PC 端收纳为可展开区域，模型、AI 生成、手动创建、画风与来源入口全部保留。
- 将项目状态改为带数量的持久切换，使用 `aria-pressed`；搜索、排序、重置和无限加载行为不变。
- 项目卡片补充故事摘要与更新时间，保留封面、阶段、进度、章节/画布/资产数量、整卡导航和删除确认。
- 创建对话框补充来源说明和选中语义，表单字段、提交参数与创建后跳转不变。
- 项目公共顶栏增加稳定的短剧身份标识，中等 PC 宽度使用短导航标签，`1536px` 及以上显示完整标签。
- 新增独立 `short-drama-shell.css`，只消费 `--app-*` Token，不引入 Admin 私有类或 Token，PC 辅助内容在 `1024px` 以下保持隐藏。

## 3. 修改文件

| 文件 | 内容 |
| --- | --- |
| `docs/design/short-drama-pc-design-spec.md` | 审计结论、信息架构、视觉、状态、可访问性和所有权规范 |
| `web/src/pages/projects/index.tsx` | 项目中心、创建台、筛选和创建对话框表达 |
| `web/src/pages/projects/project-list-card.tsx` | 卡片摘要与更新时间 |
| `web/src/pages/projects/detail.tsx` | 公共顶栏身份区与 PC 导航宽度策略 |
| `web/src/pages/projects/short-drama-shell.css` | 本工作域独立 PC 样式 |
| `web/test/short-drama-ui-shell.test.ts` | API/跳转合同、可访问性、PC 断点和样式边界门禁 |
| `docs/design/short-drama-ui-shell-*.png` | 浅色项目中心、创建对话框和暗色项目公共壳验收截图 |

`chapters*`、`assets*`、`workflow-production*`、`workflow-stage*`、后端、Admin、数据库、API、权限、计费和业务规则均未修改。

## 4. 验证记录

| 验证 | 结果 |
| --- | --- |
| `bun test test/short-drama-ui-shell.test.ts test/pc-ui-detail-polish.test.ts` | 8 通过，0 失败，52 断言 |
| `bun run typecheck` | 通过 |
| `bun run build` | 通过，Vite 完成 13642 个模块转换并生成 `dist` |
| 1440×1000 浅色项目中心 | 页头、制作总览、创建台、筛选、卡片和页内滚动通过 |
| 1440×1000 创建对话框 | 来源选择、表单层级、焦点与操作区通过 |
| 1440×1000 暗色项目壳 | 项目身份、六个导航、主操作和项目错误态通过；导航拥挤已修正 |

视觉验收使用不提交的本地固定样本，没有读取登录凭据、创建账号或写入数据库。由于本地后端未启动，暗色项目壳截图同时覆盖“项目不可用”错误态。

## 5. 依赖、风险与回滚

- 依赖：仅使用仓库已有 React、Ant Design、Lucide、TanStack Query 和设计 Token；未增加依赖或修改锁文件。
- 风险：制作总览和状态数量与现有筛选一样，只反映当前已分页加载的项目；页头仍显示后端返回的总数。
- 风险：PC 生成参数默认收起，参数值、生成请求和可编辑性不变，但高频调参用户需多一次展开。
- 风险：未在真实登录数据上提交创建、删除、AI 生成或切换项目子视图；这些写路径由静态合同测试与代码差异确认保持不变。
- 回滚 UI 实现：`git revert 8bf6b2e`。
- 同时回滚设计规范：再执行 `git revert 753e137`。
