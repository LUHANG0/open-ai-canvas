# 本机交付加载失败修复报告

本机交付现已在共享依赖的隔离工作树中完成真实双 WebM 合成与 ZIP 下载，D1 记录的 180 秒加载超时已闭环。实现提交 `f4a3e478`，基于本地 main `1f104cb5`，继承现有 C3/D1 改动和 origin/main 历史。

## 证据、结论与处理路径

| 证据 | 观察 | 结论与处理 |
| --- | --- | --- |
| E-001：[网络对照](design/evidence/project-delivery-loading/network.json) before | Worker 请求 `@fs/<shared-main>/web/node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js?worker_file&type=module` 返回 403；Worker error 触发，页面异常列表为空，加载 Promise 不返回 | F-001：Vite 预打包中的隐式相对 Worker URL 落到共享 node_modules 的真实路径，该路径没有作为应用 Worker 依赖被追踪。P-001：使用 `@ffmpeg/ffmpeg/worker?worker&url` 显式入口，并传入 `classWorkerURL` |
| E-002：同文件 after | Worker、core JavaScript、实际 WASM 均 200；WASM 为 `application/wasm`；`loadFFmpeg()` 返回 | F-002：共享依赖环境触发路径问题；并非 WASM 不可用或隔离头缺失。单线程 core 在 `crossOriginIsolated=false`、无 SharedArrayBuffer 的同一浏览器中成功加载 |
| E-003：[Chrome 检查](design/evidence/project-delivery-loading/checks.json) | 真实 Worker 403、挂起加载取消、恢复后导出通过，20/20 | F-003：依赖类只等待 Worker 消息，启动错误缺少退出保障。P-002：加载 30 秒截止时间、失败终止实例、清除失败缓存；交付提供取消和独立 Worker，避免影响其他画布合并 |
| E-004：[生产构建检查](design/evidence/project-delivery-loading/production.json) | 同源 hash Worker/core/WASM；WASM 403 后报错，恢复后加载；编码取消返回 AbortError，再次合成可解码 | F-004：修复同时覆盖 Vite 开发服务与生产静态资产；无需扩大 Vite 文件访问范围或修改部署隔离头 |

E-001/E-002 的本机工作目录已脱敏为标签，原始日志和探针保留在本地忽略归档。E-001 是修复前实际观测，不是在最终代码上模拟的结论；E-003 的 403 则是最终代码的定向故障注入。

## 实施边界

- Worker URL 纳入 Vite 资产图；core 与 WASM 继续同源发布和按需加载。
- 加载截止时间用于结束没有响应的 Worker，原先没有产品截止时间；没有延长 E2E 的 ZIP 等待、绕过质量门禁或替换空包。
- 取消覆盖资源读取、动态模块等待、加载、编码和打包等待。取消/失败均收起进度、恢复按钮，取消后不会下载 ZIP；迟到资源不会继续进入编码。
- 可取消交付独占 Worker，结束时释放；已有画布合并调用保留共享已加载实例。没有修改拼接/转码命令、时间线算法、后端、数据迁移、锁文件、模型或计费协议。
- 验收脚本为公开站点/品牌配置提供空测试配置，并拒绝所有未声明 API，修复原脚本在无后端环境访问这两处产生 502 的问题。媒体仍由浏览器现场录制，实际 FFmpeg 和 ZIP 未被替换。Vite 使用独立缓存，不污染长期预览的依赖缓存。

## 验证结果与复现

在仓库 `web/` 下执行：

```bash
bun test
bun run build
DELIVERY_E2E_EVIDENCE_DIR=../.local/cache/delivery-e2e bun run test:project-delivery:e2e
```

脚本使用本机 Chrome/Chromium、临时 Vite、隔离浏览器 profile 和临时端口，无需账号或后端；退出清理服务与临时文件，指定证据目录时保留 ZIP、检查 JSON 和截图。

- 全量前端 **1801 项通过，0 失败，10403 断言**；类型检查、生产构建和全部 7 项体积预算通过。
- Chrome E2E **20/20**：质量门禁、两处容量核对、故障退出、取消、重试、真实下载和解包。
- ZIP 精确包含 7 个文件：成片 MP4、字幕 SRT、分镜 JSON/CSV、资产 JSON、manifest、交付说明。
- 最终 MP4 96×54，浏览器实际解码时长 **1.194570 秒**；抽帧前红后蓝，两个镜头顺序正确。SRT 与 manifest 的计划时长为 1.2 秒。MediaRecorder 的实际采样时长存在帧级差异，验收允许 0.95–1.45 秒，未宣称毫秒级剪辑对齐。
- 生产包独立媒体冒烟：**1.263158 秒**，同样 96×54、前红后蓝；实际 WASM 403 后重试、编码取消后重试通过，页面异常为空。
- ZIP SHA-256：`affd9a6049c8a70d2fd960887441e75b524be6f5f038712dff2a071dff60395b`。完整 ZIP 和生产探针不提交到业务源码，保留本地归档便于复核。
- [成功页面截图](design/evidence/project-delivery-loading/delivery.png)已目视检查；原始请求/日志/脚本归档 `.local/cache/project-delivery-loading-20260905`。

浏览器实际生产包冒烟由归档中的 `production.mjs` 完成，读取本次 dist manifest 动态找到合并模块，检查真实编译产物；它使用本机已装的 Playwright/Chrome 路径，因此不作为跨机器标准命令。常规可重复门禁为上面的仓库 E2E。

## 回滚

从干净 main 建立独立临时分支后执行：

```bash
git revert --no-edit f4a3e478
```

已在独立演练工作树实际执行，生成 `69891ddb`；`git diff --exit-code 1f104cb5 -- web` 返回 0，证明前端完整恢复任务基线且保留 C3/D1。演练工作树已移除。无数据库或真实资源回滚。

## 仍需真实项目验收

此项只关闭 D1 的微型媒体本机导出阻塞。长章节、大视频、音轨/声画质量、不同浏览器和真实后端交付仍保留原待测项；没有使用真实项目、付费模型或后台 8080 服务。
