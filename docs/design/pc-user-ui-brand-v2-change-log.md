# PC 用户端 Brand V2 修改台账

| 阶段 | 内容                                 | 分支/工作树                                                       | 提交                                       | 风险与依赖                                 | 回滚                              |
| ---- | ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | --------------------------------- |
| B0   | 已部署 R8 基线                       | `main` / `open-ai-canvas`                                         | `b4d3b09`                                  | 8888 保持运行，不在原目录开发              | `pc-user-ui-brand-v2-r0-20260901` |
| B1   | 视觉、页面和 Foundation 三路只读审查 | `refactor/pc-ui-brand-v2-20260901` / `open-ai-canvas-pc-brand-v2` | `8fe43b6`                                  | 未修改代码、服务或数据                     | `git revert 8fe43b6`              |
| B2   | Theme、Shell、PC Primitives          | 三个独立模块分支合入 Brand V2 集成分支                            | `d07537e`、`73a4033`、`06810b5`            | Admin palette 隔离；页面尚未逐项深化       | 分别 revert 三个 merge commit     |
| B3   | 全部 PC 用户页面 Brand V2 深化       | 创作、内容库、配置/系统三个独立分支合入集成分支                   | `c45a021`、`c098d09`、`56ee52a`            | 仅页面私有 JSX/CSS；Canvas Editor 仅做皮肤 | 分别 revert 三个 merge commit     |
| B3.1 | 移动端隔离与交叉审查修复             | `refactor/pc-ui-brand-v2-20260901` / `open-ai-canvas-pc-brand-v2` | `29a176b`、`ff32b40`、`fc6d000`、`3387667` | 保护 `<1024px`；修复横滚、卡宽与可访问性   | 分别 `git revert` 对应提交        |
| B3.2 | 集中回归发现项修复                   | `refactor/pc-ui-brand-v2-20260901` / `open-ai-canvas-pc-brand-v2` | `f063a91`、`564b2ce`、`dae1582`、`f359a56` | 空创作页滚动、Admin 根主题、移动端原语范围 | 分别 `git revert` 对应提交        |
| B4   | 回归门禁与测试固化                   | `refactor/pc-ui-brand-v2-20260901` / `open-ai-canvas-pc-brand-v2` | `db2a2c7`                                  | 主题路由与移动端范围测试纳入官方测试       | `git revert db2a2c7`              |

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

## B3 页面层与集中验证

- 创作主链：Home、Create、Projects；提交 `fe743a2`。
- 内容资产链：Tasks、Assets、Skills、Wallet；提交 `5042ecf`。
- 配置与系统链：Settings、Plugins/Eagle、Canvas Library/Editor、Auth、System、Voice；提交 `ac30e20`。
- 三路只读交叉审查已完成；修正移动端 eyebrow/Home wrapper、Tasks 七列横滚、Assets 窄屏卡宽、语义标题与 WebKit mask。
- 集中回归继续修复：Create 空会话滚动到页尾、Admin 根级反馈组件继承用户品牌色、PC UI 原语泄漏到移动端。
- TypeScript 通过；Admin 回归 9/9；核心测试 1113/1113；跨 Runtime 1/1；官方合计 1123/1123。
- 生产构建通过，共转换 13,510 个模块；原有 `>500 kB` chunk 警告仍存在，与本轮视觉重构无直接关联。
- 浏览器覆盖 1024/1280/1440/1600/1920 五档核心路由 30/30，768px 移动端保护 11/11；Admin、Tasks 横滚与 Assets 卡片布局通过专项检查。

## Git 规则

- Brand V2 基线：`pc-user-ui-brand-v2-r0-20260901`。
- 开发分支：`refactor/pc-ui-brand-v2-20260901`。
- 禁止 `reset --hard`、强推、宽范围清理与覆盖式回滚。
- 每个阶段独立提交并建立 annotated tag；回滚使用 `git revert`。
- 未经用户授权不推送远端，不替换当前 8888 服务。
