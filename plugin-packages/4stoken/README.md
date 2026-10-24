# 4SToken

4SToken 独立渠道协议插件，默认 API 地址是 `https://api.4stoken.cn`，不是文档网站域名。配置字段 `apiKey` 保存 Client Key，宿主在请求头使用 Bearer 鉴权。

同一安装包提供六个协议：

| 用途 | Provider ID |
| --- | --- |
| 标准聊天 | `4stoken-chat` |
| Responses 对话与 Agent | `4stoken-responses` |
| Claude Messages | `4stoken-claude` |
| Gateway 文生图、参考图与蒙版编辑 | `4stoken-image` |
| Seedream 原生图片 | `4stoken-seedream` |
| Gateway 视频任务 | `4stoken-video` |

在插件中心启用“4SToken”，在渠道模型上选择实际开放的协议。模型名填写当前令牌 `/v1/models` 返回的 modelCode；不要按示例猜测已开通模型。图片、视频的尺寸、时长、参考素材数量和声音等能力需要依据模型线路配置。

Gateway 图片默认异步提交；有源图时使用 multipart 编辑接口，文件字段为重复的 `image` 与可选 `mask`。不自动发送 `quality`，避免服务商文档提到的官转渠道计费分组变化。视频使用 JSON Gateway 主接口，普通参考、单张首帧、成对首尾帧与多模态内容分别映射。媒体结果通过返回的 URL 下载保存，不调用未声明的 `/content` 端点。

本包不包含音频、向量、审核、素材库管理、回调服务器或 Seedance draft/升档流程；这些接口不由本次聊天、图片和视频生成接入隐式触发。视频参考必须使用公网 URL；Gateway 图片编辑可由宿主将本地已授权图片读取为上传文件。

源码与分发包须一起使用支持声明式流式格式、轮询策略和动态 multipart 的当前宿主。完整参数、响应和验证边界见 [接口说明](docs/interface.md)。来源：[4SToken 文档](https://www.4stoken.cn/docs)。
