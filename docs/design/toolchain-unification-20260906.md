# 工具链与依赖整理（2026-09-06）

本批统一 Web 与 Canvas Agent 的依赖安装基线，清理确认无调用的直接依赖，并修复远端暴露的节点注册测试假设。业务后端、数据协议、画布编辑器和媒体处理算法没有改动。

基线为已同步远端的 `dad7390ac82b7333ce6f26ea2ad573021c5c4d2d`；运行相关改动截止 `0bb3b256`。各模块独立提交，可按下文回滚。本批完成本地验证，不代表新的远端 CI 已通过或生产发布完成。

## 证据、发现与处理

| 证据 | 发现 | 处理与边界 |
| --- | --- | --- |
| CI 与 Agent 清单使用 Bun 1.3.9，Docker 使用 1.3.13，本机全局为 1.3.14 | 安装和检查环境存在版本差异 | 采用已有生产构建使用的 1.3.13；根 `.bun-version` 为版本依据，两个清单和 Docker 标签由统一检查入口校验；CI 从版本文件读取 |
| Web 同时提交 `bun.lock` 和 `pnpm-lock.yaml`，现有安装入口均使用 Bun | 保留第二套锁文件可能造成依赖树分叉 | 删除 pnpm 锁文件，各子项目分别保留自己的 Bun 锁文件；不合并两个独立运行单元 |
| 全部受版本控制的源码、脚本、配置中没有 4 项依赖的调用 | 存在无调用的直接声明 | 移除 `@ant-design/icons`、`@codemirror/lang-json`、`class-variance-authority`、`mammoth`；直接依赖 57 → 53 |
| `globals.css` 引用 `shadcn/tailwind.css`，Ant Design 依赖图标包，Excalidraw 依赖 CVA | 没有 JS 直接导入不能证明依赖无用 | 保留 shadcn 与其 CSS；图标包、CVA 继续由实际消费者作为间接依赖安装；没有切换 UI 框架 |
| 清理前后锁文件和实际依赖解析比较 | Bun 对原有重复条目进行了位置调整 | 比较 1585 个仍使用的依赖节点，版本、来源、元数据和校验信息均保持一致；没有新包版本，移除 24 个不再需要的包版本 |
| 远端 Quality run `33985944147` 报内置节点数量预期 16、实际 17 | 测试把已加载插件节点也计入内置总数，受模块加载顺序影响；最小尺寸 getter 又有兜底，不能证明节点已注册 | 依据 owner 精确比较全部内置类型，并直接验证定义存在；新增插件扩展已加载的场景，结束时清理自建扩展 |
| 预加载肖像插件后，原测试本地同样失败 1 项 | 远端问题可确定性复现，无需改业务注册逻辑 | 修复后同一预加载运行 20/20 通过；修复前后日志保留 |
| `docs/` 无 package.json 和站点构建配置，AGENTS 仍说明 Next.js/Fumadocs 构建 | 文档与当前仓库状态不符 | 修正文档源定位、验证命令和索引章节；更新本地开发、Agent 与 Windows 启动说明 |

锁文件的条目数变化不等同于网络包数量或首屏下载体积；本批不把安装目录统计当作页面性能提升。

## 使用方式

先安装 `.bun-version` 指定版本，再从仓库根目录执行：

```bash
bun scripts/check-toolchain.mjs
(cd web && bun install --frozen-lockfile)
(cd canvas-agent && bun install --frozen-lockfile)
```

检查覆盖当前 Bun 版本、两个 packageManager、重复/缺失锁文件、CI 版本来源与 Docker 标签。Windows 一键启动和 Docker 开发命令也先运行它。`web` 可用 `bun run check:toolchain` 调用同一入口。

Canvas Agent 继续由 Node.js 执行；`npm run build` / `npm test` 只运行已有 scripts。没有替换本机全局 Bun，验证使用本批下载的独立 Bun 1.3.13；需要在本机复用时可将主仓库 `.local/cache/toolchain-unification-20260906/bun` 加到当前命令的 PATH。该缓存中的二进制是 macOS ARM64，其他平台按官方安装说明选择对应版本。

完整开发与验证步骤见[本地开发](../content/docs/backend/local-development.mdx)。版本文件用法依据 [setup-bun 官方说明](https://github.com/oven-sh/setup-bun#using-version-file)，安装方式见 [Bun 文档](https://bun.com/docs/installation)。

## 已执行验证

| 检查 | 结果 |
| --- | --- |
| Bun 1.3.13 全新安装、冻结锁文件再次安装 | Web 与 Agent 通过；Web 清理安装前删除的仅为本批自建 node_modules |
| 工具链 6 个隔离场景 | 正确配置通过；重复锁文件、清单漂移、Docker 漂移、CI 漂移及错误运行时分别被拒绝 |
| 插件预加载的注册表复现 | 原版 18 通过/1 失败；修复后 20 通过/0 失败 |
| 前端全量 | 1817 通过、0 失败、10527 断言、260 文件 |
| 前端生产构建 | 原生 Bridge、类型检查、Vite 构建及 7/7 体积预算通过；启动 JS 577.6/610.4 KiB，CSS 102.0/125.0 KiB |
| Canvas Agent | Node.js 22.22.0 构建通过；316 通过、0 失败、5 项 Windows 环境专用测试跳过 |
| Chrome 导演台工作流 | 58/58，通过自建 Vite、同源模拟 API 和独立浏览器执行，脚本已清理这些进程和浏览器目录 |
| Docker Web 构建 | Bun 1.3.13 冻结安装与实际 Linux ARM64 生产镜像构建通过；Nginx 配置校验通过；该镜像只用于本批验证 |
| Compose 与脚本 | Docker 开发配置解析、JS 语法检查、git diff --check 通过；本机无 PowerShell，未执行 Windows 启动流程 |
| 真实逆序 revert | 三个运行相关提交全部撤销后，完整文件树等于 `dad7390a`；没有改变主分支或真实数据 |

Backend 与原生 Bridge 源码、Go module 在本批无差异，因此不重复整套后端业务验收。此处浏览器检查为既有导演台测试覆盖，不能解释为所有页面、真实供应商或生产数据全量验收。

日志、依赖解析对比、原始远端失败及最终交接信息保存在主仓库 `.local/cache/toolchain-unification-20260906`。各文件摘要见该目录的 `SHA256SUMS`。本地缓存没有纳入 Git。

## 远端现状与后续范围

用户此前批准的 `dad7390a` 已推送到 `LUHANG0/open-ai-canvas/main`。其 [Quality run](https://github.com/LUHANG0/open-ai-canvas/actions/runs/33985944147) 中 Backend、Agent 成功，Web 因上述注册表断言失败。本批已修复并本地复验，但新的提交尚未运行远端 CI。

同一提交的[双镜像发布](https://github.com/LUHANG0/open-ai-canvas/actions/runs/33985944152) 在上传 GHCR 时被 `permission_denied: read_package` 拒绝。该包访问问题仍需核对包与仓库的授权；本批没有更换仓库、修改外部权限、替换凭据、创建 Release 或部署。

后续工程整理优先统一接口类型、错误处理与数据读写规则；绘图双引擎去留需另外评估存量文档。现有 TypeScript/Go、Zustand/Query、二维图形/三维场景各有使用者，本批保留其边界。

## 提交与回滚

| 提交 | 模块 |
| --- | --- |
| `ec4eb3fa` | Bun 基线、唯一锁文件、CI/Docker/Windows 启动检查 |
| `908e846d` | 4 项无调用直接依赖及对应锁文件整理 |
| `0bb3b256` | 注册表内置覆盖与插件共存的测试修复 |

在独立 detached 工作树执行以下操作，得到演练提交 `642aed88`、`f71e4d6f`、`9c33c62e`，最终树与起点完全一致：

```bash
git revert --no-edit 0bb3b256 908e846d ec4eb3fa
git diff --exit-code dad7390ac82b7333ce6f26ea2ad573021c5c4d2d HEAD
```

需要撤销整个批次时，先撤销本报告所在的最终文档提交，再按以上顺序撤销运行相关提交。最终文档提交号记录在本地 `handoff.json`，避免报告引用自身 SHA。恢复源码后按恢复版本的 Bun 与锁文件重新安装依赖；这不涉及数据库、媒体或生产镜像回退。
