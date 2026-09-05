<p align="center">
  <img src="web/public/logo.svg" width="88" alt="影策 logo">
</p>

<h1 align="center">影策</h1>

<p align="center">让一个故事，从文字走向银幕</p>

<p align="center">
  <a href="https://github.com/LUHANG0/open-ai-canvas">GitHub</a> ·
  <a href="docs/content/docs/overview/features.mdx">功能清单</a> ·
  <a href="docs/index.md">开发文档</a> ·
  <a href="CHANGELOG.md">更新日志</a> ·
  <a href="SECURITY.md">安全策略</a>
</p>

影策是一套面向 AI 影视、短剧和视觉内容生产的开源创作工作台。它把对话创作、自由画布、结构化分镜、角色与场景资产、多媒体生成、任务管理和本地 Agent 整合在同一个项目中，帮助创作者把文字构思逐步转化为可管理、可复用、可交付的镜头素材。

当前版本以 **PC 端创作体验** 为核心，适合个人创作者、AI 影视团队和需要自行接入模型渠道的工作室。

> **维护声明：** `LUHANG0/open-ai-canvas` 的 `main` 是本项目唯一持续维护、测试和部署的代码基线。原作者仓库仅作为上游来源与版权归属记录，不会被安装脚本、自动更新器或日常开发任务自动同步、合并或部署。

> 项目仍在持续开发，数据结构和外部接口可能随版本调整。默认适合本地或可信环境部署；公开上线前，请先完成 HTTPS、注册策略、跨域、数据备份和密钥保护配置。

## 影策能做什么

一条典型的创作链路可以在影策内完成：

1. 通过连续对话、创作入口或短剧工作台整理故事、角色和脚本。
2. 建立角色、场景、风格、参考图和其他项目资产。
3. 调用已配置的图片、视频、文本或音频模型生成内容。
4. 将生成结果添加到镜头或自由画布，继续编排、关联和迭代。
5. 在任务中心追踪异步任务，在素材库沉淀可复用资产。
6. 通过短剧流程、时间线和导出能力完成后续制作与交付。

## 核心能力

| 模块       | 主要能力                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------- |
| 创作入口   | 连续对话、镜头创作、图片生成、视频生成、历史会话和结果复用                                   |
| 自由画布   | 文本、图片、视频、音频、分镜、文件夹等节点；拖拽、框选、缩放、连线、分组、撤销重做和导入导出 |
| 短剧工作台 | 项目、剧本、角色、场景、分镜与生成资产的结构化管理                                           |
| 多模型生成 | 文本、图片、视频、音频任务；支持参考素材、首尾帧、运镜、续写、局部修改和批量生成             |
| 任务与素材 | 异步任务、进度状态、失败重试、任务日志、账号素材库和资源引用检查                             |
| 模型与计费 | 系统渠道、逻辑模型、协议适配、Token/次数计费、积分结算和功能开关                             |
| Agent 协作 | 画布助手、本地 Canvas Agent、MCP 工具、Codex App 插件和技能扩展                              |
| 管理能力   | 用户、渠道、模型、用量、积分、对象存储、系统配置和管理后台                                   |

更细的功能边界和当前实现状态见[功能清单](docs/content/docs/overview/features.mdx)。

## 项目结构

```text
open-ai-canvas/
├── web/             React + TypeScript 前端，包含创作页、画布、短剧和管理入口
├── backend/         Go 后端，负责账号、项目、任务、资源、渠道、计费和权限
├── canvas-agent/    连接网页画布与本机 Codex/CLI 的本地 Agent
├── plugins/yingce/  影策 Codex App 插件
├── docs/            产品、架构、开发、部署和测试文档
├── scripts/         本地启动、服务器安装、更新和维护脚本
└── nginx.conf       生产环境反向代理、资源和 SSE 路由示例
```

整体调用关系：

```text
浏览器（web）
  ├─ 创作页 / 自由画布 / 短剧工作台 / 管理入口
  ├─ Zustand 与 localForage 本地状态、缓存和历史媒体迁移
  └─ /api 请求、资源请求、SSE
          │
          ▼
后端（backend）
  ├─ Gin handler → service → repository/model
  ├─ SQLite（本地）或 PostgreSQL + Redis（部署）
  ├─ 异步任务、资源存储、权限、渠道和积分结算
  └─ provider/outbound → 外部模型服务

Canvas Agent ↔ 浏览器画布 ↔ Codex MCP / 本机 CLI
```

开发环境中，前端默认将 `/api` 代理到 `http://127.0.0.1:8080`。生产环境由网页容器的 Nginx 转发请求，通常只需对外开放 Web 端口。

## 快速开始

### 环境要求

- Bun（版本以根目录 `.bun-version` 为准）
- Go 1.25
- Node.js 18+（使用 Canvas Agent 时需要）
- Docker 与 Docker Compose（仅容器方式需要）

### 本机开发

克隆当前维护仓库：

```bash
git clone https://github.com/LUHANG0/open-ai-canvas.git
cd open-ai-canvas
mkdir -p .local/project-workbench-debug .local/cache/go-build .local/cache/go-mod
bun scripts/check-toolchain.mjs
```

启动后端：

```bash
cd backend
CANVAS_BACKEND_DATA_DIR=../.local/project-workbench-debug go run ./cmd/server
```

另开一个终端启动前端：

```bash
cd web
bun install --frozen-lockfile
bun run dev
```

打开 <http://localhost:3000>。后端默认监听 `8080`，前端默认监听 `3000`。注册第一个管理员账号后，在管理端配置模型渠道、逻辑模型和计费规则。

Windows PowerShell 可以在仓库根目录执行：

```powershell
.\scripts\start-local.ps1
```

该脚本使用 Git 忽略的 `.local/project-workbench-debug` 保存开发数据，避免与仓库示例数据混用。更多环境变量和排错方法见[本地开发文档](docs/content/docs/backend/local-development.mdx)。

### Docker 开发

源码热更新：

```bash
LOCAL_UID=$(id -u) LOCAL_GID=$(id -g) \
  docker compose -f docker-compose.dev.yml up --build
```

本地构建 release 镜像：

```bash
BUILD_VERSION="$(tr -d '\r\n' < VERSION)" \
BUILD_COMMIT="$(git rev-parse HEAD)" \
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
docker compose -f docker-compose.local.yml up -d --build
```

端口冲突时，可以通过 `CANVAS_WEB_HOST_PORT` 和 `CANVAS_BACKEND_HOST_PORT` 修改宿主机映射端口。

### 私网模型与本机渠道

后端默认拒绝本机、私网和链路本地的上游地址。开发环境如需访问可信私网模型，请配置精确白名单：

```bash
CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS=192.168.1.10
```

不要用全局放行代替白名单。本机渠道只有在后端绑定 `127.0.0.1:8080` 且设置 `CANVAS_DESKTOP_LOCAL_CHANNELS_ENABLED=true` 时才会启用。

## 服务器部署

### 从当前源码构建

Linux 服务器推荐使用当前 `main` 的源码安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/LUHANG0/open-ai-canvas/main/scripts/install-server.sh | sudo bash
```

脚本会安装并配置 Docker，生成受保护的 `.env`，构建前后端镜像，并启动 PostgreSQL、Redis、后端和 Web 服务。默认访问地址为 `http://服务器IP:3000`。

源码安装脚本会从 `VERSION` 和当前 Git 提交生成 `BUILD_VERSION`、`BUILD_COMMIT`、`BUILD_TIME` 与唯一的本地镜像标签，并写入受保护的 `.env`。部署后应通过 `/api/health/ready` 核对版本和完整提交 SHA。

查看状态与日志：

```bash
cd /opt/open-ai-canvas
sudo docker compose --env-file .env \
  -f docker-compose.deploy.yml -f docker-compose.build.yml ps
sudo docker compose --env-file .env \
  -f docker-compose.deploy.yml -f docker-compose.build.yml logs -f --tail=200
```

### 使用已发布镜像

只有确认 GHCR 中存在与当前维护版本匹配的 `LUHANG0` 镜像时，才使用镜像安装方式：

```bash
curl -fsSL https://raw.githubusercontent.com/LUHANG0/open-ai-canvas/main/scripts/install-server-image.sh \
  | sudo env CANVAS_IMAGE_TAG=1.2.2-preview.5 bash
```

生产环境必须将 `CANVAS_IMAGE_TAG` 固定为明确的 Release；安装脚本和 Compose 都会拒绝空值或 `latest`。系统更新、备份验证和异常回退流程见[系统更新文档](docs/content/docs/backend/system-update.mdx)。

### 上线前检查

- 在受控网络中注册首个管理员，然后保持 `CANVAS_REGISTRATION_ENABLED=false`。
- 配置准确的 `CANVAS_CORS_ORIGINS`，公网环境不要使用 `*`。
- 使用 HTTPS，并正确传递 `Host`、`X-Forwarded-For` 和 `X-Forwarded-Proto`。
- 后端 `8080` 应留在容器网络或可信内网，不要直接暴露到公网。
- 保护 `.env`、数据库、上传目录、对象存储密钥、备份和 `.settings-key`。
- 为数据库和媒体目录建立独立、可恢复的备份，不能把数据卷本身当作备份。
- SSE 关闭缓冲的配置只应用于明确的事件流路径，不要复制到所有 API 请求。

反向代理与流式路由示例见 [nginx.conf](nginx.conf)。

## 数据、渠道与安全边界

- 项目、画布、任务和素材在登录后同步到后端；浏览器保留必要的本地状态、读缓存和历史媒体迁移能力。
- 本地默认使用 SQLite；部署环境使用 PostgreSQL 和 Redis。多实例模式需要 Redis 协调限流、并发和熔断状态。
- 媒体资源可存放在后端数据目录、阿里云 OSS 或腾讯云 COS；长期引用使用稳定的资源标识。
- 自定义渠道经后端中转，并受 SSRF 防护限制。开发中的可信私网主机必须显式加入白名单。
- 用户 API Key 不应出现在 URL、日志、错误上报或公开配置中；接入真实渠道前应确认后端可信且链路使用 HTTPS。
- Token 或次数计费由管理端规则控制。上线前应使用真实渠道的小额任务核对预授权、最终 usage、积分扣减、失败退款和明细记录。
- `CANVAS_BILLING_TOKEN_SUPPLEMENT_MAX_BPS` 用于限制实际 Token 费用超出预授权时的自动补扣范围；超限或余额不足的任务应进入人工核对，而不是产生负余额。

安全问题请按照[安全策略](SECURITY.md)报告，不要在公开 Issue 中粘贴密钥、Cookie、数据库内容或生产日志。

## Canvas Agent 与 Codex 插件

Canvas Agent 用于连接网页画布与本机 Codex/CLI。仓库内开发运行方式：

```bash
cd canvas-agent
bun install --frozen-lockfile
npm run build
node dist/index.js
```

Web 与 Canvas Agent 均以各自的 `bun.lock` 和根目录 `.bun-version` 作为唯一依赖安装基线；`npm` 仅运行已有 scripts，不使用 `npm install`。工具链检查与常用验证命令见[本地开发](docs/content/docs/backend/local-development.mdx)。

启动后，将终端输出的 Local URL 和 Connect token 填入画布右上角的 Agent 面板。Agent 默认只监听 `127.0.0.1`，连接 token 不应写入 URL、日志或任务正文。

为了兼容既有安装方式，当前已发布 npm 包名仍沿用历史名称：

```bash
npx -y @ddcat666/open-ai-canvas-agent
```

后续开发和版本判断以本仓库源码为准。完整说明见 [Canvas Agent 文档](canvas-agent/README.md)和[影策 Codex 插件文档](plugins/yingce/README.md)。

## 开发与验证

按改动范围运行对应验证：

```bash
# 前端测试与生产构建
cd web
bun test
bun run build

# 后端测试
cd ../backend
go test ./...

# Canvas Agent
cd ../canvas-agent
npm test
npm run build
```

入口文档链接可以单独检查：

```bash
cd web
bun test test/documentation-links.test.ts
```

前端 `bun run build` 会执行 Canvas Agent 桥接构建、TypeScript 检查、Vite 生产构建和体积预算。UI 改动除自动化测试外，还应在浏览器中回归关键路由、主题、弹窗、滚动、上传、任务状态和空态。

## 文档导航

- [功能清单](docs/content/docs/overview/features.mdx)
- [维护与分支策略](docs/content/docs/overview/maintenance-policy.mdx)
- [本地开发](docs/content/docs/backend/local-development.mdx)
- [数据库结构](docs/content/docs/backend/backend-database.mdx)
- [系统更新](docs/content/docs/backend/system-update.mdx)
- [插件系统](docs/content/docs/plugins/plugin-system.mdx)
- [插件显示形态](docs/content/docs/plugins/plugin-surfaces.mdx)
- [待测试清单](docs/content/docs/progress/pending-test.mdx)
- [短剧界面审计](docs/content/docs/progress/short-drama-content-ui-audit-20260903.mdx)
- [完整文档索引](docs/index.md)
- [更新日志](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)

根目录 [AGENTS.md](AGENTS.md) 约束协作方式，维护和部署相关变更必须遵守当前仓库的分支与回滚规则。

## 维护与版本来源

- 日常开发、修复、部署和发布只以 `LUHANG0/open-ai-canvas` 的 `main` 为基线。
- 功能分支完成验证后再合并到 `main`，关键阶段应建立可识别的 Git 提交和回滚点。
- 上游仓库只用于版权说明和人工参考，不会自动覆盖本项目代码。
- 部署脚本、在线更新器和镜像命名空间均指向当前维护仓库。

详细规则见[维护与分支策略](docs/content/docs/overview/maintenance-policy.mdx)。

## 许可证与上游

本项目采用 [MIT License](LICENSE)。当前维护版本由 [LUHANG0/open-ai-canvas](https://github.com/LUHANG0/open-ai-canvas) 持续开发，基于 [ddcat-ai/open-ai-canvas](https://github.com/ddcat-ai/open-ai-canvas) 演进；该项目又源自 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 的早期版本。

上游作者和贡献者保留其对应代码的权利与署名，完整记录见 [NOTICE](NOTICE)。
