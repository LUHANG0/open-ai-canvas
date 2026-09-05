# 品牌风格统一：D2 画布编辑器

## 基线与实施边界

- 基线 `2d717287`，本地 main 干净、领先 origin/main 82 个提交，已确认祖先关系。从本地 main 创建 `feat/brand-canvas-d2` 独立工作树，保留全部本地成果。
- 范围为 `/canvas/:id` 的顶栏、Dock、节点外壳、选区、面板、菜单和媒体预览。画布列表、公开分享、专用导演台及时间线完整布局留在原批次。
- 复用公共品牌语义与品牌加载器，不改几何、媒体数据、鉴权、scope 或保存格式。保留 Worker 加载修复 `f4a3e478`、封面取消/重挂载、首帧揭盖与悬停原声合同。
- 隔离联调使用 3014/8094；数据显式指向本工作树 `.local/project-workbench-debug/brand-canvas-d2`。3012 原进程保持运行，不写真实 8080 数据，不使用付费模型。
- C4 先集成 main/3012；D2 等正式交接后再做组合验证和集成。各自维护页面文件，共享文档只追加本批记录。

## 最终实现

编辑器在 `CanvasThemeProvider` 边界从 `APP_THEME_COLORS` 和公共品牌配置派生主题。DOM 与 Leafer 使用同一组可解析颜色，计算仅随主题/品牌色变化发生；没有逐节点 DOM 样式读取。原 `canvasThemes` 作为非编辑器消费者的回退，时间线颜色与特色背景预设保留。

顶栏、Dock、节点表面、标题条、选区和连线、右键菜单、创建菜单、素材、助手、节点设置和编辑弹窗统一使用公共表面、边框、文字及状态语义。主操作延续黑白按钮，选中与焦点使用品牌色；保存、等待、素材引用加载使用品牌加载器。手机顶栏两行排列，小屏默认专注可手动退出且刷新保留，菜单不再被强制隐藏。移除了工作区装饰渐变与节点悬停缩放，避免媒体几何与命中范围不一致。

| 提交 | 模块与独立回滚单位 |
| --- | --- |
| `2e4b2491` | 主题边界、顶栏、Dock、手机专注菜单入口与标题组合输入保护 |
| `1471b013` | 节点表面、选区/连线、媒体与生成状态 |
| `10b1d41f` | 菜单、浮层、输入、助手及加载反馈 |
| `4c79ca2f` | 缓存 WebM 封面解码修复 |
| `93f86995` | 文本编辑器可访问角色、焦点和设置浮层边界 |
| `794b05af` | 独立手势分步撤销、忽略恢复时间戳空步骤及浏览器回归 |
| `239224a1` | 交付验收录像夹具初始画面与空数据诊断 |

C4 正式交接 `4000af5d` 后，在 `16ff884c` 无冲突合入；完整保留其四页配置实现、RequireFeature 修复和文档。

## 实测发现与修复依据

1. 有声 MediaRecorder WebM 可以悬停播放，但 metadata 预加载得到 Infinity 时长、透明首帧，封面评分快照为 0。缓存 Blob 改用 `preload="auto"` 后可解码完整数据，两个视频刷新均恢复封面；远程 URL 仍采用 metadata，未改变队列/取消/首帧揭盖合同。
2. 两次独立拖动落在 180ms 合并窗口时，一次撤销会同时恢复两个节点。下一次指针手势开始前提交已有历史，分离手势；继续检查第二次撤销又发现状态层更新 `updatedAt` 造成空历史步骤，因此排除仅时间戳变化，保留位置、尺寸、内容、成员与顺序变化。前后位置证据及永久浏览器用例 A9–A11 均已归档。
3. 旧浏览器检查要求悬停缩放，按本批几何合同改为检查比例保持 1。交付首轮在并发浏览器运行时产生无效录像夹具，提前填充首帧并明确拒绝空数据后，实际 Worker 故障、取消和成功导出全部通过；未修改 FFmpeg 业务实现。

## 浏览器验收与证据

[57 项独立检查](evidence/brand-canvas-editor-20260905/checks.json)全部通过，使用隔离账号上传的 320×180 图片与带音轨 WebM，在正式 `/canvas/:id` 路由通过真实 API 保存，不调用付费模型。

- 六节点画布：刷新封面、静止零播放器、悬停真实解码且 `muted=false/volume=1`、首帧揭盖、移开释放、快速切换隔离；深浅主题不改变几何。
- 标题中文组合事件不提前提交、Enter 保存、Escape 取消；富文本编辑保存、弹窗滚动与编辑撤销不触发画布缩放。此处是 Chrome 合成 composition 事件，不能替代系统中文输入法。
- 节点拖动、两次紧邻手势分步撤销、重做、图片 16:9 尺寸调整、Escape 取消预览、锁定节点不被键盘移动、Shift 多选、指针框选、拖动输出点连线和撤销。
- 右键菜单滚动隔离、Escape 关闭、桌面与手机助手开合；390/1023/1024/1440 深浅主题控件完整，无文档横向溢出；手机退出专注后菜单可达，刷新偏好保留。
- 同用户刷新恢复几何、手工尺寸和名称；真实 PUT 注入 503 后本地编辑保留，重试成功落库并刷新回读。自定义 `#18A56B` 公共品牌响应在深浅主题产生正确节点选中边框，几何不变。
- 96 个媒体节点：详情视口挂载 20 个节点、8 个就绪封面、0 个播放器；悬停仅 1 个播放器；总览挂载 96 个节点、48 个就绪封面、0 个播放器。

图片证据：[桌面浅色](evidence/brand-canvas-editor-20260905/desktop-light.png)、[桌面深色](evidence/brand-canvas-editor-20260905/desktop-dark.png)、[手机浅色](evidence/brand-canvas-editor-20260905/responsive-390-light.png)、[手机深色](evidence/brand-canvas-editor-20260905/responsive-390-dark.png)、[手机助手](evidence/brand-canvas-editor-20260905/phone-agent.png)、[大型媒体总览](evidence/brand-canvas-editor-20260905/large-media-overview.png)、[富文本编辑](evidence/brand-canvas-editor-20260905/text-modal-dark.png)、[框选](evidence/brand-canvas-editor-20260905/box-selection.png)、[保存失败](evidence/brand-canvas-editor-20260905/save-failure.png)。

[历史失败证据](evidence/brand-canvas-editor-20260905/history-before.json)、[修复后分步恢复](evidence/brand-canvas-editor-20260905/history-after-complete.json)、[交互前几何](evidence/brand-canvas-editor-20260905/geometry-before.json)、[保存刷新后几何](evidence/brand-canvas-editor-20260905/geometry-after.json)保留实际数值；前后几何文件包含本轮有意拖动/缩放结果，不应解读为两个文件整体相同。

共享交付回归 [20/20](evidence/brand-canvas-editor-20260905/delivery-checks.json)：Worker 403 超时退出、取消挂起加载、重试、真实双 WebM→MP4→7 文件 ZIP、浏览器解码 96×54/1.173 秒、前红后蓝顺序、SRT 和 manifest 正确，成功阶段浏览器异常为 0。保留 `f4a3e478`。

## 组合验证

- C4+D2 全量 `bun test`：1810 项通过、0 失败、10488 次断言，257 个文件；类型检查通过。
- 生产构建通过；7 项 gzip 预算全部通过：启动 JS 593.1/610.4 KiB、CSS 104.1/125.0、画布首次新增 JS 838.9/859.4、创作页 406.4/415.0、最大业务入口 181.4/187.5、最大 JS 725.8/761.7、最大 CSS 101.8/123.0。
- 永久 Chrome 画布回归 98/98，通过 324 节点/612 连线、视口裁剪、拖动/缩放手势内 Store 零更新及落位保存；新 A9–A11 两次相邻拖动和两次撤销全部通过，性能场景浏览器异常为 0。总览尺寸手势观察到帧间隔 p95 116.6ms，单机帧耗时属于本次环境观测，不作为跨设备流畅度承诺。
- 后端未修改；本轮真实上传、项目读写与失败重试均经独立 8094 数据实例完成。

复跑前端命令在 `web` 目录运行：

```sh
bun test
bun run typecheck
bun run build
VITE_API_PROXY_TARGET=http://127.0.0.1:8094 bun run test:canvas:e2e
bun run test:project-delivery:e2e
```

## 实际回滚演练

从 C4+D2 `16ff884c` 创建独立演练工作树，实际执行如下逆序 revert，得到 `d3ff32c1`。`git diff --exit-code 4000af5d -- web` 返回 0，工作树干净，说明 C4 前端完整保留、D2 七个代码/验收提交完整可撤销。[演练记录](evidence/brand-canvas-editor-20260905/rollback.json)。

```sh
git revert --no-edit 239224a1 794b05af 93f86995 4c79ca2f 10b1d41f 1471b013 2e4b2491
```

仅撤销某项时使用表中对应提交；主题与消费者存在依赖，完整撤销必须逆序，不能先移除 Provider。文档证据提交无需随功能回滚。

## 未覆盖边界与本地交付

用户观感确认、真实手机触摸/双指缩放/软键盘与系统中文输入法、Safari/Firefox、极端冷缓存与长时多媒体运行、真实付费生成、生产长视频/音轨、专用导演台/时间线完整工作流继续保留待验收。本批没有以桌面窗口缩放替代原生触屏结论，也没有把未触发的付费生成状态标记完成。

主线与 3012 预览更新、临时资源清理将在最终集成完成后补录。不推送、不部署，不写 8080 真实业务数据。
