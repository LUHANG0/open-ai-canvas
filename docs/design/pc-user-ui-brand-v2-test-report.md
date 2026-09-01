# PC 用户端 Brand V2 集中测试报告

## 1. 测试结论

- 日期：2026-09-01。
- 分支：`refactor/pc-ui-brand-v2-20260901`。
- 对比基线：`b4d3b09282338e7c57fa41095b2dd03dab959c04`。
- 受测代码点：`db2a2c7`；后续仅补充本报告与部署记录。
- 结论：自动化门禁与可执行的浏览器回归全部通过，没有发现阻止本地上线的 P0/P1 问题。

## 2. 自动化门禁

| 项目               | 结果                                          |
| ------------------ | --------------------------------------------- |
| TypeScript         | 通过                                          |
| Admin 回归         | 9 通过，0 失败，96 个断言                     |
| Web 核心测试       | 1113 通过，0 失败，7011 个断言，87 个测试文件 |
| 跨 Runtime         | 1 通过，0 失败，8 个断言                      |
| 官方测试合计       | 1123 通过，0 失败，7115 个断言                |
| 生产构建           | 通过，13,510 个模块完成转换                   |
| 修改文件格式检查   | 通过                                          |
| `git diff --check` | 通过                                          |

构建仍提示部分 chunk 超过 500 kB；该提示在本轮前已经存在，不是 Brand V2 新增的阻塞错误。

## 3. 浏览器回归

### 3.1 PC 主链

- 在 1024、1280、1440、1600、1920 五档视口检查 `/home`、`/create`、`/tasks`、`/assets`、`/canvas`、`/settings`，共 30 个组合，全部通过。
- 检查页面级横向溢出、页面标题、空态、主内容滚动和主题变量；Create 空会话在五档宽度均保持 `scrollTop = 0`。
- 1024px 下 Tasks 的七列表格只在内部横向滚动，不污染整页；Assets 使用两列 251px 卡片且无全局横向溢出。
- 1440px 亮色与暗色 Create 均完成视觉检查；暗色算法生成的 Ant Design 主色为 `#796cd4`，语义源色为 `#8b7cf6`。
- Home、Projects、Skills、Plugins、Wallet 以及登录、注册、404、错误分享、错误项目、Voice、Eagle 等次级页面完成渲染和无溢出检查。

### 3.2 移动端保护

- 在 768 × 900 下检查 11 个路由：Home、Create、Projects、Canvas、Tasks、Assets、Skills、Plugins、Eagle、Wallet、Settings。
- 11/11 无全局横向溢出，无 Brand V2 PC eyebrow 泄漏；Ant Design 主色保持原移动端 `#171717`。
- `pc-ui.css` 的移动端有效声明与基线逐选择器比对，差异为 0；PC 端声明仍完整保留。

### 3.3 Admin 隔离

- `/admin` 页面视觉与代码范围保持原样，无页面级横向溢出。
- 浏览器验证 `/create` 主色为 `#5b4bdb`，进入 `/admin` 后切换为 `#171717`，返回 `/create` 后恢复为 `#5b4bdb`。
- 根级 message、modal、notification holder 跟随路由主题，避免 Admin 反馈组件继承用户端品牌色。

## 4. 禁改范围核验

相对 R8 基线，以下范围差异均为 0：

- `backend/**`
- `web/src/pages/admin/**`
- `web/src/styles/admin-ui.css`
- `web/src/styles/globals.css`
- `web/src/services/**`
- `web/src/stores/**`
- `web/src/router.tsx`

`web/src/styles/globals.css` 的基线与当前 Git blob 均为 `6080fe4f65f96990ca001529586bc104e5b97b3e`。

## 5. 集中测试期间发现并修复

1. Create 空会话被通用聊天跟随逻辑滚到页面底部：仅在 PC Brand V2 空会话复位到顶部，消息场景继续沿用原跟随逻辑，移动端行为不变。
2. Admin 根级反馈组件继承用户主题：根 Provider 订阅路由，并为 `/admin/**` 使用冻结的 Admin theme。
3. PC 公共原语基础样式影响 `<1024px`：恢复移动端基线，把 Brand V2 差异收敛到 PC media query。
4. 页面 eyebrow 在小屏泄漏：补齐 Canvas、Eagle 等页面的 PC 范围限制。

上述问题均增加或扩展了回归测试，并已纳入正式 `bun run test`。

## 6. 未执行的真实业务验收

以下操作需要专用测试账号、凭据、可计费额度或业务夹具，本轮没有代替用户触发真实写入或付费调用：

- 视频/图片真实生成、取消、重试、扣费和退款。
- 本机/OSS 素材真实上传与删除。
- OAuth、邮件、Eagle、RunningHub、Comfy 的真实联调。
- Projects 六阶段完整数据流程；Canvas 编辑、保存、分享的真实数据流程。
- Firefox 与 Safari 的真实浏览器兼容验收。

## 7. 遗留项

- Tasks 默认读取 30 条，但页面允许 20/50/100 的客户端分页。
- Home 请求 300 条，reader 默认单次最多 100 且未消费 cursor；Eagle 只读首个 100 条。
- Projects 搜索和排序只作用于已经加载的数据。
- `/home` 没有 `RequireAuth`，`/test-voice-recording` 仍是生产可达的内部原型；本轮遵守路由合同未改动。
- 仍有 Ant Design 弃用属性警告、历史格式债务、大 chunk、Canvas 历史断点与 Canvas Agent 异步测试债务。
- 尚未建立全用户端 Playwright 与版本化视觉基线；Canvas Editor 的完整拖拽、缩放、节点、连线和浮层仍需带数据夹具人工验收。
- 当前 8888 为 Vite 服务，不等同于公网正式托管；TLS、缓存、访问边界和生产静态托管需作为独立上线任务处理。
