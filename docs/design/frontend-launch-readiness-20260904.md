# 周日邀请制上线前台收口验收记录

日期：2026-09-04

基线：`origin/main` @ `2d9078a150608d370eeae7ba5f3ea5584cd0d8b1`

分支：`fix/frontend-launch-readiness`

独立 worktree：`/Users/hanglu/Documents/影策/.worktrees/frontend-launch-readiness`

## 结论

本轮完成邀请制认证文案、移动端低缩放空白画布保护、大画布远景键盘降噪、视频素材缺失尺寸回填，以及插件中心客户化术语五项前台收口。未修改公开注册策略、后端接口、计费、生产数据，也未合并或部署。

设置页双层导航和重复“生成视频”命名经审计后延期：前者是全局导航与设置分区的既有层级合同，临上线改结构的响应式风险高；后者来自任务、素材、画布和外部素材同步的共享命名链路，需单独定义稳定命名与历史迁移规则，不适合在本轮做局部补丁。

## 变更与回退

| 项目 | 交付行为 | 提交 | 单项回退 |
| --- | --- | --- | --- |
| 邀请制认证入口 | 注册不可用时统一显示“当前仅限受邀成员使用”，引导联系团队管理员；登录页不再展示误导性的公开注册入口；不暴露邮件配置内部状态 | `cf0e1710a0911f61c0b35132ed7697e0ae5688c4` | `git revert cf0e1710a0911f61c0b35132ed7697e0ae5688c4` |
| 移动端低缩放画布 | 仅在宽度不超过 640px、保存缩放不超过 12%、且没有任何有效节点可见时执行一次安全适配；节点异步恢复后再检查，已有可见内容和桌面视口保持不变 | `b7864df0` | `git revert b7864df0` |
| 大画布键盘焦点 | 缩放低于 35% 时，未选中节点内部控件退出 Tab 顺序；节点仍保留可访问名称，鼠标选中后恢复该节点控件，并提供远景操作提示 | `908b65b2` | `git revert 908b65b2` |
| 视频素材元数据 | 视频加载后只回填缺失或非正数的宽、高、时长；有效已有值不被覆盖；加载前用“尺寸待识别”替代 `0×0` | `4120cadf` | `git revert 4120cadf` |
| 插件中心术语 | 将“协议、异步轮询、插件清单”等内部实现术语改为“能力、后台处理、插件配置”等客户可理解文案 | `466aebfc` | `git revert 466aebfc` |

## 浏览器证据

所有截图均由本地确定性页面或未登录认证页生成，没有使用生产账号或生产数据。

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 390×844，深色，注册邮件能力不可用，基线 | 暴露“邮箱注册暂不可用”和管理员邮件配置状态 | [修复前认证页](evidence/frontend-launch-readiness/auth-before-internal-state-390x844-dark.png) |
| 390×844，深色，同一认证状态，修复后 | 只显示邀请制规则与联系管理员指引 | [修复后认证页](evidence/frontend-launch-readiness/auth-after-invitation-390x844-dark.png) |
| 390×844，深色，保存 10% 大画布视口，基线 | 可见节点数为 0，页面呈现空白网格 | [修复前空白画布](evidence/frontend-launch-readiness/canvas-before-blank-390x844-dark.png) |
| 390×844，深色，同一保存视口，修复后 | 安全适配至约 6.4%，324 个节点进入视口 | [修复后安全适配](evidence/frontend-launch-readiness/canvas-after-safe-fit-390x844-dark.png) |
| 1366×768，浅色，324 节点远景 | 324 个节点均为 overview，0 个节点控件进入 Tab 顺序；点击节点后仅该节点恢复 3 个操作控件 | [远景键盘状态](evidence/frontend-launch-readiness/canvas-after-low-zoom-keyboard-1366x768-light.png) |
| 1600×1000，深色，标准画布夹具 | 4/4 节点可见，完整刷新后浏览器控制台无 warning/error | [桌面画布回归](evidence/frontend-launch-readiness/canvas-p0-1600x1000-dark.png) |

## 自动化验证

- `bun test`：244 个文件，1683 项通过，0 失败，9747 个断言。
- `bun run build`：Canvas Agent bridge、`tsc --noEmit`、Vite 生产构建、构建体积预算全部通过。
- 加载、空、错误与键盘路径包含在全量测试中，重点覆盖 `workspace-route-loading.test.ts`、`canvas-empty-state-routing.test.ts`、`canvas-loading-overlay-convergence.test.ts`、`auth-login-experience.test.ts`、`canvas-keyboard.test.ts` 和 `canvas-keyboard-access.test.ts`。
- 独立 worktree 首次全量测试前分别执行 `web/bun install --frozen-lockfile` 与 `canvas-agent/bun install --frozen-lockfile`，未修改锁文件。

## 未执行与上线前人工确认

- 未使用真实受邀账号，因此素材库视频回填和插件中心页面仍需在测试账号下各做一次只读视觉抽查。
- 未触发真实生成、计费、公开注册、邮件发送、生产数据写入、合并或部署。
- 如需继续处理重复“生成视频”名称，应先定义跨任务、素材、画布的命名合同及旧数据兼容策略；如需调整设置导航，应单独做桌面与窄屏信息架构评审。
