# 梦层 v1.8.0 兼容升级

这是梦层二改的升级实施记录，不是作者官方版本的安装说明。目标是在跟进上游能力的同时保留现有产品行为与用户数据；任何阶段通过都不等同整版已上线。

## 固定输入与范围

- 梦层基线：`77d1d62183f231bb64a8d3e1f5950f5469f19f2e`。
- 上游目标：`2fe3ca13c27e46a786af6597938a0e5328df6723`，Release `v1.8.0`。本次不自动追逐目标之后的新提交。
- 实施分支：`codex/mengceng-v1.8.0`；原维护分支及其开发服务保持独立。
- 共同基线后的提交分别为梦层 96 个、上游 255 个，486 个路径双方均有修改。标准三方合并预检出现 319 个冲突文件，不能将自动合并或无冲突视为语义兼容。
- 核心业务优先；手机专项、品牌视觉重做、真实模型与支付调用不纳入本次验收。

## 二改保留合同

| 范围 | 必须保留的行为 | 当前核对入口 |
| --- | --- | --- |
| 品牌、认证和文档 | 梦层品牌/CMS/SEO、认证回跳、邮件模板及单次邀请合同，不恢复官方默认站点 | `web/src/pages/welcome/`、`web/src/pages/auth/`、`backend/internal/app/brand_site.go`、`backend/internal/auth/`、`README.md`、`AGENTS.md` |
| 画布交互和性能 | resize/redo、Portal 菜单、媒体连续播放、视口细节调度、素材库操作和独立参数变体 | `web/src/pages/canvas/`、`web/src/components/canvas/`、`web/test/canvas-history-redo.test.tsx`、`web/test/canvas-node-resize-frame.test.tsx`、`web/test/canvas-media-performance.test.ts` |
| 导入与保存 | 同批次去重、资源身份、刷新补传、修订冲突和切号隔离 | `web/src/pages/canvas/canvas-import-save.ts`、`web/src/services/user-data-sync.ts`、`web/test/canvas-import-save.test.ts`、`web/test/libtv-import.test.ts`、`web/test/tapnow-import.test.ts` |
| 对话与 Agent | 对话历史/删除语义、长对话按需展示、阅读锚点和审批权威 | `backend/internal/app/creation_history.go`、`web/test/creation-history-sync.test.ts`、`web/test/agent-conversation-history.test.tsx` |
| 模型、账号与计费 | 价格编辑、整数金额、幂等回执、结算历史、个人渠道协议与账号隔离 | `backend/internal/app/task_submission_test.go`、`web/test/task-submission-intent.test.ts`、`web/test/personal-channel-protocol-save.test.tsx`、`web/test/channel-model-price-tier-form.test.ts` |
| 素材与存储 | 私有 OSS、自定义域名、直传、配额、资源引用和恢复暂存 | `backend/internal/app/task_storage_admission_test.go`、`docs/content/docs/backend/generation-storage-recovery.mdx` |
| 发布与恢复 | 自定义源码发布、精确输入校验、旧资源保留和数据库兼容保护 | `backend/internal/hostupdate/`、`scripts/release-source.py`、`docs/content/docs/backend/mengceng-self-hosting.mdx` |

以上是需验证的合同，不因表中列出就算通过。相同功能按行为与证据择优；采用上游重写时继续保留必要回归用例。数据库、存储字节、前端缓存分别核对，不用源码文件存在推断用户数据完整。

## 阶段一：数据库基础

梦层已发布的 Schema 60/61/62 分别为创作对话历史、注册邀请和任务提交回执；上游同号记录分别为用户反馈、短剧制作和短剧片段。因此不能使用官方迁移表替换梦层迁移表，也不能将版本常量直接改为 87。

候选将梦层已有 1–62 的迁移身份保留，并把上游 v1.8.0 的 60–87 号迁移按原顺序追加为梦层 63–90。迁移名称和原上游 checksum 保留，便于核对来源；checksum 中的上游版本号不是梦层实际存储编号。

| 上游编号 | 梦层候选编号 | 结构 |
| --- | --- | --- |
| 60–68 | 63–71 | 反馈与短剧制作/片段/修订 |
| 69–75 | 72–78 | 存储产品、离线迁移作业、推广、短剧参考、用户分组和货币 |
| 76–80 | 79–83 | Agent 记忆、角色造型、商城数据、支付实收快照 |
| 81–87 | 84–90 | 方舟素材、Token 价格、技能管理、姿势库、灵感同步 |

迁移继续使用现有事务及 PostgreSQL 事务锁，不在迁移里调用外部服务。名称/checksum 不匹配时拒绝执行；官方数据库的 60 号记录不能被当成梦层库跳过。候选不提供官方数据库转换功能。

验收须覆盖：

- SQLite 和隔离 PostgreSQL 的重复迁移、旧迁移时间与校验值不改、原业务行读回、提交回执唯一性。
- 错误来源和损坏 checksum 拒绝，失败前后用户数据不变。
- 在后段迁移注入失败，确认 DDL 与新迁移记录共同回滚到 62。
- 使用冻结梦层源码生成的真实 Schema 62 合成库升级；仅用当前模型生成的旧版本记录不足以证明缺失列能补齐。
- 旧 62 版本程序拒绝连接候选新库。发布后的回退不得通过恢复旧库覆盖后续写入。
- SQLite 转 PostgreSQL 工具的表清单与模型注册表一致，既有邀请、创作历史、任务提交回执和新增业务表一同迁移，不能只升级自动建表入口。

阶段一只准备持久化基础，不表示短剧、用户分组、Token 新计价或方舟 UI 已接通。不得单独把这一阶段作为 v1.8.0 完整产品发布。

2026-11-06 阶段验证：数据库包 92 项含子用例、模型包 1 项通过，均无失败或跳过。数据库包包含 SQLite 与隔离 PostgreSQL 17 的冻结旧源码升级、重复升级、旧账本与 17 条合成业务数据保留、后段失败事务回滚；样本包含原售价/成本/规格、私人渠道/OSS 配置和已入账支付金额。另外用冻结 62 版程序验证拒绝连接 90 版库。已修改模型的原有字段名称、类型与 JSON/GORM 标签核对未发现删除或改变。

本阶段也执行了现有后端 38 个测试包：首次整包检查有三项失败，分别为迁库工具表清单不完整、验证镜像缺少模型目录样本和部署 Compose；已修正清单、补齐原仓库文件并对失败项复测通过。合并逐项结果为 3993 项含子用例通过、3 项跳过，无遗留失败；该统计不是声称初次整包命令退出成功。五项 PG/Redis 门槛通过，Node 22 独立 Agent 的 4 项连接测试通过。三项跳过分别是真实付费模型、需单独前端 runner 的素材身份专项，以及 Linux 已由另一用例覆盖的非兼容二进制备用路径。以上不等同新业务、前端、Chrome、真实支付/生成或整版发布验收；后续业务合并改变源码后需重新运行受影响门槛。

## 后续实施与放行

1. 业务层与协议：整合新表的调用方、资源引用/删除保护、模型价格与支付快照；保留任务去重、邀请、归属和现有计费合同。
2. Agent 与画布：整合审批可靠性、队列/批量/看板、姿势库与短剧连接，逐项复核已发布的性能和保存修复。
3. Web：保留梦层外壳和品牌，适配新增接口与路由；处理工作台、设置和后台功能，不直接覆盖所有界面。
4. 全套质量门槛：以当前 CI 入口检查类型、构建、前后端测试、Node、真实 PG/Redis、插件与架构；Skip 单独报告。
5. Google Chrome 隔离真实流程：旧数据读回、编辑保存、断线/重试、账号切换、审批与模拟生成；生产验收范围另列。
6. 发布前重新核对正式组件、配置、挂载、数据库和回退依据。保留正式/回退 release 和备份，发布后核对实际运行版本及受影响流程。

本地时间记录、输入清单、命令输出和临时资源归属保存在本次 `.local/v1.8-upgrade-20261106/`，不作为随仓库分发的运行数据。
