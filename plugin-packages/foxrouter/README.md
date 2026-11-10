# FoxRouter API

FoxRouter 独立声明式协议插件，Base URL 为 `https://foxrouter.org`，使用渠道保存的分组 API Key 进行 Bearer 鉴权，密钥不随插件分发。

| Provider | 用途 |
| --- | --- |
| `foxrouter-chat` | 普通聊天、SSE、Agent 工具调用与工具结果回传 |
| `foxrouter-gpt-image` | GPT Flare / Sunburst 文生图和最多四张参考图的 multipart 改图 |
| `foxrouter-gemini-image` | Gemini 图片与 Banana 文生图、最多六张参考图，1K / 2K / 4K |

每个分组单独配置渠道。模型原始名称保持不变；令牌可见、模型已配置、官方监测良好与真实生成验收是不同证据。

依据：[官方接口文档](https://docs.foxrouter.org/)、[模型价格](https://foxrouter.org/pricing)。字段与边界见 [接口合同](docs/interface.md)。
