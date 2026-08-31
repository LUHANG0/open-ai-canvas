# S10 · Auth、系统状态与语音原型

- 会话：PC 用户端第二批 Integration 子模块
- 总需求版本：R1
- 设计规范：`docs/ui-design-system.md`、`docs/design/pc-user-ui-design-standard.md`
- 分支：`refactor/pc-user-ui-20260901`
- Worktree：`/Users/hanglu/Documents/影策/open-ai-canvas-pc-user-ui`
- 基线 SHA：`c949021`
- 允许文件：`web/src/pages/auth/**`、`web/src/pages/not-found/**`、`web/src/pages/route-error.tsx`、`web/src/pages/system-pc.css`、`web/src/pages/test-voice-recording.tsx`、`web/src/pages/voice-recording-pc.css`、本记录
- 禁止文件：Admin、后端、数据库、API、services、stores、router、layout、全局样式、公共 UI 及其他页面会话目录

## 完成内容

### 登录与注册

- 保留品牌影片全屏结构，将 PC 双栏比例、遮罩、品牌文案、返回入口和表单卡统一到冻结的尺寸、圆角、焦点与动效合同。
- 统一登录/注册页签、字段标签、输入框、主操作、Linux.do 入口和注册状态提示，不建立新的认证状态或请求分支。
- 新增素材管理、生成任务和画布编排的品牌能力说明；该内容在 `<1024px` 隐藏，不改变既有移动信息架构。
- 保留 `next` 完整回跳、已登录跳转、OAuth 错误、首个管理员、注册开关、邮箱验证码、60 秒倒计时和注册后模型引导逻辑。

### 404 与路由错误

- 统一全屏背景、状态 Surface、错误编号、标题说明、焦点和恢复操作。
- 404 继续返回根入口；路由异常继续提供原有“重新加载”和“返回主页”动作，并完整显示原始错误消息。
- 状态页新视觉全部限定在 `@media (min-width: 1024px)`。
- 交叉审查后恢复小屏 404 的原节点顺序，并将新增“页面导航”与 `ERR` 标识设为 PC-only，避免改变 `<1024px` 信息结构。

### 语音原型

- 将 PC 页面整理为标准页头、MVP 标识、输入 Composer、录音/发送操作条和说明区。
- 将原内联 Canvas theme 色值转为页面私有 CSS 变量：断点外保持原样，PC 端改用统一 `--app-*` 表面、文字、边框、控件与焦点 Token。
- 保留 VoiceRecordingButton、转写结果回填、空内容禁用和“仅控制台输出”的原型发送语义。

## 修改文件

- `web/src/pages/auth/auth-scene.tsx`
- `web/src/pages/auth/login.tsx`
- `web/src/pages/auth/register.tsx`
- `web/src/pages/auth/auth-pc.css`
- `web/src/pages/not-found/index.tsx`
- `web/src/pages/route-error.tsx`
- `web/src/pages/system-pc.css`
- `web/src/pages/test-voice-recording.tsx`
- `web/src/pages/voice-recording-pc.css`
- `docs/design/pc-user-ui-sessions/S10-auth-system-voice.md`

## 提交

1. `3d67934` · `refactor(pc-ui): rebuild PC authentication scene`
2. `eee0a91` · `refactor(pc-ui): unify system and voice prototype pages`
3. PC-only 状态页保护提交与本记录最终 SHA 由 Git 历史回溯。

## 风险与依赖

- 登录品牌影片和 Poster 继续使用原有远程地址；网络失败时仍依赖 Poster/背景，未改变资源来源。
- 注册表单在 1024×较矮视口由右侧原有滚动容器承载；需在集中浏览器回归覆盖首个管理员、关闭注册和邮箱验证码三种高度。
- 语音页仍是生产可达的内部原型，发送动作仍只写控制台；本次不扩展成真实对话 API。
- Auth 的历史全局 AntD 强覆盖仍存在于 `globals.css`，本会话未越权清理；R6 全局整理时需确认可否被页面私有规则完全替代。

## 行为保护

- API、响应格式、权限、业务规则和认证 Store：未修改。
- `/login`、`/register`、`next`、OAuth 与错误页面路由：未修改。
- 登录、注册、验证码、倒计时、Session 应用、自动跳转和语音上传/转写：保持原调用与回调。
- `<1024px` Auth 新增品牌内容隐藏；语音旧内联色值以等价页面变量表达；没有借 PC 重构改变移动交互。

## 验证

- 修改文件 Prettier：通过。
- 文件所有权与禁区检查：通过；无 Admin、backend、services、stores、router、layout、global 或公共 UI diff。
- 新增 `admin-*`、`--admin-*` 和 CSS `!important`：无。
- 业务关键字 diff 复核：请求、导航、回调和持久化逻辑未变化。
- `git diff --check`：通过。
- 完整类型检查、测试、构建与浏览器回归：未运行，按总计划在全部页面和 R6 整理后集中执行。

## 回滚

1. `git revert eee0a91`：回滚 404、路由错误和语音原型 PC 重构。
2. `git revert 3d67934`：回滚登录与注册 PC 重构。
3. 本记录可随文档提交单独回滚；不使用 `reset --hard` 或强制推送。
