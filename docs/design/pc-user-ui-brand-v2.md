# PC 用户端 Brand V2 规范与实施计划

## 1. 定位

Brand V2 定位为“光帧导演台”：面向 AI 影视与短剧创作的专业控制室。界面保持克制，让视频、图片、人物和镜头成为视觉主角。

- 80% 石墨与冷灰中性色。
- 15% Electric Iris 紫蓝品牌色。
- 5% AI 运行色与业务状态色。
- 品牌紫表示用户主动操作；AI 青仅表示生成、分析、排队和流式运行。
- 不使用满屏紫色渐变、每卡发光、过量毛玻璃或胶囊化容器。

## 2. 范围与不可变合同

- 只升级 PC 用户端，验收范围为 `>= 1024px`；移动端只做保护性回归。
- 不修改后端、数据库、API、接口返回、权限、业务规则和路由合同。
- 不修改 `/admin/**` 与 `admin-ui.css`，并保证 Admin 主题输出不因共享主题文件间接改变。
- 保留生成、轮询、上传、分页、任务恢复、模型联动、计费、项目流程和画布交互。
- Brand V2 阶段冻结 `web/src/styles/globals.css`，不在文件尾部继续堆叠覆盖。

## 3. Foundation Token

### 3.1 品牌与 AI 运行色

```css
:root {
  --app-brand-50: #f5f3ff;
  --app-brand-100: #ece9ff;
  --app-brand-200: #dcd6ff;
  --app-brand-300: #c4baff;
  --app-brand-400: #a79bff;
  --app-brand-500: #8b7cf6;
  --app-brand-600: #6d5dfb;
  --app-brand-700: #5b4bdb;
  --app-brand-800: #4438a8;
  --app-brand-900: #302779;

  --app-ai-50: #eafbfc;
  --app-ai-100: #d0f4f6;
  --app-ai-400: #5dd6df;
  --app-ai-500: #1aa8b4;
  --app-ai-600: #0e7f8c;
}
```

### 3.2 亮色主题

- Canvas `#eff1f7`，Page `#f7f8fb`。
- Surface 1/2/3：`#ffffff / #f3f5fa / #e9ecf4`。
- 主文字 `#181a26`，次级与弱化文字分别为 72% / 52%。
- 主操作：`#5b4bdb`，Hover `#4e3fc6`，Active `#4438a8`，前景白色。
- 选中态使用品牌软底：10% / 14% / 18%，前景 `#4438a8`。
- AI 运行态前景 `#0e7f8c`，不能用于主 CTA。

### 3.3 暗色主题

- Canvas `#0a0c13`，Page `#0e1018`。
- Surface 1/2/3：`#151824 / #1b1f2d / #232838`。
- 主操作：`#8b7cf6`，Hover `#9b8eff`，Active `#8172ef`，前景 `#11131d`。
- 选中态使用 16% / 22% / 28% 品牌软底，前景 `#c7c0ff`。
- AI 运行态前景 `#5dd6df`。

亮色主按钮对比度不低于 6.04:1；暗色主按钮不低于 5.56:1。

## 4. 视觉层级

- 保留真实布局合同：侧栏 224/64px、顶栏 52px、壳层间距 10px、页面 gutter 24px、最大宽度 1440px。
- 页面标题 24/700；首页与认证展示标题 34–40/700；不新增网络字体。
- 普通卡片用细边界或轻微明度差；只有可点击媒体卡 Hover 上移最多 1px。
- Drawer、Modal、Popover 使用 Raised/Overlay 阴影；普通正文 Surface 不使用毛玻璃。
- 品牌 Glow 仅用于品牌标识、首页焦点和 AI 空态。
- 页面进入 180ms；侧栏与抽屉 240ms；AI 运行呼吸 1.6–2.0s。
- `prefers-reduced-motion` 下关闭循环、位移和缩放。

## 5. 主题隔离

`web/src/lib/app-theme.ts` 必须保留当前中性色对象供 Admin 与移动端使用，并新增独立的 PC 用户 palette：

```ts
const color = pcUserSemantics
  ? PC_USER_THEME_COLORS[mode]
  : APP_THEME_COLORS[mode];
```

- `getAntThemeConfig()` 只在 `usePcBrandViewport()` 命中 `>= 1024px` 时读取 Brand V2 用户 palette；移动端继续使用冻结的原 palette。
- `getAdminAntThemeConfig()` 继续读取冻结的 Admin palette。
- 根级 `AppProviders` 订阅同一个 Data Router 的 pathname；`/admin` 与 `/admin/**` 必须切换到 Admin theme，确保 `App.useApp()` 创建的 message、modal、notification holder 也不继承用户端品牌色。
- 不把品牌色写入全局 `--workspace-accent`，避免 `admin-ui.css` 间接继承。
- 品牌 Token 只在 `.app-spatial-workspace`、`body.app-spatial-overlays`、`.pc-canvas-workspace`、`.pc-auth-scene` 和 `.pc-system-page` 消费。

## 6. 文件 Owner

| Owner      | 独占文件                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| Foundation | `web/src/lib/app-theme.ts`、`web/src/styles/pc-user-foundation.css`      |
| Shell      | `web/src/components/layout/workspace-shell.css` 与 workspace layout 组件 |
| Common UI  | `web/src/components/ui/pc/**`、`pc-ui.css`                               |
| Standard   | Home、Tasks、Assets、Skills、Wallet 页面私有文件                         |
| Creative   | Create、Projects 页面私有文件                                            |
| Config     | Settings、Plugins、Eagle 页面私有文件                                    |
| Canvas     | Canvas Library/Editor 页面私有文件；编辑器首轮只做安全皮肤传播           |
| System     | Auth、404、Route Error、Voice 页面私有文件                               |

`app-theme.ts`、`workspace-shell.css`、`pc-ui.css`、`creation-workspace.css` 和 `globals.css` 不允许多人同时修改。

## 7. 页面优先级

1. Foundation、Shell、Common UI。
2. Create、Home、Projects。
3. Assets、Tasks。
4. Skills、Plugins、Wallet、Settings。
5. Canvas Library、Auth、System。
6. Canvas Editor 只做 scoped token、表面、焦点与阴影传播，并单独回归拖拽、缩放、节点、连线和浮层。

## 8. 集中验证

- 类型检查、正式构建和官方前端测试。
- 1024 / 1280 / 1440 / 1600 / 1920 PC 视口。
- 亮暗主题、主路由、滚动、弹窗、空态和关键交互。
- Admin 只读视觉与主题零变化保护。
- 768px 移动/平板保护性回归。
- 禁改目录与 R0 基线零差异检查。
