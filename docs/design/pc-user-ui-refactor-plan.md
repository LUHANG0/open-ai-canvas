# PC 用户端全面重构计划

## 执行顺序

1. R0：保护原始版本。
2. R1：冻结需求、设计规范、页面清单、Git 与会话规则。
3. R2：统一 Token、AntD 主题和公共组件。
4. R3：统一用户壳层、导航、滚动与页面框架。
5. R4：并行重构普通业务页。
6. R5：重构 Create、Projects、Canvas 等复杂工作台。
7. R6：统一样式、去重和代码整理，不做完整测试。
8. R7：集中构建、路由、接口、权限、表单、上传、分页、跳转和浏览器测试；集中修复。
9. R8：交付候选、测试报告、遗留问题和最终回滚说明。

## 文件所有权

- Foundation：`styles/globals.css`、`lib/app-theme.ts`、`components/layout/**`、`layouts/user-layout.tsx`、公共 UI。
- A：Home、Tasks、Assets、Skills、Wallet。
- B：Plugins/Eagle、Settings、Auth、状态页和语音原型。
- C：Projects 与工作流。
- D：Create。
- E：Canvas 页面与 Canvas 专属组件。
- Integration：公共文件、合并、冲突、最终清理、测试和台账。

页面会话不得修改 Admin、后端、API、Store、全局样式或其他会话目录。缺少公共能力时提交依赖请求，由 Integration 处理。

## 集中测试门槛

页面阶段只运行 `git diff --check` 和文件所有权检查。R6 后集中运行格式、类型、完整 Bun 测试、Admin 不受影响回归、Director E2E、构建以及 PC 浏览器与 API 合同回归。
