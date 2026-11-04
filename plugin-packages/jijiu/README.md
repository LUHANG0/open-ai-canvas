# 极九 API

极九独立声明式协议插件。提供 `jijiu-chat`、`jijiu-image`、`jijiu-gemini-image`、`jijiu-video`，分别处理聊天、GPT/Banana 同步生图与 multipart 改图、Gemini 原生生图、逐线路视频创建/轮询/下载。

默认地址为 `https://newapi.jijiucanvas.com`，使用渠道中的 Bearer `apiKey`。每个令牌只有一个分组，须为不同分组分别配置渠道，不能把请求中的模型名当作跨组授权。密钥不随插件分发。

模型完整名称、大小写和中文原样保留。价目表中的动态计费表达式优先于旧的 `model_price` 字段；暂停线路不应启用。文档与已配置能力不等于真实远端生成已经验收。

接口依据：[极九接入文档](https://newapi.jijiucanvas.com/docs/)、[价目表](https://newapi.jijiucanvas.com/pricing)。详细约束和暂未开放的能力见 [接口说明](docs/interface.md)。
