# 品牌收尾：剩余后台、公开分享与辅助页面

本批完成下表范围的样式与状态收尾，并在隔离本地环境验证；生产上线仍由发布准备任务检查远端候选、部署环境与供应商。本批没有推送、生产部署、真实插件安装、外部消息或付费调用。

## 基线与边界

本批从干净本地 main `70b810bae2ab5a2685fb231820b37cdcc4975e67` 建立独立分支，确认 origin/main 为祖先，保留领先的 119 个本地提交。仅处理下列页面、私有样式和可复现状态问题；沿用统一主题、鉴权、用户 scope、账务、资源引用保护与更新协议。3014/8094 使用独立忽略数据目录；长期 3012、真实 8080 不参与写入验证。不安装真实插件、不调用付费供应商、不更新生产。

## 路由与消费者清单

| 入口 | 实际实现/消费者 | 起始状态 | 本批状态 |
| --- | --- | --- | --- |
| `/admin` | admin-route-pages → analytics-panel；统计、趋势、价格抽屉 | 共享后台主题，读取失败仅浮条 | 完成：数据与等待/失败分开，日期弹层手机完整可滚动 |
| `/admin/plugins` | plugins/plugins-page；平台开关及用户插件中心 | 共享表格，手机概览挤压 | 完成：双列摘要不裁切，开关刷新回读及列表重试 |
| `/admin/prompt-templates` | storyboard-prompts-page；用户提示词偏好及生成模板 | 共享表格，编辑抽屉 | 完成：固定表格、编辑器名称、保存锁与失败重试 |
| `/admin/resources` | StorageResourcesPage → storage-resources-panel | 实际可删除且保护引用，入口误称只读 | 完成：描述、旧选择清理、预览恢复、实际引用拒删 |
| `/admin/settings/drawing-engine` | drawing-engine-settings-page；绘图节点 | 共享 token，专用表单 | 完成：专属样式及确认焦点，配置保存回读 |
| `/admin/settings/runtime-policy` | runtime-policy-settings-page；资源/任务/请求限制 | 42项策略，专用表单 | 完成：手机字段单列、长页滚动与确认，真实保存回读 |
| `/admin/settings/ark-private-assets` | ark-private-assets-settings-page；方舟私有资源 | 凭据脱敏、依赖配置 | 完成：手机凭据单列、保存失败保留、脱敏回读 |
| `/admin/settings/response-interception` | response-interception-settings-page；响应规则 | 顺序规则、预览及保存 | 完成：保留依赖显示、顺序语义、保存回读及确认 |
| `/admin/settings/third-party` | libtv-settings-page；LibTV 导入消费者 | 凭据留空保留、显式清除 | 完成：确认与错误状态、假凭据保存刷新；未请求外部 LibTV |
| `/admin/settings/system-update` | system-update-page；更新器API | 状态失败无重试、真实操作仅假协议验证 | 完成：重试、陈旧状态禁用动作、假协议重连/人工介入 |
| `/share/canvas/:token` | canvas/shared；匿名快照与媒体恢复 | 已共享画布主题，失效后无就地重试 | 完成：全尺寸品牌、重读/空态、匿名媒体、撤销/未授权 |
| `*` | not-found/index | 品牌布局仅桌面 | 完成：配置 Logo、全尺寸主题、正确返回首页 |
| 路由 errorElement | route-error | 品牌布局仅桌面 | 完成：全尺寸异常布局、重新加载/返回主页 |
| `/test-voice-recording` | VoiceRecordingButton 测试原型，无用户导航消费者 | 独立原型仍进生产路由 | 完成：DEV 专用，生产落 404；合成录音回填与取消 |

旧入口 `/admin/storyboard-prompts`、`/admin/settings/concurrency`、`/admin/settings/libtv` 分别重定向模板、运行策略、第三方服务。录音组件仍由对话输入消费者使用，本批只将原型路由遵循现有 DEV 约定。

## 证据、发现与处理

| 证据 | 发现 | 处理路径 |
| --- | --- | --- |
| `layout.json`、插件手机截图 | 概览第二行被 flex 压缩；凭据/42项策略字段过窄 | 摘要不收缩、手机字段单列；固定表格保留自身横滚 |
| `analytics-extra.json`、日期截图 | 两个月份的日期浮层超出手机宽度和底部 | 仅概览日期浮层使用手机定位、纵向月份与容器滚动，四断点深浅主题通过 |
| `configs.json`、`focus-final.json` | 长配置确认需复用既有焦点边界；普通编辑 Modal 样式不能套确认框 | 复用 C4 helper，增加 textarea 可聚焦项；20种配置/主题/视口组合正反向 Tab 留在确认框 |
| `lists.json` | 统计/插件/模板/资源失败仅浮条，旧结果易被当作当前查询 | 就地错误与重试；统计/列表隐藏旧结果，资源筛选清空旧批选，保留接口协议 |
| `lists.json`、资源引用截图 | 存储页描述误称只读；文件加载失败没有恢复入口 | 修正文案；保留真实服务端引用保护，画布引用图片实际拒删，媒体预览可重读 |
| `lists.json` | CodeMirror 外层名称未关联实际输入节点 | 为实际 contenteditable 添加可访问名称；模板创建、刷新过滤、草稿取消保留通过 |
| `updater.json` | 更新器读取失败没有恢复入口，旧状态仍可能呈现可开始动作 | 增加刷新、失败禁用更新/回退；明确回退可能失败及外部对象责任，假协议验证切换、断线、人工介入 |
| `public-voice.json`、`share-recovery.json` | 分享缺少重读与空态；错误页手机缺少品牌表面 | 保留只读权限，增加重读和空态，匿名图片失败后恢复、撤销失效、所有者接口401通过 |
| 生产 manifest、`production.json` | 录音原型被打进生产路由，文案错误声称上传及发送成功 | DEV lazy 工厂；保留对话录音组件，按真实浏览器识别能力说明，移除正文控制台输出 |

后台专属规则按原顺序从 `styles/admin-ui.css` 移入 `admin/components/admin-remaining.css`，只由 Admin 模块导入；共享后台选择器和已完成页面保留。专属圆角/阴影改用语义变量。没有修改数据库、权限、密钥保存合同、资源引用协议、更新器部署实现或生成枚举。

## 验证

脱敏证据与文件摘要见 [verification.json](evidence/brand-remaining-20260906/verification.json)。逐项已完成检查共199项，按各脚本最终结果计数；[手机日历](evidence/brand-remaining-20260906/analytics-date-390-light.png)、[分享恢复](evidence/brand-remaining-20260906/share-recovered-390-light.png)、[更新确认](evidence/brand-remaining-20260906/update-confirm-390-light.png)及其他精选截图存放同目录。

本机 Chrome、独立虚构管理员与 SQLite、明确 `CANVAS_BACKEND_DATA_DIR`；前端3014/后端8094，生产静态预览3015。截图中早期默认品牌为影策，后续隔离配置改为帧镜；没有复制真实品牌配置、真实账号或历史媒体。

- 52项最终页面矩阵：13个可导航页面 × 390/1440 × 深浅主题；另外路由异常单独故障注入，5个长配置20种组合检查滚动及确认焦点，3个旧路由别名通过。
- 五配置25项实际隔离 API 检查：首次读取503、恢复、草稿确认、保存503保留、保存成功及刷新回读。只验证配置落库，未声称 tldraw 授权、方舟/LibTV 真实供应商或运行配额边界全面有效。
- 插件开关实际保存/刷新、模板实际创建/编辑输入/筛选/取消、资源图片预览及画布引用拒删；未上传或卸载真实插件。
- 公开分享在390/1440/1023/1024深浅主题读取真实隔离PNG，匿名浏览无写请求，私有接口401、撤销失效；另四种组合检查瞬时503恢复、空态、媒体失败后重读及手机头部边界。
- 更新器12项假协议检查包括双主题双视口确认、单次开始、断线重连、人工介入、回退原因焦点、失败状态禁用动作和恢复。未触发本机真实更新器或生产升级。
- 概览16项图表指标切换与日期弹层边界检查；生产静态包8入口检查，录音DEV入口在生产显示404，manifest中录音/DEV页面均不存在。
- 前端完整1816项、10507断言、0失败；TypeScript与生产构建通过，7项预算通过。启动JS590.8/610.4KiB、启动CSS102.0/125KiB。相关Go服务专项通过，handler匹配范围无测试，不把它计为额外通过。

```sh
cd web
bun test
bun run build
cd ../backend
go test ./internal/service ./internal/handler -run 'Test(PublicCanvas|CanvasShare|Admin.*Resource|ResponseInterception|RuntimePolicy)' -count=1
```

首次全量因独立工作树缺少 canvas-agent 依赖链接导致1个跨运行时测试无法加载，补齐本批链接后完整重跑通过。浏览器脚本曾因实际统计路径、AntD两字按钮空格、隐藏标题的严格定位、测试画布日期格式及模拟识别取消回调中断；逐项校正后完成对应补验，没有把中断脚本当作整组通过。测试脚本和日志保留在本地归档，仓库仅提交脱敏检查摘要与精选截图。

## 提交与回滚

代码候选截止 `71456191`。各页初始提交：录音`24638e71`、错误页`bdfc0d5e`、分享`ef4bac9e`、插件`2ac1c88c`、模板`d02cf5ae`、概览`8dcddc03`、资源`19eb3db8`；专属样式`5958cf3f`。五配置分别为`2e34cecd`、`84cc7bbb`、`ff549a26`、`460d6f56`、`6ae4f580`，系统更新`aca40b2d`。后续各实际问题均独立提交，完整顺序可从下述范围查询。

已从代码候选建立独立分离工作树，实际逆序撤回全部本批web提交，`git diff --exit-code 70b810ba -- web`返回0；演练工作树已清理。完整撤回时在最新main的独立分支执行，并先保留后续任务改动：

```sh
git switch -c revert/brand-remaining main
git rev-list 70b810ba..71456191 -- web | xargs git revert --no-commit
# 审阅冲突、运行受影响检查后再提交回滚，不在原main直接覆盖。
```

该范围固定为本批，不能改成最新HEAD以免撤掉发布准备成果。单个补丁可单独revert；完整撤回某页时需同时处理该页后续修正，公共确认/样式基础应最后撤回。代码回滚不撤销已保存配置、模板或资源数据；没有数据库迁移。三项原验收修复`981890cf`/`e3921c0c`/`0261e3f5`完整保留。

## 后续边界

本清单范围已完成本地实施与上述验证；未宣布所有产品能力或所有历史边界均已验证。用户实际观感、触屏/IME、其他浏览器、真实麦克风与浏览器识别供应商、真实tldraw授权、方舟/LibTV、插件安装/卸载、生产更新与备份恢复仍按上线流程验证。独立音轨仅编排、原声预览导出及字幕失败回退边界未改变。

生产准备任务接到本地main/3012正式交接后，再检查最终候选的累计CI格式门禁、部署镜像、恢复与值守；本批不替代这些检查。集成与归档结果见本文后续交接记录。
