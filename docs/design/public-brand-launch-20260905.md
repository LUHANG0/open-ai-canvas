# 品牌官网与整页登录

后台管理入口的后续精简以 [网站设置精简](website-settings-simplification-20260905.md) 为准：完整官网编辑器已删除，封面、联系与备案改为限定字段直接保存。下方表格保留本轮品牌页初版的实现记录。

官网以“让故事开机”为主线，使用深灰底色、白色标题、紫色品牌强调和带暖色车窗的电影画面。首页从品牌主张进入创作示例、工作流、适用人群和体验说明；登录是独立整页，表单直接居中展示。

当前为本地实现与预览，尚未部署线上。实际备案号由网站持有人提供，在后台配置后发布；代码没有虚构备案号、客户案例、作品视频或申请体验联系方式。

## 页面和后台入口

| 入口 | 用途 | 配置方式 |
| --- | --- | --- |
| `/` | 品牌首页、工作流与体验说明 | 官网内容保存草稿后发布 |
| `/product` | 产品能力与真实演示界面 | 文案沿用官网设置 |
| `/showcase` | 创作示例和图片、视频预览 | 编辑作品列表并发布，支持清空 |
| `/about` | 品牌介绍与部署能力 | 品牌资料及官网文案 |
| `/login`、`/register` | 居中账号表单 | 保留账号、邀请和首次管理员流程 |
| `/admin/settings/branding` | Logo、名称、主题色、登录文案、浏览器图标 | 保存品牌配置 |
| `/admin/settings/public-site` | 首页封面、作品、联系地址、备案号与链接 | 保存草稿，再发布 |

登录页共用官网首页封面。原登录视频配置保留在旧数据中，但不再驱动页面，后台改为跳转至官网内容设置。媒体加载失败回退内置海报。登录设置读取失败有重试提示，表单模块加载失败可重新加载。未开放注册或验证码邮件不可用时，公开入口显示邀请说明。

## 视觉与素材

Logo 使用可缩放 SVG，两组相向取景角围绕中心菱形镜头，代表“框住画面、组织故事”。文件为 `web/public/logo.svg`；自定义 Logo 和 favicon 上传仍沿用原接口。

概念图由内置 ImageGen 制作，每张一次请求，共三张，未追加变体。完整提示词保存在 [prompts.json](evidence/public-brand-launch/prompts.json)。它们是虚构故事《最后一班》的品牌视觉，不是本产品输出实测或客户案例。

| 文件 | 用途 | 处理 |
| --- | --- | --- |
| `web/public/brand/last-train-wide.webp` | 首页和登录海报、第一幅示例 | 生成 PNG 转 WebP |
| `web/public/brand/last-train-traveler.webp` | 第二幅示例、流程说明 | 生成 PNG 转 WebP |
| `web/public/brand/last-train-departure.webp` | 第三幅示例、流程说明 | 生成 PNG 转 WebP |
| `web/public/brand/workspace-canvas.webp` | 产品页真实界面 | 原画布验收截图转 WebP，演示数据 |

首页内的工作台构图为标明“工作流示意”的页面组件。产品截图来自 `docs/design/evidence/frontend-launch-readiness/canvas-p0-1600x1000-dark.png`。没有制作或伪装成片视频；以后可通过官网设置填入可公开的视频和封面。

## 验证和依据

桌面及手机的实测截图保存在本目录的 `evidence/public-brand-launch/`：

- [官网桌面](evidence/public-brand-launch/home-desktop.png)
- [官网手机](evidence/public-brand-launch/home-mobile.png)
- [登录桌面](evidence/public-brand-launch/login-desktop.png)
- [登录手机](evidence/public-brand-launch/login-mobile.png)

浏览器检查包含公开路由、图片加载、页面滚动、移动导航、作品图片预览、Escape、返回官网、注册不可用状态和表单必填。登录表单在 1440×900 与 390×844 的中心偏差为 0，页面无横向溢出，手机输入框为 16px。没有提交真实账号或修改现有账号、账务数据。

前端专项命令：

```sh
cd web
bun test test/public-brand-site.test.ts test/branding-theme.test.ts test/auth-login-experience.test.ts test/registration-invites.test.ts test/pc-ui-detail-polish.test.ts
bun run build
```

后端专项命令：

```sh
cd backend
go test ./internal/service -run 'TestPublicSite|TestBranding' -count=1
```

以上专项测试和生产构建通过，构建体积预算通过。备案字段测试覆盖未发布草稿不可见、发布后读取、空查询地址默认值、非法 URL 和长度拒绝。当前浏览器预览连接原有本地后端，新备案链接字段的端到端保存仍需部署相同版本后由管理员验收。

## 发布与回退

沿用项目现有前后端发布方式，无新增托管服务或数据库迁移。部署必须从维护基线构建，按仓库发布约定核对健康信息与目标提交；本轮没有修改生产服务。更新前可导出管理员品牌与官网草稿、发布配置；回退页面代码时恢复对应前端版本，新增 JSON 字段不会影响旧表结构。

待人工确认的事项集中在 [待测试](../content/docs/progress/pending-test.mdx)，包括真实备案号发布、Logo/封面更换、有效邀请和上线账号登录。
