# AGENTS.md

本文件是梦层 MengCeng 仓库中 AI、自动化工具和协作者的工作约定。用户当前任务优先于本文件；本文件优先于个人习惯。所有结论应能回溯到代码、配置、测试、日志或文档，不用历史印象替代现状。

## 当前产品的工作交接

本节只保留当前安排。新会话先读本节及存在时的 `.local/README.md`，再检查 `git status --short`、`git branch -vv` 和 `git remote -v`；服务、账号、模型和线上版本均须按实际状态核对。

### 讨论、实施与授权

- 讨论任务默认只读；用户明确要求实施、修复或同步 Git 后，按该次范围执行，不把历史讨论限制当作撤销新授权。
- 本总控会话负责只读检查、协调和审阅，不修改产品源码；用户明确要求的 AGENTS.md 维护与 Git 同步可直接进行。产品代码由用户指定的实施会话处理，未经授权不新建会话或增加 writer。
- 已有分工时遵守文件归属；共享文件先协调唯一写入窗口。已授权任务的必要接续不逐批重复确认，提交、推送、PR 和部署按各自授权执行。
- 用户认可方向、选择页面或问“可以改善吗”，不自动构成编码授权；明确方案与范围后再实施。
- 全站 UI、品牌重构和邀请注册的历史批次已结束，不恢复旧总控派单或定时跟进。邀请上线跟进已删除；有新需求时按新授权处理。

### 产品现状与入口

- 对外品牌为中文“梦层”、英文“MengCeng”、域名 `mengceng.com`。保留上游来源、LICENSE、技术协议、模块名和存储 key，不批量改写历史用户内容。
- 根路由 `/` 固定展示品牌官网，登录后也不跳过；创作工作台在 `/create`，旧 `/welcome` 重定向到 `/`。工作区入口名称为“对话创作 / 短剧项目 / 创作画布”，路由保持。
- 官网使用当前 `BrandSite`、彩色 Logo 与既有品牌媒体；此前轮播、石墨黑、剧院整图及 v2–v5 草案都不是后续必须恢复的规范。视觉以当前真实源码、CMS 发布内容和最新用户反馈为准，不用旧截图或旧像素值覆盖现状。
- 官网认证使用原地弹窗；独立认证页与邀请页复用原表单和认证壳。登录回跳统一经 `lib/auth-navigation.ts` 校验，保留站内路径、查询和 hash。等待限制在表单或工作区内容区域，保留稳定导航与外壳。
- 品牌后台采用“编辑、实时预览、保存草稿、手动发布”，草稿媒体私有、整版发布并保留上一版。官网、登录页与工作台皮肤职责分开；读取不覆盖 CMS 发布值。完整合同见[品牌官网](docs/content/docs/backend/mengceng-brand-site.mdx)。
- 创作对话已实现账号隔离的跨设备同步，Schema 60 的对话、消息和资源引用三表保留；本地缓存不等于服务端保存。见[创作历史跨设备同步](docs/content/docs/backend/creation-conversation-sync.mdx)。
- 管理员可在用户管理生成普通用户邀请，`/i/:code` 使用 6 位大小写字母数字随机码，单次成功注册消费，默认 7 天、可设 1–90 天，可撤销。公开注册关闭时官网显示“内测用户邀请”，输入短码经同一服务端校验进入邀请页；完整链接免再填码，已有账号仍可登录。
- 邀请积分为 50 / 100 / 200 / 自定义，生成时固定，替代全局注册赠送且不叠加；0 也登记注册赠送已处理，后续登录不能补发。注册、验证码、邀请消费、流水和审计共同提交；沿用验证码与本人协议要求。数据库新增 Schema 61，见[邀请注册](docs/content/docs/backend/registration-invitations.mdx)。

### Git 与来源

- 当前产品远端为 `https://github.com/LUHANG0/open-ai-canvas.git`；用户已要求将其转为自己的独立私有仓库。仓库关系和可见性以 GitHub 实际状态为准，不能只依据本文件宣称转换成功。
- `origin` 为用户的产品仓库；`upstream` 保留 `https://github.com/ddcat-ai/open-ai-canvas.git` 作为来源与手工更新入口。独立仓库仍保留完整提交历史和许可，不再依赖 GitHub Fork 网络。
- 产品开发分支为 `my-product`，跟踪 `origin/my-product`；仓库默认分支应指向产品分支。`main` 保留上游基线，不把旧 main 当当前产品版本。初始化基线 `a934a655f175b1bc41af8d92fa8c26493699ef70` 是历史事实，不代表上游最新。
- 后续贡献上游时，应另用上游最新基线和专用 Fork 建立聚焦分支，不把私有产品定制整批提交上游。
- `.local/`、数据库、上传内容、真实凭据、部署备份、浏览器证据和构建产物不提交 Git。用户授权 Git 同步不等于再次部署；线上对应独立的源码快照与镜像，不用 HEAD 替代未提交发布快照。

### 本地开发

- 复用 Docker Desktop、`docker-compose.dev.yml` 与忽略的 `.local/compose.override.yml`，不另启宿主机前后端。存在时用 `bash .local/dev.sh status|start|stop|logs` 管理，保留数据库、素材和卷。
- 前端 Node 24 运行 Vite，Bun 1.3.13 用于依赖和专项；不要改回 Bun 直接运行 Vite，历史 WebSocket upgrade 导致退出的问题已由本机 Node 运行方式修复。具体镜像版本以 `.local/Dockerfile.web` 为准。
- 本地入口 `http://localhost:3000`，前后端仅绑定 `127.0.0.1:3000/8080`，Vite 将 `/api` 代理后端。本地 SQLite 数据在 `.local/project-workbench-debug`，缓存在 `.local/cache`，与生产 PostgreSQL/Redis 区分。
- 本地后端补充 Node.js、npm、ffmpeg；未设置 `YINGCE_AGENT_URL` 时使用内嵌 Agent，不另启独立容器。锁文件未变时复用依赖；`.local/air.toml` 排除 Agent node_modules 热监听。
- 本机镜像构建与后端使用 Docker Desktop 代理，前端 Bun 直接下载、并发 16；不要把机器专用代理和配置写进通用源码。其他机器可能没有 `.local`，先核对存在性与当前配置。

### 已发布基线与验证边界

- 已发布 `https://mengceng.com`，当前交接发布号 `20261024T114020Z`，build `bad41004-invitations-edc967fe038c`，源码归档 SHA-256 `edc967fe038c7e0e0fb5b96cfebc94236c0ed4faf0f0b5ac2dcea5f8f3c5cb83`，Schema 61。后续操作须实时重核，不能将本节当作永久线上事实。
- 生产沿用自改源码、自建镜像和既有 Compose，PostgreSQL 17、Redis、独立 Agent；不切换官方 Release 覆盖定制。最近发布仅更新接受的邀请与品牌入口 53 个路径，已演练一致备份恢复、60→61 两次迁移和 115 张旧表保留，五服务健康。
- Schema 61 后不能只回退原 Schema 60 后端；优先前向修复、保留新后端的前端回退，或使用已验证支持 61 的兼容镜像。不得用旧库覆盖上线后的新用户、任务和账务数据。
- 邀请专项涵盖 PostgreSQL 并发一次消费、0 不补发、精确金额、失败整体回滚与重试；品牌与认证专项、类型检查及构建通过。线上有限检查涵盖无效邀请、短路由、注册关闭、登录回跳、已登录提示、管理员读取权限和日志脱敏。健康 200 与测试通过不扩大为全部业务验收。
- 没有为验收创建生产邀请/新账号、发送真实验证码、替人同意协议或发放积分。真实投递、受邀者本人注册、有效表单和部分邀请页状态的完整手机视觉仍待人工验收；两张异常尺寸截图已排除，未当作产品布局失败。
- 全站 UI、画布删空/滚轮/Agent 面板/连线与同步状态等历史结果及限制，统一见[待测试](docs/content/docs/progress/pending-test.mdx)。原现场长期同步未直接复现，不宣称所有同步故障已解决；媒体生成、收费模型与非空业务按各批记录保留范围，字幕转写仍需 whisper。
- 夜总会、4stoken 与 Drama 独立协议按各自文档和专项记录处理，未获授权不代用户调用收费模型。
- 正式本机发布证据在忽略目录 `.local/mengceng-deploy/20261024T114020Z/delivery.json`，其他机器可能没有。界面与历史专项证据在 `.local/ui-review/`、`.local/mengceng-brand-review/` 等忽略目录，不作为随仓库分发的附件，不保存或输出凭据。

## 1. 项目边界

梦层 MengCeng 基于 `ddcat-ai/open-ai-canvas` 二次开发，是面向 AI 影像创作的工作台，当前仍在快速开发。公开接口、数据结构和部署配置可能直接调整；除非任务明确要求，不为旧字段、旧 API 或旧数据增加兼容层。

仓库由几个边界清晰但可独立运行的单元组成：

| 单元 | 技术栈 | 入口 | 责任 |
| --- | --- | --- | --- |
| `web/` | Vite、React 19、TypeScript、React Router、Ant Design、Tailwind、Zustand、TanStack Query | `web/src/application.tsx`、`web/src/router.tsx` | 工作区 UI、画布交互、浏览器缓存、API 调用和模型协议适配 |
| `backend/` | Go 1.25、Gin、GORM、SQLite/PostgreSQL、Redis 协调 | `backend/cmd/server/main.go` | 登录、权限、业务 API、任务队列、资源、模型中转和后台管理 |
| `docs/` | Next.js、Fumadocs、MDX | `docs/content/docs/` | 面向用户和开发者的专题文档；构建配置见 `docs/source.config.ts` |

根目录的 `Dockerfile` 构建前端静态镜像；`nginx.conf` 托管 SPA 并代理后端。`docker-compose.dev.yml` 是源码热更新开发编排，根 `docker-compose.yml` 和 `docker-compose.local.yml` 是本地构建运行。通用服务器安装默认使用官方 Release 镜像、`docker-compose.deploy.yml`（PostgreSQL、Redis、独立 Agent、迁移服务）和宿主机 Host Updater；当前产品沿用上文已确认的源码构建部署，不因通用默认值切换线上方案。

## 2. 开始工作前

### Agent 本地开发

当前机器复用上文 Docker 开发入口，不另起宿主机前后端。内嵌 Agent 运行文件位于 `backend/agent-runtime/pi/`；依赖由现有容器启动流程按锁文件处理，不因文档整理重复安装。本地未设置 `YINGCE_AGENT_URL` 时，由后端启动 Node 子进程运行 Agent，无需另启独立 yingce-agent 容器。

提示词维护约定见 [prompts/AGENTS.md](backend/internal/prompts/AGENTS.md)，运行策略见 [Agent 提示词策略](docs/content/docs/backend/agent-prompt-policy.mdx)。这些是仍在使用的不同职责，不能作为“旧 Agent”删除。

生产 Compose 设置 `YINGCE_AGENT_URL` 后只调用 yingce-agent 容器。远程服务失败时不要回退到内嵌进程，否则同一步可能执行两次。不要删除 `yingce-agent/` 或把它从发布流程里撤掉。

---

### 其他本地开发说明

1. 先读取任务涉及的入口、调用方、配置、锁文件和相邻测试；先理解现状，再决定是否抽象或重构。
2. 使用 `rg` / `rg --files` 搜索，优先并行读取相关文件。不要为了“统一风格”改动无关模块、依赖、格式或用户已有修改。
3. 先形成目标边界：页面负责什么、service 负责什么、handler/service/repository 如何分层、数据和错误如何流动。新增 helper 必须消除真实重复或隔离明确协议，不能只透传参数。
4. 检查 `git status --short`。不覆盖、不回滚、不清理非本次产生的变更；不使用 `git reset --hard`、`git checkout --` 或宽范围删除。
5. 手工编辑使用 `apply_patch`；默认使用 ASCII，业务中文或已有 Unicode 文件除外。注释只解释非直观算法、核心入口、安全边界和降级原因。

## 3. 目录职责和依赖方向

### 前端

- `web/src/pages/`：路由页面及页面私有 hook/组件；页面协调流程，不直接拼装后端协议。
- `web/src/layouts/`：路由级布局、全局浮层和页面壳；不要在页面重复设置全局 body 状态。
- `web/src/components/`：真实跨页面复用的 UI 或交互能力；页面私有组件留在页面目录。
- `web/src/services/api/`：业务 API、模型渠道协议、资源 API；不依赖 JSX、路由或 AntD 提示。
- `web/src/services/`：文件、媒体、同步、缓存和生成任务等跨页面副作用。
- `web/src/stores/`：跨页面状态和持久化配置；页面临时状态留在页面，媒体大对象不进 `localStorage`。
- `web/src/lib/`：纯函数、画布算法、协议转换、设计 token 和可独立测试的基础能力。
- `web/src/styles/globals.css`：变量、重置和必要的第三方覆盖；页面样式优先使用现有 token 或页面样式。

### 后端

- `backend/internal/handler/`：HTTP 入参、鉴权上下文、调用 service、返回统一响应；不放业务判断和数据库查询。
- `backend/internal/service/`：稳定导入面。只再导出 `internal/app` 的类型、常量和包级函数（`aliases_*.go`）。handler/cmd 继续 import 本包。
- `backend/internal/app/`：HTTP 组合根和尚未拆出的业务实现。校验、权限、跨域编排从这里进入。画布生成调度仍主要在 `provider.go`；文本 / 图片 / 视频遗留 / 音频 / HTTP / 声明式协议分别在 `provider_text.go`、`provider_image.go`、`provider_video.go`、`provider_audio.go`、`provider_http_client.go`、`provider_protocol.go`。技能库在 `internal/skills`，提示词与风格在 `internal/prompts`，登录注册在 `internal/auth`，画布分享在 `internal/canvas`，资源引用解析在 `internal/assets`，运行时策略/限流/worker 在 `internal/platform`，错误码与通用工具在 `internal/kernel`，出站 SSRF 在 `internal/outbound`，Agent 上下文检查点契约在 `internal/agentcontext`。域包不得 import `internal/service` 或 `internal/app`。
- `backend/internal/repository/`：GORM 查询和持久化；不承载业务策略。
- `backend/internal/model/`：结构、枚举和简单模型方法；不调用外部服务。
- `backend/internal/provider/`：模型供应商能力和协议实现。
- `backend/internal/database/`：数据库连接、迁移和连接池。
- `backend/cmd/`：可执行入口、迁移和启动配置；启动参数不得绕过数据目录约束。

调用链应保持为：`HTTP -> handler -> service（别名）-> app（组合根）-> 业务域包 -> repository/model -> database/resource`；需要模型上游时由域包或 app 进入 `protocol` / `generation` / `outbound`。跨层调用必须有明确理由并补测试。

### Agent、插件和文档

- 修改 `docs/` 前确认内容属于专题文档，而不是把长篇说明重新复制到根 README。目录索引见 `docs/index.md`。

## 4. 前端 API 和状态合同

### 后端业务 JSON

业务 API 的唯一调用入口是 `web/src/services/api/request.ts` 导出的 `http`：

- 模块写 `http.get/post/put/patch/delete`，由 `http` 解包 `{ code, data, msg, reason }`。不要再写 `request(apiClient.*)`，也不要再 `axios.create`。
- 二进制或非信封响应用 `http.raw`（CSV、诊断包 zip）。
- `apiClient` 只留给拦截器和 `http` 内部；默认 `VITE_CANVAS_BACKEND_URL || "/api"`、`withCredentials: true`，登录 Cookie 不放进 URL。
- `request()` 仍可用于测试信封解包，不是业务模块的调用面。
- 后端成功响应为 `{ code: 0, data: T, msg: string }`；HTTP 200 不等于业务成功，`code !== 0` 必须抛错。失败时用 `ApiError.reason` / `ApiError.code` 判断类型，不要解析 `msg`。错误码见 `web/src/services/api/error-codes.ts` 与 `docs/content/docs/backend/http-api.mdx`。
- OpenAPI 3.0 在 `GET /api/openapi.yaml`。不要从规范生成 TypeScript 客户端来替换 `http` 模块。
- API 模块定义并导出接口类型；页面和 React Query 直接接收解包后的 `data`，不重复访问 `.data.data`。
- 查询参数使用 `compactApiParams` / `serializeApiParams`；取消请求传递 `AbortSignal` 并保留取消语义。
- `FormData` 不手动设置 `Content-Type`，让 Axios 生成 boundary。写路径失败必须向上抛出，不能 `catch { return defaultValue }`。

### 模型渠道和流式请求

- 自定义渠道 URL/Header 仍由 `custom-channel-relay.ts` 的 `channelRequest` 解析；实际发出走 `channel-transport.ts` 的 `createChannelTransport`。image / video / audio 只组协议 payload，不再各自 `axios + channelRequest`。
- 自定义渠道必须由登录态后端 `/api/ai/custom` 中转；重建 headers 时清除 `x-goog-api-key` 和旧的 `X-Canvas-Upstream-Headers`，不得把第三方密钥放入浏览器 URL。
- Provider 特有 payload、响应解包和状态机留在对应 `image.ts`、`video.ts`、`audio.ts`；不要塞进通用 `request.ts`。
- 原始 `fetch` 仅用于媒体 blob/data URL、资源、Worker 或 SSE；必须检查 `response.ok`，传递正确的 `credentials` 和 `signal`。
- 文本任务 SSE 是 `GET /api/tasks/:id/text-events`，游标是递增事件 `id`；断线使用 `Last-Event-ID` 或 `?after=`，不能把任务 ID 当游标。
- 代理只对文本任务和明确的系统模型事件流路径关闭缓冲/缓存/gzip；不要给所有 `/api/` 请求复制长超时和 `proxy_buffering off`。

### 数据、缓存和写路径

- 画布、项目、任务、素材和大 JSON 使用带用户 scope 的 `localforage`；`localStorage` 只保存小型配置、当前 scope 或 UI 偏好。
- 用户切换时隔离 React Query、localforage 和资源缓存；不能让账号之间串数据。
- 后端不可用时的本地缓存是降级，不代表服务端已保存。UI 必须区分“本地缓存成功”和“服务端持久化成功”。
- 生成、激活、审批、权限、删除、上传、配额、账务和密钥相关操作属于强校验写路径；不使用空 ID、默认用户、默认权限或默认额度兜底。
- 素材删除必须先检查项目、画布、任务和其他业务引用；有引用则保留并返回来源，无引用才清理物理对象。物理删除失败不得删除素材记录。

## 5. 后端响应、权限和安全

- Gin 接口统一返回 `{ code, data, msg, reason }`；失败时 HTTP status 和业务 `code` 都应表达真实失败，不把所有错误包装成 200。机器可读原因放在 `reason`，见 `docs/content/docs/backend/http-api.mdx`。
- 所有对象读取、更新、删除都在 service 校验当前用户和资源归属；管理员权限在 service 校验，不依赖前端隐藏按钮。
- 默认拒绝本机、私网和链路本地上游。可信开发主机只能通过 `CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS` 精确放行；不要设置“允许全部私网”来绕过 SSRF 防护。
- 用户 API Key 保存在浏览器本地，任务创建时可能提交给自部署后端；只在可信部署和 HTTPS 下使用真实密钥。日志、错误上报、URL、localStorage 和持久任务正文不得写入敏感 URL、Cookie 或 API Key。
- 生产必须配置明确的 `CANVAS_CORS_ORIGINS`，保持 HTTPS，限制数据库、备份、数据目录和 `.settings-key` 权限；默认关闭公开注册。
- 数据库字段或表变化时同步更新 `docs/content/docs/backend/backend-database.mdx`，不能只改 GORM model。

## 6. 画布、UI 和设计系统

- 避免不必要的次级标签和说明文字，让布局本身解释内容（“Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.”）。优先通过分组、间距、对齐和视觉层级表达内容关系与操作顺序，不添加重复标题、装饰性标签或复述按钮含义的说明；保留必要的表单标签、状态与错误反馈、无障碍名称及影响操作判断的信息。
- 画布组件、状态、算法分别放在 `web/src/components/canvas/`、`web/src/stores/canvas/`、`web/src/lib/canvas/`。事件忽略选择器必须覆盖 modal、popover、dropdown 等浮层。
- 画布拖拽、连接、缩放和快捷键要考虑 pointer capture、滚轮冒泡、焦点以及 `data-canvas-no-zoom` / `data-canvas-wheel-scroll` 边界。
- 节点和对象名称要有可发现的铅笔入口并支持单击编辑；双击或右键不能是唯一入口。图片节点保持原始比例，面板不能长期遮挡主要画布空间。
- Ant Design 共性主题和控件状态集中在 `web/src/lib/app-theme.ts` / `AppProviders`。自带外壳的产品弹窗用 `AppModal flush`，侧栏用 `AppDrawer`；不要再复制 `padding: 0` 的 Modal styles。内容外壳仍是 `.ant-modal-container`。
- 第三方覆盖限定在具体组件，不新增全局 `.ant-modal-*`、`.dark .ant-switch-*`、`.ant-checkbox-*` 或 Segmented 状态补丁。新增 CSS 前先搜索同名选择器，回到唯一源规则修改。
- 遵循 `docs/ui-design-system.md` 及项目三层 token：Primitive → Semantic → Component。inline style 优先引用 `var(--token-name)`，不要散落颜色、圆角、阴影和层级字面值。
- 主操作、普通选中、Checkbox/Radio、Switch 是不同颜色角色；持久切换使用 `aria-pressed`，`type="primary"` 只表示当前主要命令。尊重 `prefers-reduced-motion`，键盘导航保留 `:focus-visible`。
- 修改既有页面时直接修改真实组件、样式和路由。不得创建独立 HTML 来代替真实页面验证；只有用户明确要求原型或隔离设计稿时才可生成，并放在临时目录或用户指定位置，不得放入 `web/public/` 或产品构建目录。

## 7. 本地开发、部署和数据目录

- 先阅读 `.env.example` 和对应 Compose 文件。宿主机后端开发必须使用 Git 忽略的 `.local/project-workbench-debug`，通过 `CANVAS_BACKEND_DATA_DIR` 显式指定；不要把 `backend/data` 当作开发账号数据库。
- 本地缓存放 `.local/cache`；不要提交数据库、上传文件、`.env`、真实密钥、构建产物或编辑器配置。
- 宿主机开发：`backend/` 运行 `CANVAS_BACKEND_DATA_DIR=../.local/project-workbench-debug go run ./cmd/server`，`web/` 使用 Bun 和 Vite；不要用 pnpm/npm 覆盖同一套 `node_modules`，也不要提交 `pnpm-lock.yaml` 或 `package-lock.json`。Docker 热更新使用 `docker-compose.dev.yml`；本地构建运行使用 `docker-compose.local.yml`。
- 用户要求“部署到服务器/云服务器/生产环境”且未指定方式时，默认采用 `scripts/install-server-image.sh` + 官方已发布 Release + `docker-compose.deploy.yml` + Host Updater；先确认该 Release 的镜像、更新器二进制和 `SHA256SUMS` 可用，按同一 Release 固定 `CANVAS_IMAGE_TAG` 和 `REPOSITORY_REF`。不要自行简化成 `web/backend` 两容器 SQLite 编排或生成替代 `compose.yml`；用户明确要求源码构建或轻量试运行时才选择对应方案，并说明在线更新边界。GHCR 拉取失败应排查网络、包可见性和认证，不静默切换为不受管源码部署。
- 生产 Compose 使用 `docker-compose.deploy.yml`（PostgreSQL、Redis、migrate、yingce-agent、backend、web）。源码构建可叠加 `docker-compose.build.yml`，但本地镜像不由 Host Updater 管理；`scripts/install-server.sh` 不安装更新器，不能当作在线更新安装入口。公网只暴露 web 的 `CANVAS_HTTP_PORT`（默认 `3000`），backend `8080` 留在 Compose 网络内。
- 诊断已有部署时，依据实际 Compose 文件、容器镜像、数据库驱动、数据挂载和 Host Updater 状态分别报告。源码构建不等于 local，SQLite 不证明使用了 `docker-compose.local.yml`，自定义文件名也不证明采用了任何仓库编排。已有 SQLite/自定义部署须先备份、迁移和验证，再转为受管部署；不要直接覆盖原 Compose 或数据卷。
- 默认不启动 dev server；只有用户明确要求浏览器预览或联调时才启动，并先确认端口、数据目录和现有进程。
- 健康检查只能证明入口可用，不能替代登录、SSE、任务生成和资源访问验证。

## 8. 验证纪律

项目当前默认不自动运行语法检查、类型检查、测试或构建。用户明确要求验证，或改动风险需要验证时，按范围选择最小充分命令，并在交付中如实记录：

- 前端：`cd web && bun run build`；专项测试用 `bun test ...`。UI 退场规则用 `bun run lint`（只禁 antd Empty 和静态 `Modal.confirm`，不是风格检查）。
- 后端：`cd backend && go test ./...`；涉及 PostgreSQL、资源、任务或权限时补对应集成/冒烟路径。
- 云端 Agent：前端事件流和审批路径依赖后端 `/api/agent` 接口；在该接口实现后补充后端冒烟、Worker 运行和 SSE 断线重连验证。
- 文档站：`cd docs && bun run types:check` 或 `bun run build`。
- UI 变更能浏览器验证时，检查关键路由、明暗主题、滚动、弹窗、空态和核心交互；不能验证时说明替代依据，不把静态阅读或 `git diff` 写成运行验证。
- 验证必须针对真实实现：优先专项测试、类型检查、项目 build 或真实路由浏览器验收。独立 HTML、静态仿制页面和脱离应用状态的截图不能作为真实页面通过的证据。

同类失败连续三次时停止盲试，记录现象、已排除项和新假设，再切换路径或请求用户决策。

## 9. 文档与交付

- 根 `README.md` 只保留项目定位、能力概览、快速开始、部署、安全和文档入口；详细专题写入 `docs/content/docs/`。
- 功能、代码地图、待办、待测试分别维护在 `docs/content/docs/overview/features.mdx`、`docs/content/docs/backend/code-map.mdx`、`docs/content/docs/progress/todo.mdx`、`docs/content/docs/progress/pending-test.mdx`。已实现但未由用户确认的变化先写入 `pending-test.mdx`。
- API、数据表、SSE、资源存储、部署或安全边界变化时同步对应专题文档；不要只改代码和根 README。
- 文档默认中文，不写过期日期，不公开密码、Token、Cookie、真实账号或机器敏感路径。命令、端口、环境变量必须以当前脚本和 Compose 为准。
- Git 提交说明使用 `<type>(<scope>): <业务模块> - <变更摘要>`，`type` 为 `feat|fix|refactor|perf|docs|test|build|ci|chore|revert`。

交付前至少检查：改动是否聚焦、调用方和类型是否同步、错误/权限/数据归属是否完整、必要文档是否同步、验证是否如实说明、是否留下密钥或本地数据。
