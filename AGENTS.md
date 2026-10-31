# 开发 Agent 约定

本文件服务于当前影策代码库（产品界面品牌为梦层 MengCeng）的开发。用户当前任务优先；本文件提供可核对的入口、数据合同和工作方法，不记录人员分工、历史任务或固定视觉方案。

## Codex 开发技能

`.agents/skills/` 是随本仓库放在本机的 Codex 项目级技能，不属于产品内置创作技能。`~/.codex/skills/` 的个人技能在本项目中也可使用。Codex 按任务描述选择相关技能；用户也可用 `$技能名` 明确指定。无需把项目专用技能复制到个人全局目录。

| 开发任务 | 优先考虑的技能 |
| --- | --- |
| 品牌与产品界面体验 | `yingce-ui-experience`；公开品牌页面可结合 `design-taste-frontend`，交互检查可结合 `web-design-guidelines` 与 `playwright` |
| 参考页面或截图复刻 | 全局 `reference-ui-recreation`；用户提供截图、设计稿、Figma 画面或网址并要求还原时，在现有项目页面中实现并对照验证 |
| 网页加载与运行性能 | 全局 `performance`；首屏加载、交互响应和布局偏移专项结合 `core-web-vitals`，先测量再优化，区分实验室数据与真实用户数据 |
| 构建与资源加载 | 全局 `vite`，仅用于构建配置、插件、资源与相关故障；以项目 package.json 和锁文件版本为准，不因技能示例自动升级依赖 |
| 产品交互反馈 | 全局 `interaction-design`，用于加载状态、按钮反馈、弹窗、拖拽与过渡；复用现有 `motion`（`motion/react`）和组件，遵循本次设计方向；展示视频与 GIF 使用 `design-to-motion` |
| 无障碍专项 | 日常 UI 审查使用 `web-design-guidelines`；深入检查键盘、焦点、读屏与 WCAG 时结合全局 `accessibility`，自动化分数不等同完整合规 |
| Go 并发专项 | 全局 `go-concurrency-patterns`，仅用于任务并发、取消、超时、worker 与竞争问题，结合 `golang-context` 及项目实际生命周期和数据合同 |
| 跨模块重构与职责调整 | `yingce-refactoring`，再结合受影响领域的技能 |
| 产品流程、创作工具与模型 | `yingce-product-flows`、`yingce-generation-tools`、`yingce-provider-integrations` |
| 项目剪辑、素材与编辑器 | `yingce-project-timeline`、`yingce-assets-storage`、`yingce-canvas-editor` |
| 后端、产品 Agent、账号和计费 | `yingce-backend-and-agent`、`yingce-agent-extensions`、`yingce-identity-billing` |
| React、Go 与安全专项 | `vercel-react-best-practices`、`vercel-composition-patterns`、`golang-context`、`security-best-practices`，仅在对应问题需要时使用 |
| PostgreSQL 与安全建模 | 全局 `supabase-postgres-best-practices` 仅用于 PostgreSQL 相关工作，不替代本项目的 SQLite 兼容检查；全局 `security-threat-model` 仅用于明确要求的威胁建模 |
| 故障、验证与发布 | `systematic-debugging`、`verification-before-completion`、`yingce-release-readiness` |

表格用于定位技能，不要求每项任务加载整行技能；先选直接相关的，再按实际影响范围补充。 技能示例需适配真实框架、依赖版本与用户当前要求，不自动引入依赖或固定视觉方案；重叠专项按问题选用，不能把安装视为已经完成运行验收。

## 1. 如何判断现状

- 开始任务时检查 `git status --short`、当前分支、远端，以及涉及目录的约定；读取真实入口、调用方、配置和相邻测试。未提交源码也是当前工作区的一部分，不能用 HEAD 代替。
- 代码说明实现，配置说明选择，运行检查说明目标环境状态，测试结果只证明执行过的范围。文档中的方案、交接和验收记录需回到实现核对；冲突或缺少证据时标为“待核实”。
- `.local/` 中的发布副本、历史证据及第三方缓存不是当前产品源码；其中的 `AGENTS.md` 不作为当前产品约定来源。依赖自带的约定也不升级为全仓规则。
- 本文描述现有边界，允许按新任务重构。改变边界时同步实现、调用方、数据迁移、测试和文档；旧首页视觉、截图、尺寸、配色、设计提案不构成后续重构限制。

## 2. 产品目标与模块入口

产品面向 AI 影像创作，连接创作对话、素材、画布、短剧项目及生成任务，并由后台管理账号、渠道、计费、内容和运行策略。模块能力是否对用户开放还受账号权限、feature gate、渠道与运营配置影响。

| 范围 | 职责与当前入口 |
| --- | --- |
| Web 应用 | `web/`：React、TypeScript、Vite；`src/application.tsx` 组合 Provider，`src/router.tsx` 定义路由。共享 UI/主题在 `src/components/ui/`、`src/lib/app-theme.ts` 与 `src/styles/`。 |
| 官网与认证 | `web/src/pages/welcome/`、`src/components/brand/`、`src/pages/auth/`：`/` 展示已发布品牌内容；登录、注册、找回密码、邀请路由通过官网布局承载认证场景。返回地址由 `src/lib/auth-navigation.ts` 校验。 |
| 创作工作台与项目 | `web/src/pages/create/` 负责对话、参考素材、技能及生成入口；`src/pages/projects/` 负责短剧项目、章节和工作流；服务端分别见 `backend/internal/app/creation_history.go`、`project.go` 及相邻实现。 |
| 画布与编辑工具     | `web/src/pages/canvas/` 编排生命周期；`src/components/canvas/` 提供交互，`src/stores/canvas/` 管理状态，`src/lib/canvas/` 提供算法。时间线及编辑器扩展见 `src/lib/timeline/`、`src/lib/plugins/`；服务端画布合同在 `backend/internal/canvas/`。 |
| 后台与品牌 CMS | `web/src/pages/admin/` 管理用户/邀请、渠道/模型、账务、资源、技能、插件及设置；品牌编辑见 `settings/brand-site-settings-page.tsx`，服务端见 `backend/internal/app/brand_site.go`。 |
| 后端业务 | `backend/`：Go、Gin、GORM。`cmd/server/` 启动服务；`internal/handler/` 处理 HTTP；`internal/service/` 是 `app` 的导出门面；`internal/app/` 是组合根及尚未拆出的业务。`auth/canvas/skills/prompts/platform/workbench` 等域包负责各自业务，`repository/model/database` 管理持久化。 |
| 任务与模型 | `backend/internal/app/task_*.go`、`provider*.go` 组织任务；`internal/generation/`、`protocol/`、`provider/`、`outbound/` 处理生成、协议与出站请求。前端协议入口在 `web/src/services/api/`。任务执行、历史持久化、控制任务与收费调用不可混为一层。 |
| 产品 Agent | `backend/internal/app/cloud_agent_*.go` 编排运行；`internal/agent/` 管理进程、远程调用、工具与记忆；`internal/agentcontext/` 定义检查点；`backend/agent-runtime/pi/` 是 Node 执行循环，`yingce-agent/` 提供独立运行服务。 |
| 技能、提示词与插件 | `backend/internal/skills/` 管理版本化技能包，`backend/builtin/` 提供内置内容；`internal/prompts/` 管理系统策略、模板与风格。`plugin-packages/` 和前后端插件实现提供另一套扩展机制，技能不等同可执行插件。 |
| 部署与文档 | 根 Dockerfile、`backend/Dockerfile`、`yingce-agent/Dockerfile`、各 Compose、`nginx.conf`、`scripts/` 负责构建部署；`docs/index.md` 索引专题、设计和 ADR。当前 `docs/` 没有 `package.json`，不能假设可独立构建文档站。 |

## 3. 技术与数据合同

- 前端页面组织流程，业务 API 在 `web/src/services/api/`，跨页面副作用在 `services/`，共享状态在 `stores/`，纯算法在 `lib/`。后端 handler 接收上下文并调用业务层；域包不反向依赖 `app/service`。调整职责时检查所有调用路径，避免另造一套保存、鉴权或计费逻辑。
- 业务 JSON 使用 `web/src/services/api/request.ts` 的 `http` 解包 `{code,data,msg,reason,details}`；非零 code 是失败，错误按 `ApiError.code/reason` 处理。二进制、媒体、SSE 保留各自协议、取消和错误语义；后端不能用 HTTP 200 掩盖失败。接口定义入口为 `/api/openapi.yaml`。
- 自定义模型渠道通过 `custom-channel-relay.ts` 和 `channel-transport.ts` 进入登录态后端中转；模型特有 payload 留在对应适配器。修改生成前追踪准入、执行、持久化、结算与退款，保护整数金额、幂等和失败恢复。
- 账号切换由 `web/src/lib/user-session.ts` 协调请求、同步、查询缓存与持久化 scope。画布、素材和创作历史的本地持久化主要使用 localforage；localStorage 也承载有界画布恢复记录和用户配置，当前自定义渠道配置包含客户端密钥。新增缓存或敏感存储必须检查切号、退出及跨端同步边界，不能宣称浏览器存储没有凭据。
- 本地缓存成功不等于服务端保存成功。创作历史和画布同步需保留 revision、待提交状态、冲突与删除语义；缺少某条列表记录不能直接推断已删除。画布编辑、Agent 写入及媒体回调共用 `internal/canvas/operations.go` 的操作合同，重试保留 mutationId 与 payload，不能绕过版本、租约和资源校验直接覆盖快照。
- 文本任务与 Agent SSE 使用事件序号续传；画布实时通道使用 WebSocket。更改事件协议或代理配置时检查重放、去重、断线恢复与取消，任务 ID/run ID 不是事件游标。
- 数据库支持 SQLite/PostgreSQL；应用的 PostgreSQL 模式还要求 Redis 协调。表结构变更进入 `backend/internal/database/migrations.go`，同步模型、仓储、升级测试和数据库文档；不能只改 GORM 模型。运行库版本必须现场读取，源码版本常量不代表已迁移。
- CMS 的 Draft/Published/Previous 和 Revision 属于服务端数据合同；保存草稿不等于发布，源码默认值不等于线上发布值。保留管理员预览与公开媒体的可见性隔离及并发版本检查。
- 素材普通删除、彻底删除和孤儿清理有不同语义，见 `backend/internal/app/resource_delete.go`：彻底删除允许部分旧业务引用失效，但保护其他素材复用的对象；业务删除与 Outbox 同事务，物理删除在提交后幂等重试。不能把任一模式推广为所有删除路径的规则。

## 4. 产品内 Agent、技能与提示词

- `YINGCE_AGENT_URL` 决定调用独立服务还是本机 Node。远程失败不能自动回退本机而重复执行；Go 保留模型调用、计费、工具写入与持久化职责。Node 临时会话目录不是持久化来源，不默认加载宿主项目、扩展或个人技能。
- 工具分类、Schema 与审批策略集中在 `backend/internal/agent/tool/`。当前媒体生成工具要求独立审批，普通写工具按运行权限模式审批；提示词、技能、历史及模型输出不能授予权限。新增工具同步注册、参数校验、执行分派、归属检查与测试。
- 技能绑定已安装启用的版本及 hash，正文按需读取；导入保留路径、大小、数量及链接校验，不执行技能包内程序。插件另有协议适配和支付 RPC 等运行路径，必须检查宿主权限、凭据与执行限制，不能假定所有插件都只是文本。
- 编译期策略、数据库模板、用户偏好与风格档案是不同输入。修改 `backend/internal/prompts/` 时同时遵循该目录约定；开发约定不应混入产品模型上下文。
- Agent 架构守卫见 `backend/internal/agent/architecture/` 与 CI。重构应保持依赖方向和可验证的协议；不能通过扩大存量豁免或删除检查来掩盖新问题。

## 5. 安全要求

- 会话身份、管理员权限、对象归属、验证码、额度和审批必须在服务端执行路径验证，前端隐藏按钮不构成授权。缺失 ID、身份、权限或必要配置时明确失败，不用默认用户或额度兜底。
- 注册政策区分初始化首个管理员、公开注册及邀请注册。邀请路径保留验证码消费、账号创建、单次邀请消费、奖励与审计的事务及幂等；验证不能绕过本人操作或产生未经授权的真实扣费、积分及外部消息。
- 新增出站请求复用 `backend/internal/outbound/` 的对应策略，检查用户可控 URL、DNS/连接、重定向与 Header；私网放行、管理员出口代理和自定义 relay 的规则不同，不能用全局放开替代精确配置。
- 不把 Token、Cookie、API Key、邀请码或带凭据 URL 写入日志、公开错误、文档、Git 或共享同步正文。认证回跳仅接受校验后的站内地址；公开与私有媒体继续按访问场景授权。生产检查 HTTPS、Cookie、明确的 CORS 来源及可信代理配置。
- 数据库、用户素材、`.env`、`.settings-key`、本地缓存和部署凭据不进入源码提交。备份迁移同时保护加密密钥与持久化数据；不得用旧库覆盖上线后的新写入，也不得删除仍被运行服务引用的数据或镜像。保留 `LICENSE`、`NOTICE` 及第三方许可。

## 6. 修改与协作

- 使用 OMP 委派实现时，委派方与执行方共同遵循 [.omp/AGENTS.md](.omp/AGENTS.md) 的任务交接、改动边界与验收规则；它不改变本文件的数据合同和用户授权要求。

- 按本次用户目标完成必要接续，不继承历史会话的角色或分工。协作时明确本次文件范围，共享文件保持一个写入者；并行只读审查可以独立进行。
- 保留用户已有修改；不做无关格式化、依赖更新或大范围清理。重建约定等覆盖操作先列出文件，保存原文、未提交差异和校验值；留档用非 `AGENTS.md` 文件名，避免旧规则重新生效。
- 实现变更从真实组件、路由和业务路径入手。重构可以改变设计与架构，但需交代行为和数据迁移；共性 UI 回到共享入口，局部样式限定作用域，检查键盘焦点、可访问名称、响应布局和减少动态效果偏好。
- 画布输入还需检查 pointer capture、焦点、浮层、快捷键和嵌套滚动，复核 `data-canvas-no-zoom` / `data-canvas-wheel-scroll` 边界。孤立演示页与仿制截图不能证明真实页面通过。
- 提交、推送、PR、部署、生产写入和数据清理按本次授权范围执行；完成其中一项不自动授权其他项。已有授权的必要接续不反复索要确认。

## 7. 开发与部署

- 先读 `.env.example`、目标 Compose 和实际叠加配置，检查已有进程、端口及数据挂载，再决定是否启动。`docker-compose.dev.yml` 提供源码热更新；本机存在 `.local/dev.sh` 时先用 `status` 核对并复用。`.local/` 配置、代理与版本不是其他机器的默认事实。
- 依赖按工作区管理：`web/` 使用 `bun.lock`；`backend/` 使用 `go.mod/go.sum`；`backend/agent-runtime/pi/` 使用 `package-lock.json`，CI 安装命令为 `npm ci --omit=dev --ignore-scripts`。版本以锁文件、Dockerfile 和目标环境为准，不跨工作区替换包管理器。
- `docker-compose.deploy.yml` 编排 PostgreSQL、Redis、迁移、独立 Agent、后端和 Web；`docker-compose.build.yml` 提供源码构建覆盖。`scripts/install-server-image.sh` 安装 Release 镜像与 Host Updater，`scripts/install-server.sh` 走源码构建；其他 Compose 具有不同服务与暴露面，不能仅凭文件名推断现有部署。
- 修改既有部署前核对真实镜像、源码快照、Compose、数据库、挂载、反向代理和更新器。自定义源码不因通用安装文档而被官方镜像替换。迁移需在隔离副本验证恢复、重复执行及兼容性；发布与清理策略现场核实，历史记录不能直接触发删除。

### 本地磁盘与任务收尾

- 在复制候选源码、下载依赖、构建镜像或导出大文件前检查可用磁盘和本任务目录大小。可用空间低于 20 GiB 时先盘点可再生成内容；低于 10 GiB 时先释放足够空间或缩小任务产物，再开始大体积操作。这是操作检查阈值，不是自动删除授权。
- 默认复用现有服务、依赖与缓存；隔离验收只保留必要的候选，不为每次复测另复制整仓。候选不复制 `.local`、数据库、用户素材、依赖目录和无关构建产物；需要原有未跟踪文件时显式列入清单。临时 Git worktree 用对应工具管理。
- 创建临时目录、容器、数据卷、网络或预览服务时记录用途、归属与恢复依据。任务结束前停止本任务启动的临时服务，并清理本任务已完成、可重建且未被引用的候选和构建产物；不得清理其他进行中的任务。中断交接时列出仍需保留的临时资源。
- 源码恢复优先保留基线提交、精确补丁、未跟踪文件备份、校验清单及关键验收记录。压缩备份与解压副本长期并存前检查必要性；只有验证备份完整、差异已保留且无进程/服务引用时，才移除重复解压副本。用户指定的恢复点、当前发布和所需回退版本不得按时间或容量盲删。
- 任务收尾检查构建缓存大小；单项超过 5 GiB 或总空闲低于上述阈值时，评估清理不用的缓存。优先使用工具提供的缓存清理命令，避开正在编译的任务；这不是硬配额，也不要求每轮清空热缓存。禁止使用包含数据卷的无差别 Docker 清理，禁止凭“unused”删除数据库卷、运行镜像或回退镜像。
- 清理前核对实际进程、挂载、源码及后端内容目录引用，不能只检查前端引用。源码、数据库、上传素材、凭据、用户文件、个人软件运行环境和唯一备份不按缓存处理。跨项目或无法判断用途的内容先列出，不凭目录名直接删除。
- 清理记录放入本次 `.local` 目录，记录路径、理由、备份/重建依据和释放前后空间，不记录凭据。结束时核对 Git 差异、受影响服务及必要入口；交付说明已清理项、保留项和遗留资源。规则要求任务内收尾，不代表已经安装定时清理任务。

## 8. 验证标准

选择与改动风险匹配的最小充分验证，跨模块或高风险变更扩大覆盖。先确认测试会使用隔离数据和所需依赖，不将生产连接作为测试输入。

| 范围 | 已存在的入口（在对应目录执行） |
| --- | --- |
| 前端专项 | `web/`：`bun test test/<专项文件>`；脚本与专项范围查 `package.json`，不能把一个画布脚本当作全部画布验收。 |
| 前端类型与构建 | `web/`：`bun run typecheck`、`bun run build`；当前 build 包含 TypeScript 检查。镜像构建直接运行 Vite，不能替代 typecheck。 |
| UI 静态规则 | `web/`：`bun run lint`；当前仅限制 AntD Empty 和静态 Modal.confirm，不代表完整风格或安全检查。 |
| 后端与 Agent | `backend/`：`go test ./internal/<相关包>`；跨域可扩大至 `go test ./...`。Agent 架构专项为 `go test -count=1 ./internal/agent/architecture`。 |
| 集成及发布 | 以 `.github/workflows/quality.yml` 为入口核对 PostgreSQL、Redis、Node、浏览器及支付插件包检查，不能只复制命令而缺失依赖。 |
| 约定与文档 | 核对路径、适用目录、规则冲突和 `git diff --check`；当前没有 `docs` 构建脚本，不引用不存在的命令。 |

- PostgreSQL 测试需要 `CANVAS_TEST_POSTGRES_DSN`，部分 Redis/Agent 测试需要可执行文件或 Node 依赖；Skip 不等于通过。测试定义存在、静态阅读、专项测试、构建、浏览器验证、生产验收分别报告。
- UI 验证使用真实路由与状态，覆盖所改流程及必要的主题、手机布局、滚动、加载、失败和权限边界。数据变更重点检查账号隔离、并发/重试、冲突与失败回滚；付费或外部投递路径使用隔离替身，真实调用需明确授权。
- `/api/health/ready` 检查数据库、运行配置和 Schema 就绪；HTTP 200 或 ready 不能替代登录、保存、跨设备同步、SSE/WebSocket 和生成验收。

## 9. 文档与交付

- 详细合同写入对应 `docs/content/docs/` 专题，设计提案与 ADR 保留各自身份。文档索引为 `docs/index.md`；新增文件检查是否被 `.gitignore` 排除，不能把本机文件存在当成随仓库交付。
- 交付说明实际改动、依据、执行过的验证、未验证部分及影响。仅提交本次文件；不将旧日志和别的环境的结果充当本次证据。约定维护另列适用文件、删除/保留/新增规则及留档位置。
- 待核实：目标环境实际发布的源码/镜像、数据库版本、拓扑与清理策略，GitHub 可见性及仓库关系，CMS 发布内容、账号/技能/插件和模型渠道的启用状态。都不能由本文件或本地分支推断。
- 待核实：真实邮件/短信、支付/模型、OSS/CDN、转写等外部链路与完整多设备业务；未执行验收即保持待核实。环境状态写入本次交付记录，不持续追加进本约定。
