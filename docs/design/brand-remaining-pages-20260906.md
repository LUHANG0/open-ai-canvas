# 品牌收尾：剩余后台、公开分享与辅助页面

## 基线与边界

本批从干净本地 main `70b810bae2ab5a2685fb231820b37cdcc4975e67` 建立独立分支，确认 origin/main 为祖先，保留领先的 119 个本地提交。仅处理下列页面、私有样式和可复现状态问题；沿用统一主题、鉴权、用户 scope、账务、资源引用保护与更新协议。3014/8094 使用独立忽略数据目录；长期 3012、真实 8080 不参与写入验证。不安装真实插件、不调用付费供应商、不更新生产。

## 路由与消费者清单

| 入口 | 实际实现/消费者 | 起始状态 | 本批状态 |
| --- | --- | --- | --- |
| `/admin` | admin-route-pages → analytics-panel；统计、趋势、价格抽屉 | 共享后台主题，读取失败仅浮条 | 待验收 |
| `/admin/plugins` | plugins/plugins-page；平台开关及用户插件中心 | 共享表格，手机概览挤压 | 待验收 |
| `/admin/prompt-templates` | storyboard-prompts-page；用户提示词偏好及生成模板 | 共享表格，编辑抽屉 | 待验收 |
| `/admin/resources` | StorageResourcesPage → storage-resources-panel | 实际可删除且保护引用，入口误称只读 | 待验收 |
| `/admin/settings/drawing-engine` | drawing-engine-settings-page；绘图节点 | 共享 token，专用表单 | 待验收 |
| `/admin/settings/runtime-policy` | runtime-policy-settings-page；资源/任务/请求限制 | 42项策略，专用表单 | 待验收 |
| `/admin/settings/ark-private-assets` | ark-private-assets-settings-page；方舟私有资源 | 凭据脱敏、依赖配置 | 待验收 |
| `/admin/settings/response-interception` | response-interception-settings-page；响应规则 | 顺序规则、预览及保存 | 待验收 |
| `/admin/settings/third-party` | libtv-settings-page；LibTV 导入消费者 | 凭据留空保留、显式清除 | 待验收 |
| `/admin/settings/system-update` | system-update-page；更新器API | 状态失败无重试、真实操作仅假协议验证 | 待验收 |
| `/share/canvas/:token` | canvas/shared；匿名快照与媒体恢复 | 已共享画布主题，失效后无就地重试 | 待验收 |
| `*` | not-found/index | 品牌布局仅桌面 | 待验收 |
| 路由 errorElement | route-error | 品牌布局仅桌面 | 待验收 |
| `/test-voice-recording` | VoiceRecordingButton 测试原型，无用户导航消费者 | 独立原型仍进生产路由 | 待验收 |

旧入口 `/admin/storyboard-prompts`、`/admin/settings/concurrency`、`/admin/settings/libtv` 分别重定向模板、运行策略、第三方服务。录音组件仍由对话输入消费者使用，本批只将原型路由遵循现有 DEV 约定。

验证、提交与回滚证据在实施完成后补充。历史验收并不替代本清单的本次验证；用户观感、真实供应商和生产环境仍待单独确认。
