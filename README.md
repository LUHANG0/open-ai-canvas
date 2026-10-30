<p align="center">
  <img src="web/public/brand/identity/mengceng-lockup-light.svg" width="240" alt="梦层 MengCeng">
</p>

<h1 align="center">梦层 MengCeng</h1>

<p align="center">让一个故事，从文字走向银幕</p>

<p align="center">
  <a href="https://mengceng.com">梦层官网</a> ·
  <a href="https://github.com/LUHANG0/open-ai-canvas/tree/codex/upstream-v1.7.2-fixes">开发分支</a> ·
  <a href="docs/index.md">文档索引</a> ·
  <a href="CONTRIBUTING.md">参与开发</a> ·
  <a href="SECURITY.md">安全报告</a>
</p>

梦层 MengCeng 是由 [LUHANG0](https://github.com/LUHANG0) 维护的 AI 影像与短剧创作工作台，基于 [ddcat-ai/open-ai-canvas](https://github.com/ddcat-ai/open-ai-canvas) 二次开发。产品连接创作对话、参考素材、自由画布、短剧项目、生成任务和时间线剪辑，并提供账号、模型渠道、价格与账务管理。

**当前功能代码维护在 [`codex/upstream-v1.7.2-fixes`](https://github.com/LUHANG0/open-ai-canvas/tree/codex/upstream-v1.7.2-fixes)。** 默认 `main` 目前保留历史代码基线并同步入口文档，构建当前梦层请检出上述维护分支。克隆、构建和反馈问题时请注明实际分支与完整提交；仓库首页不能代替线上实例的版本记录。

产品入口为 [mengceng.com](https://mengceng.com)。注册方式由站点配置决定，关闭公开注册时通过管理员邀请加入；仓库不提供公共演示账号。

## 创作能力

- **创作对话**：结合文字、参考素材和技能组织创作，跟踪生成结果与历史；登录后按账号同步，保留保存失败和修订冲突状态。
- **自由画布**：节点、连线、框选、缩放、撤销重做、导入导出与只读分享，将生成结果放回创作上下文。
- **短剧项目与预演**：组织剧本、角色、场景、分镜和工作流，并使用 3D 预演工具辅助镜头规划。
- **图片、视频、音频与文本任务**：由统一任务系统管理模型参数、执行进度、取消、重试与结果。可用能力取决于实际启用的渠道、模型和账号权限。
- **素材与时间线**：管理素材引用，编排片段、字幕和转写，支持服务端导出；外部存储、转写和生成服务须单独配置。
- **云端 Agent**：提供创作上下文、持久化会话、技能、工具审批与流式事件恢复，媒体生成仍按产品权限与计费合同执行。
- **运营后台**：管理邀请注册、渠道与逻辑模型、规格价格、用量明细和报表，以及官网草稿、预览、发布与上一版恢复。

功能与边界见[功能清单](docs/content/docs/overview/features.mdx)、[代码地图](docs/content/docs/backend/code-map.mdx)和[待验收事项](docs/content/docs/progress/pending-test.mdx)。文档中的设计提案、代码实现、测试通过和生产验收是不同状态，以各专题说明及具体版本证据为准。

## 梦层的维护方式

本仓库以梦层现有产品和数据合同为基线，选择性吸收上游更新。创作保存、账号隔离、素材引用、价格编辑与计费属于持续维护的边界；同步上游时须结合现有实现与回归验证，不整版覆盖。

发布采用本仓库源码构建的独立 Web、Backend 和 Agent 镜像，并保留实际 Compose 叠加配置、数据库、数据卷、密钥及站点 nginx/CDN 配置。二改 Host Updater 使用本机不可变发布清单与专用站点适配器。相关代码和验收入口已经提供，**正式环境安装、启用和每次发布仍需要目标环境的独立核对**；后台“系统更新”页面存在不代表更新器已经启用。

上游关系和取舍见[选择性整合记录](docs/content/docs/progress/upstream-v1-7-2-integration.mdx)。上游历史赞助与贡献者资料保留在[来源与致谢](docs/upstream-credits.md)，原作者的版权、许可证与历史提交保持。

## 本地开发

前端使用 **Bun 1.3.9、React、TypeScript、Vite**，后端使用 **Go 1.25、Gin、GORM**。本地可使用 SQLite；PostgreSQL 部署同时需要 Redis。独立 Agent 和后端内嵌运行时的 Node 版本与依赖以 Dockerfile 和锁文件为准。

```bash
git clone --branch codex/upstream-v1.7.2-fixes https://github.com/LUHANG0/open-ai-canvas.git
cd open-ai-canvas
```

在仓库根目录打开第一个终端，启动后端：

```bash
mkdir -p .local/project-workbench-debug .local/cache/go-build .local/cache/go-mod
cd backend
CANVAS_BACKEND_ADDR=127.0.0.1:8080 \
CANVAS_BACKEND_DATA_DIR=../.local/project-workbench-debug \
GOCACHE="$PWD/../.local/cache/go-build" \
GOMODCACHE="$PWD/../.local/cache/go-mod" \
go run ./cmd/server
```

在仓库根目录打开第二个终端，启动前端：

```bash
cd web
bun install --frozen-lockfile
bun run dev
```

访问 [http://localhost:3000](http://localhost:3000)，在受控环境完成首次管理员注册和渠道配置。前端默认将 `/api` 代理至 `http://127.0.0.1:8080`，代理目标可通过 `VITE_API_PROXY_TARGET` 调整。已有服务运行时，先核对端口并复用，避免启动第二套服务占用相同数据目录。

Windows 用户可在仓库根目录运行 `scripts/start-local.ps1`。容器热更新使用 `docker-compose.dev.yml`；本地构建试运行使用 `docker-compose.local.yml`，均不自动安装正式更新器。具体步骤见[本地开发](docs/content/docs/backend/local-development.mdx)。

## 自建部署与升级

梦层部署入口见[自建部署指南](docs/content/docs/backend/mengceng-self-hosting.mdx)，完整发布合同见[系统更新与安全回退](docs/content/docs/backend/system-update.mdx)。

| 场景 | 入口与要求 |
| --- | --- |
| 全新独立 Linux 服务器 | 从梦层维护分支获取源码，显式指定本仓库与分支后使用源码安装器，或审阅 Compose 后自行构建。 |
| 已有梦层站点 | 核对独立组件版本、实际配置与挂载，准备备份与候选，在隔离环境验收后按已有发布流程更新。 |
| 二改 Host Updater | 使用可信宿主 profile、不可变组件清单和经校验的站点发布适配器；先完成完整联动与恢复验收，再安装启用。 |
| 本地试运行 | 使用本地开发或本地构建 Compose，生产升级、迁移和恢复另行处理。 |

基础编排为 `docker-compose.deploy.yml`，源码构建叠加层为 `docker-compose.build.yml`。已有部署可能另有站点专用叠加层，运维命令必须使用完整文件顺序和原 project。上游 Release 镜像与默认安装器面向上游发布渠道，不能作为梦层定制站点的升级来源。只修改仓库名称或环境变量不足以完成更新适配。

数据库迁移与备份恢复须使用隔离数据验证。前端/Agent 代码回退保留新业务写入；涉及后端与数据库的恢复须按具体版本核对，不能将旧数据库直接覆盖到已有新写入的生产站点。

## 文档导航

- [文档索引](docs/index.md) · [功能清单](docs/content/docs/overview/features.mdx) · [代码地图](docs/content/docs/backend/code-map.mdx)
- [自建部署](docs/content/docs/backend/mengceng-self-hosting.mdx) · [系统更新](docs/content/docs/backend/system-update.mdx) · [本地开发](docs/content/docs/backend/local-development.mdx)
- [数据库](docs/content/docs/backend/backend-database.mdx) · [HTTP API](docs/content/docs/backend/http-api.mdx)
- [创作历史同步](docs/content/docs/backend/creation-conversation-sync.mdx) · [画布操作与同步](docs/content/docs/backend/canvas-operations-sync.mdx)
- [邀请注册与积分](docs/content/docs/backend/registration-invitations.mdx) · [品牌官网发布](docs/content/docs/backend/mengceng-brand-site.mdx)
- [待验收事项](docs/content/docs/progress/pending-test.mdx) · [上游整合记录](docs/content/docs/progress/upstream-v1-7-2-integration.mdx)
- [上游更新历史](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md) · [上游致谢](docs/upstream-credits.md)

`docs/` 是随仓库维护的专题文档，目前没有独立文档站构建脚本。设计和 ADR 保留各自的提案或决策身份，不作为已上线功能的证明。

## 开发验证

按改动范围选择检查，完整依赖和门禁以 `.github/workflows/quality.yml` 为准：

```bash
# 在 web/ 下：类型、静态规则、测试与构建
bun run typecheck
bun run lint
bun run test
bun run build

# 在 backend/ 下：相关包或完整测试
go test ./...

# 在仓库根目录：发布脚本专项与差异检查
python3 -m unittest discover -s scripts -p 'test*.py'
git diff --check
```

浏览器验收使用真实产品路由；完整后端测试需要独立 PostgreSQL、Redis 和 Node 依赖。缺少依赖而跳过用例，不代表验收通过。真实付费生成、支付或外部投递使用隔离替身，生产调用另行明确授权。

## 安全与许可

使用 HTTPS、明确的 CORS 来源和受保护的数据目录；首个管理员在开放公网前创建。不要提交 `.env`、Cookie、密钥、数据库、素材或生产备份。安全问题按 [SECURITY.md](SECURITY.md) 联系梦层维护者。

项目沿用 [MIT 许可证](LICENSE)。上游版权及第三方声明见 [NOTICE](NOTICE) 和相应组件目录；梦层的产品品牌、维护入口与发布渠道由本仓库独立管理。
