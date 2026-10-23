# 夜总会

夜总会独立协议插件，一个安装包提供三个协议：`yezonghui-chat`（聊天）、`yezonghui-image`（异步生图）、`yezonghui-video`（视频）。默认服务地址为 `https://new.yezonghui.org`，鉴权字段为 `apiKey`，由宿主后端发送 Bearer 请求头。

在插件中心启用“夜总会”，在渠道模型中按用途选择对应协议。模型 ID 从当前 API Key 的 `/v1/models` 取得；比例、分辨率、时长和参考素材上限按当前模型与分组配置。插件不会假定示例模型已开通，也不会自动改画幅或分辨率重试。

图片和视频使用“提交 → 轮询 → 鉴权下载”，完成后始终从 `/content` 下载并交由宿主保存，不依赖临时公网结果 URL。参考图、视频、音频必须能被上游从公网直接下载；本机路径、Base64 和需要登录的资源不可用。图片不支持蒙版或一次多张。

聊天按标准 Chat Completions 实现普通响应、SSE 和 Agent 工具调用映射。服务商当前公开页面只描述图片和视频合同，聊天模型的实际兼容性仍需独立验收。本插件不包含同步图片接口 `/v1/images/generations`；需要同步图片的模型继续选择单独的 OpenAI Images 协议。

完整参数、响应、错误、安装与验证边界见 [接口说明](docs/interface.md)。服务商依据：[接口文档](https://new.yezonghui.org/docs)。
