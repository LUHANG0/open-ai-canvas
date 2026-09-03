# 大型画布性能优化记录（2026-09-01）

## 范围与约束

- 仅优化 PC 前端画布的计算与渲染更新路径。
- 未修改后端、Admin、数据库、API、接口返回、权限或业务规则。
- 未重启或调整现有 8888 服务，未触发付费生成。

## Git 与回滚点

- 工作分支：`perf/canvas-large-workspace-20260901`
- 开始基线：`canvas-large-workspace-r0-20260901`
- 完成回滚点：`canvas-large-workspace-r1-20260901`

## 性能分析结论

现有视口裁剪、连线裁剪、媒体性能模式和节点 `memo` 已具备良好基础。本次主要热点是：

1. 每个节点构建资源引用时重复扫描全部节点和连线，大型图中产生大量重复查找。
2. 节点图 Context 依赖完整 `nodes` 数组，纯位置变化也会让所有可见扩展节点重渲染。
3. 节点动作 Context 每次页面渲染都创建新对象和新函数，消费者会绕过节点 `memo` 更新。
4. 连线选择与菜单处理函数在 JSX 中重复创建，使世界图层的浅比较失效。

## 完成内容

1. 建立共享资源图索引，一次生成节点、入边和出边映射；资源引用、配置输入与上游节点查询复用同一索引。
2. 上游视频回溯改为索引查询，保留环路保护与原有返回顺序。
3. 资源图索引仅随语义节点或连线变化重建；节点纯移动不再刷新节点图 Context。
4. 节点动作 Context 改为稳定的 `useCallback`/`useMemo` 引用，避免无关状态变化触发所有节点更新。
5. 连线选择和右键菜单处理改为稳定回调，恢复世界图层的 memo 化能力。
6. 新增 DEV-only 大型画布夹具：324 个节点、612 条连线，不包含远程媒体或付费请求。
7. 扩展真实 Chrome 验收，验证大型图挂载数量、交互预算、保存状态、布局和浏览器异常。

## 修改文件

- `web/src/lib/canvas/canvas-resource-references.ts`：共享图索引及索引化资源查询。
- `web/src/components/canvas/canvas-node-generation.ts`：生成输入复用共享索引。
- `web/src/pages/canvas/use-canvas-render-model.ts`：语义级索引缓存并复用资源查询结果。
- `web/src/pages/canvas/project.tsx`：稳定 Context 值和连线处理函数。
- `web/src/lib/canvas/canvas-repro-fixture.ts`：大型画布确定性夹具。
- `web/src/pages/dev/canvas-repro-lab.tsx`：按路由加载普通或大型夹具。
- `web/test/canvas-resource-references.test.ts`：索引查询和兼容性回归。
- `web/test/canvas-p0-repro.test.ts`：大型夹具结构校验。
- `web/scripts/canvas-p0-chrome-e2e.mjs`：大型画布真实浏览器验收。

## 验证结果

- TypeScript 类型检查：通过。
- 全量前端测试：通过。
- 生产构建：通过。
- 真实 Chrome 回归：32/32 通过。
- 大型夹具规模：324 节点、612 连线。
- 1024×768 视口实际挂载：25 节点、50 连线，其余内容由视口裁剪隔离。
- 大型画布进入可交互状态：约 2.4 秒（本机 DEV 模式、首次路由加载）。
- 浏览器 console、运行时异常和网络失败：0。

## 风险与后续

- 本次大型夹具以文本节点和高密度连线为主，验证结构规模和 React/DOM 成本；大量高清视频同时可见仍应单独做媒体压力测试。
- 当前构建仍存在既有大分包警告，建议后续按路由和编辑器能力拆分首屏依赖。
- 下一优先级建议统一画布生成、上传、资源恢复的错误提示和恢复入口。
