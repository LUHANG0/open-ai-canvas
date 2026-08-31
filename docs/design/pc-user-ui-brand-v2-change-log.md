# PC 用户端 Brand V2 修改台账

| 阶段 | 内容                                 | 分支/工作树                                                       | 提交                            | 风险与依赖                           | 回滚                              |
| ---- | ------------------------------------ | ----------------------------------------------------------------- | ------------------------------- | ------------------------------------ | --------------------------------- |
| B0   | 已部署 R8 基线                       | `main` / `open-ai-canvas`                                         | `b4d3b09`                       | 8888 保持运行，不在原目录开发        | `pc-user-ui-brand-v2-r0-20260901` |
| B1   | 视觉、页面和 Foundation 三路只读审查 | `refactor/pc-ui-brand-v2-20260901` / `open-ai-canvas-pc-brand-v2` | `8fe43b6`                       | 未修改代码、服务或数据               | `git revert 8fe43b6`              |
| B2   | Theme、Shell、PC Primitives          | 三个独立模块分支合入 Brand V2 集成分支                            | `d07537e`、`73a4033`、`06810b5` | Admin palette 隔离；页面尚未逐项深化 | 分别 revert 三个 merge commit     |

## 并行会话结论

- 视觉方向：光帧导演台；品牌紫与 AI 青严格分工。
- Foundation：先隔离用户与 Admin 的 Ant Design palette；冻结 `globals.css`。
- 页面审查：Create/Home/Projects 为首批品牌焦点；Canvas Editor 仅做低风险皮肤传播。
- 文件 Owner 按模块独占，共享文件只能由单一会话修改。

## B2 公共层验证

- Foundation：`def1d1a`；Admin 明暗主题输出 SHA256 与 B0 完全一致。
- Shell：`af2649e`；保持 224/64、52、10px 和原滚动合同。
- PC Primitives：`d4273a8`；新增可复用 `EmptyState` 和可选媒体交互态。
- 集成后 TypeScript、Admin 回归 9/9、生产构建和 `git diff --check` 全部通过。
- B2 标签：`pc-user-ui-brand-v2-r2-foundation-20260901`。

## Git 规则

- Brand V2 基线：`pc-user-ui-brand-v2-r0-20260901`。
- 开发分支：`refactor/pc-ui-brand-v2-20260901`。
- 禁止 `reset --hard`、强推、宽范围清理与覆盖式回滚。
- 每个阶段独立提交并建立 annotated tag；回滚使用 `git revert`。
- 未经用户授权不推送远端，不替换当前 8888 服务。
