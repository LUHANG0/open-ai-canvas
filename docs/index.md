# 影策 · AI 文档索引

面向 AI 的短索引。详细文档维护规则见 [AGENTS.md](../AGENTS.md) 第 10 节「文档同步」。

## 设计沉淀

- [技能库与插件中心 B4](design/brand-skills-plugins-20260905.md)：跨端技能列表/安装/编辑、真实插件状态与 Eagle 本机配置、故障恢复、隔离证据和模块回滚。

- [系统渠道与前台模型 C2](design/brand-admin-channels-models-20260905.md)：品牌列表与模型表单、价格版本冲突、批量部分失败、路由模拟及前台目录同步，含隔离证据与模块回滚。

- [个人设置与积分中心 B3](design/brand-settings-wallet-20260905.md)：九个真实设置分区、跨端保存与读取反馈、积分筛选/分页/兑换、隔离验证和逐模块回滚。

- [后台网站设置与用户管理 C1](design/brand-admin-settings-users-20260905.md)：紧凑品牌分区、保存与冲突恢复、用户表格及邀请/编辑/积分详情抽屉，含隔离浏览器验证和逐提交回滚。

- [画布视频封面刷新恢复](design/canvas-video-poster-recovery-20260905.md)：修复重挂载复用已取消任务导致的空封面，包含用户确认、48 个视频复测、1789 项全量测试基线收尾与回滚方法。

- [品牌风格统一分析](design/brand-style-unification-audit-20260905.md)：以当前品牌页为基准，覆盖用户前台、22 个后台页面、主题断点、配置消费和分批验收方案。
- [品牌风格统一实施记录](design/brand-style-unification-implementation-20260905.md)：第一批主题、前后台外壳与配置同步的提交、验收证据和逐阶段回滚方法。
- [品牌核心流程 B1 实施记录](design/brand-core-flow-implementation-20260905.md)：创作、任务与素材页的风格统一、本地明暗及响应式验证与回滚记录；实现完成，待用户验收，后续 B/C/D 继续分批处理。
- [全局品牌加载动效](design/brand-loading-motion-20260905.md)：从首屏到路由、弹层与按钮的统一等待反馈、开发预览、验证与回滚记录。
- [画布与短剧项目 B2](design/brand-library-pages-20260905.md)：现有列表入口的响应式统一、卡片与弹窗、真实操作及故障恢复验证、逐提交回滚方法。

- [网站设置精简](design/website-settings-simplification-20260905.md)：删除独立官网 CMS，保留四个常用分区，以及封面、联系和备案的限定字段保存。

- [品牌官网与整页登录](design/public-brand-launch-20260905.md)：电影感公开页面、居中登录、Logo 与素材来源、备案草稿发布及验证记录。

- [PC 画布全流程检查与优化方案（2026-09-02）](design/2026-09-02_canvas-interaction-audit-report.md)：R15 基线的入口盘点、实测问题、代码风险、分阶段优化与集中验收清单；本轮未修改产品代码。

- [工作区外壳设计沉淀](design/workspace-shell-design.mdx)：侧栏（260px 可折叠导航 + 分组折叠）、主区卡片、顶部栏（账户/公告/主题）的设计决策与样式约束。

- [画布节点可读性设计沉淀](design/canvas-node-visual-contrast.mdx)：节点外壳、空态和图片创作面板在浅色/深色画布上的表面、边界、阴影与控件状态约束。

- [画布浮动控件设计沉淀](design/canvas-floating-controls.mdx)：顶部操作区、底部 Dock、小地图和右下角工作模式切换的浮动面板、定位与响应式约束。

- [用户诊断包设计](design/user-diagnostic-bundle.mdx)：面向普通用户的一键日志导出、前后端链路关联、脱敏、权限与排障方案。

- [肖像权可识别性排查画布插件实施规格](design/portrait-clearance-canvas-plugin.mdx)：TypeScript 重写、画布节点与全屏工作台、项目模型复用、本机 ONNX/百度识图/候选去重、任务合同、报告和验收方案。

## 本地协作文档（不随仓库分发）

`beautifului-creation-design.md` 属于本地设计参考，未纳入版本控制，因此不提供可点击的仓库链接。

## 按约定维护的文档（`docs/content/docs/`）

功能、代码地图、待办、待测试分别维护在以下页面；尚未建立的专题会在对应任务中补齐：

- [功能](content/docs/overview/features.mdx)
- [维护与分支策略](content/docs/overview/maintenance-policy.mdx)
- [本地开发](content/docs/backend/local-development.mdx)
- [后端数据库](content/docs/backend/backend-database.mdx)
- [上线监控、值守与发布回滚手册](content/docs/backend/launch-operations.mdx)
- 代码地图：待补充
- 待办：待补充
- [待测试](content/docs/progress/pending-test.mdx)
