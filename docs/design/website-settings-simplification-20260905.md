# 网站设置精简

后台仅保留“网站设置”，删除独立“官网内容”页面、章节编辑、作品管理、重复预览和前端草稿发布操作。官网已经展示的内容及历史草稿保留，公开品牌页面继续使用原配置。

## 使用入口

`/admin/settings/branding` 提供四个分区：

| 分区 | 内容 | 保存行为 |
| --- | --- | --- |
| 品牌资料 | 名称、标语、简介、工作台浏览器信息 | 保存品牌设置后生效 |
| 标志与颜色 | Logo、favicon、主题色 | 上传立即生效，颜色保存后生效 |
| 登录页面 | 标题、说明，前往共用封面的快捷入口 | 保存品牌设置后生效 |
| 官网与备案 | 共用海报、联系地址、备案号、备案查询链接 | 保存网站设置后直接生效 |

旧 `/admin/settings/public-site` 地址替换跳转到 `/admin/settings/branding?section=website`。分区通过查询参数定位，两组编辑状态在切换时持续保留；离开整页时统一提醒未保存内容。保存过程中禁用对应编辑项，并阻止离开页面。

## 保存边界

新增 `PATCH /api/admin/settings/site-display`，请求包含 `expectedRevision`、`posterUrl`、`contactUrl`、`icpText`、`icpUrl`。页面从已发布版本读取这四项，不读取隐藏的历史草稿内容作为当前设置。

服务端只将这四项写入草稿与已发布配置，推进修订和公开 ETag。它不会覆盖或发布历史草稿中的标题、章节、作品或 SEO 修改。复用已有管理员授权、URL/长度校验、CAS、管理审计和事务存储，不新增表或迁移。原完整管理 API 保留供既有集成使用，前端不再暴露相关操作。

## 验证记录

- 前端品牌、公开入口和后台 UI 专项：18 项通过；TypeScript 与生产构建、全部体积预算通过。
- 后端官网及新保存接口专项通过；覆盖保存和清空字段、保留其他草稿、拒绝旧修订、非法 URL、超长备案号和非管理员写入，校验成功操作写入审计。
- 在独立本地数据库初始化验收账号，通过真实浏览器验证单一菜单、四个分区、两组未保存表单切换保留、离开取消、独立保存和旧路由跳转。
- 本地保存测试备案文字后，公开 API 返回修订 1 和对应备案文字，原标题保持“让故事开机。”。测试值仅存在隔离验收数据库。

截图：[桌面设置](evidence/public-brand-launch/settings-desktop.png)、[手机设置](evidence/public-brand-launch/settings-mobile.png)。

复现命令：

```sh
cd web
bun test test/branding-theme.test.ts test/public-brand-site.test.ts test/admin-ui-regressions.test.ts
bun run build
```

```sh
cd backend
go test ./internal/service ./internal/handler -run 'TestPublicSite|TestSiteDisplay' -count=1
```

原预览连接已安装的旧版后端，新保存接口需要随新版后端更新；没有替换已安装程序或修改其数据。此次运行验证使用单独的源码后端、端口和开发数据库。尚未上线部署。
