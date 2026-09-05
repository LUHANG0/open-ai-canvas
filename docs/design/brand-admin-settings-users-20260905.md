# 品牌风格统一：C1 网站设置与用户管理

## 基线与边界

- 基线 `9a5ab9fb`，本地 main 干净且继承 origin/main，本地已有成果完整保留。
- 独立分支 `feat/admin-brand-settings-users`；本批只处理网站设置、用户列表及所属邀请、编辑、详情抽屉。
- 沿用 AdminPageFrame、AdminDataTable、共享品牌主题。网站设置是唯一官网配置入口，不恢复独立 CMS。
- 保留配置 CAS、已发布内容、管理员鉴权、账号状态、角色、邀请与积分账务合同。没有真实模型调用。
- 浏览器写入仅使用隔离后端与临时前端；通过本地验证后合入 main，再更新 3012 预览。不推送、不部署。

## 初始检查

| 证据 | 发现 | 实施路径 |
| --- | --- | --- |
| branding-settings-page.tsx、site-display-settings.tsx | 四分区已保留独立草稿，仍有装饰性侧栏、重复标题及不明确的保存失败恢复文案 | 简化导航、分组与持久状态，沿用两组保存接口 |
| users-panel.tsx | 读取失败只有浮条，旧结果可能继续显示；新建后直接插入不符合当前筛选的用户 | 内容区错误与重试，写入后重新查询当前筛选 |
| registration-invite-drawer.tsx、admin-user-detail-drawer.tsx | 邀请请求缺少迟到保护，详情分页失败可能保留另一用户的数据 | 隔离读取状态与错误；生成时禁止关闭 |

## 实施结果

- 网站设置移除高侧栏和装饰渐变，采用紧凑四分区导航；品牌名读取当前配置，后台与官网共用主题变量。输入高度、内容表面和操作区沿用品牌规范。
- 官网字段按共用封面、联系与备案分组，明确展示位置和留空行为；品牌与官网各自保留保存状态。保存失败保留输入，旧修订冲突可确认丢弃当前组草稿后重新读取，另一组草稿继续保留。
- 用户表格沿用 AdminDataTable，保留角色/状态筛选、分页、选择、批量停用及列设置。新增或修改后重新查询当前筛选，避免本地插入不符合筛选的用户。
- 用户创建/编辑采用共享主题抽屉、固定底部操作和就地错误；编辑未变化时禁止保存，保存期间禁用字段与关闭。角色、状态和积分业务权限继续由原后端负责。
- 邀请使用统一状态标签和成功反馈；生成期间不能关闭，原始链接仍只显示一次，创建失败保留草稿。邀请记录读取失败可重试，撤销继续经过确认。
- 用户详情、积分流水、任务和审计记录各自呈现加载/失败；清除旧结果、忽略迟到响应，避免把上一人的流水显示为当前用户数据。人工积分调账仍在原「积分运营」入口，用户页只显示余额/流水和邀请注册积分。
- 没有修改后端、数据库迁移、品牌主题全局变量或其他后台页面。

## 验证与证据

前端 22 项专项、231 个断言通过。类型检查随生产构建执行通过，7 项体积预算全部通过。后端品牌、官网限定字段保存、修订冲突、邀请生命周期/权限/积分、用户创建和批量停用专项通过。浏览器共记录 [44 项独立检查](evidence/admin-brand-c1/checks.json)，没有未捕获页面异常；补充覆盖停用/重新启用、详情加载骨架和迟到请求隔离。

```sh
cd web
bun test test/branding-theme.test.ts test/public-brand-site.test.ts test/registration-invites.test.ts test/admin-ui-regressions.test.ts
bun run build
```

```sh
cd backend
go test ./internal/service ./internal/handler -run 'TestBranding|TestPublicSite|TestSiteDisplay|TestRegistrationInvite|TestCreateAdminUser|TestBulkDisable' -count=1
```

浏览器仅连接 `3013` 前端和 `8093` 隔离源码后端，在专用验收管理员和测试成员上执行：

| 证据 / 检查 | 实际结果 |
| --- | --- |
| 网站设置深浅主题，1440×1000 / 390×844 | 表单与分区可访问，无页面横向溢出；手机使用页面滚动 |
| 两组草稿切换、离开取消、独立保存 | 未保存内容保留；保存一组不覆盖另一组 |
| 非法联系 URL、服务端旧修订冲突 | 后端拒绝写入，保留本地输入；确认重新读取后恢复当前已发布值 |
| 备案保存、已打开官网标签页 | 真实公开页面显示保存内容，已有同源标签自动更新 |
| 用户创建、名称与角色往返编辑、自身权限 | 保存成功后重查列表；当前管理员自己的角色和状态禁用 |
| 邀请创建、注册、积分与撤销 | 公开注册关闭时邀请有效；每名受邀成员准确获得 100 积分，详情可读流水；撤销后记录更新 |
| 列表搜索空态、用户/积分/邀请请求故障 | 故障区别于空态；恢复读取后展示真实结果，旧用户数据不混入 |
| 用户列表、邀请与详情手机抽屉 | 控件沿用深浅主题，内容可滚动，长内容不撑破页面 |

完整本地脚本、日志、脱敏截图和断言结果保存在主仓库 `.local/cache/admin-brand-20260905`；凭据和登录状态仅在 Git 忽略目录内。截图不包含完整邀请 token。隔离数据库单独保留在主仓库 `.local/project-workbench-debug/admin-brand-20260905`，不复用正式 8080 的数据。

没有执行全量前端回归或 PostgreSQL 集成环境；用户实际观感、其他浏览器、真实品牌资源上传、极端网络中断造成的写入结果不明仍按上线流程检查。其余后台与前台页面继续按后续批次推进。

## 提交与回滚

| 提交 | 内容 |
| --- | --- |
| `03752078` | C1 基线与边界 |
| `18bed434` | 网站设置分区、样式与保存反馈 |
| `16b9f6f9` | 用户列表、编辑、邀请和详情读取状态 |
| `9d0ab6d5` | 固定表格布局与列宽，低频停用收进更多菜单 |

在干净 main 上建立临时回滚分支，逆序执行：

```sh
git switch -c fix/revert-admin-brand-c1
git revert 9d0ab6d5
git revert 16b9f6f9
git revert 18bed434
```

已用临时 Git 索引逆序反向应用三个实现提交，文件树与 `03752078` 完全一致；没有改动真实索引和工作区。仅撤网站设置可回退 `18bed434`；仅撤用户管理先回退 `9d0ab6d5` 再回退 `16b9f6f9`。回滚只撤销代码，不撤销管理员已保存的配置、角色、积分或邀请数据；没有数据库迁移。

浏览器截图：[网站设置桌面深色](evidence/admin-brand-c1/settings-final-dark-1440.png)、[桌面浅色](evidence/admin-brand-c1/settings-final-light-1440.png)、[手机深色](evidence/admin-brand-c1/settings-final-dark-390.png)、[手机浅色](evidence/admin-brand-c1/settings-final-light-390.png)；[用户管理桌面深色](evidence/admin-brand-c1/users-final-dark-1440.png)、[桌面浅色](evidence/admin-brand-c1/users-final-light-1440.png)、[手机深色](evidence/admin-brand-c1/users-final-dark-390.png)、[手机浅色](evidence/admin-brand-c1/users-final-light-390.png)；[邀请抽屉](evidence/admin-brand-c1/invite-mobile-light.png)、[用户详情](evidence/admin-brand-c1/detail-mobile-light.png)。这些均为隔离验收数据。

## 本地集成与预览

- 本地 main 已从 `9a5ab9fb` 快进合入 `c7046e98`（实现截至 `9d0ab6d5`），本节作为后续记录一并集成。没有覆盖原有本地提交，没有推送或部署。
- 更新前再次核对 `brand-launch` 工作树：分离 HEAD 为 `9a5ab9fb`，没有已跟踪修改，只有有意保留的 `web/node_modules` 链接。3012 已切到本批成果，依赖链接保留。
- 3012 官网在独立 Chrome 中显示配置品牌「帧镜」，没有未捕获异常；Vite 已提供更新后的用户模块。代理健康检查就绪，8080 仍是原后端 `a4e096e5`，本批不涉及后端替换。
- 临时 3013/8093 验收服务停止后，隔离数据库与本地证据保留在上文位置；临时分支清理。后续个人设置与积分中心批次基于此 main 再集成，避免同时更新 3012。
