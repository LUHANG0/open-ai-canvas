# Drama API

独立渠道协议插件。Base URL 填 `https://drama.dafeiyangapi.top`，`apiKey` 填平台控制台创建的 New API 用户令牌，由宿主后端使用 Bearer 鉴权。

| 用途 | Provider ID | 适用范围 |
| --- | --- | --- |
| 聊天 | `drama-chat` | 标准 Chat Completions，含普通响应、SSE 和 Agent 工具调用 |
| GPT 生图 | `drama-image` | 独立选择画幅、1K / 2K / 4K 与质量，换算像素 size |
| Gemini 生图 | `drama-gemini-image` | 独立选择画幅与分辨率，由插件将档位映射为 quality |
| 视频 | `drama-seedance-a` | `seedance2.0-A`、`seedance2.0-fast-A`、`seedance2.0-Mini-A`、`seedance2.5-A` |

在插件中心启用“Drama API”，在渠道模型上选择对应协议。聊天和图片的模型 ID 使用当前令牌 `/v1/models` 返回的实际名称；视频仅适配上述 A 系列。公开模型、分组及开放档位以当前控制台为准。

标准 2.0-A 支持 4～15 秒、480p / 720p / 1080p / 4K；2.5-A 支持 4～30 秒、480p / 720p。Fast、Mini 的档位和参考素材限额必须按控制台填写，插件不套用标准版能力。参考素材使用公网 HTTPS 直链。视频普通参考按各类型排序后对应提示词中的 `@图N` / `@图片N`、`@视频N`、`@音频N`；A 系列要求引用每个普通参考素材，请在提示词里明确写出。

视频仅提交文档公开的 `model`、`prompt`、`seconds`、`aspect_ratio`、`resolution`、`references`。首尾帧成对且不能混普通参考，标准 2.0-A 首尾帧必须选 Auto。只查询已保存的公开任务 ID，完成后通过带令牌的 `/content` 下载保存。创建接口不会自动重发；超时但没有取得任务 ID 时，先检查平台任务记录，避免重复生成和计费。

GPT 纯文字生图使用 `/v1/images/generations` JSON；带参考图时使用 `/v1/images/edits` multipart，图片按顺序以重复的 `image[]` 文件字段上传，禁止继续向 generations 发送 `images`。HTTPS 图片由宿主读取为文件，也接受宿主提供的 PNG/JPEG/WebP Base64 图片。Gemini 保持 generations JSON 的 `images[].image_url`。两种图片协议均不支持蒙版。GPT 分辨率仅参与本地画幅到像素 size 的转换，quality 独立；Gemini 由分辨率选择映射 low / medium / high，不再另设冲突的质量开关。两者均不发送 resolution 字段。默认尺寸组是可编辑的宿主预设，实际模型支持哪些尺寸需以当前线路为准。

1.1.0 为原有 Drama 图片模型补充独立分辨率与尺寸组，保留已经配置的质量、画幅和数量上限；管理员已经选择 100 张时仍保留 100，新增模型可在插件 128 张上限内配置。视频不提供声音、水印、seed 等未声明参数开关，生成界面按 A 系列能力显示分辨率、画幅和秒数；保存时拒绝超出明确型号合同的配置。

1.1.1 根据正式站 `gpt-image-2.5-sunburst` 的明确 400 响应修正 GPT 参考图端点。平台统一生图文档仍展示 generations + images，但该 GPT 线路拒绝此组合；编辑传输使用 New API 公布的 multipart `image[]` 合同。本次同时核对 A 视频公开字段、参考与首尾帧、查询和下载，现有 A 视频端点不需要切换。未重新提交用户失败任务，也未进行收费生成；模拟请求检查不代表上游实际生成验收。

未包含其他视频系列、素材库上传、回调服务、图片 SSE 或音频生成。详细合同及验证边界见 [接口说明](docs/interface.md)。依据：[Drama API 专用文档](https://drama.dafeiyangapi.top/docs/drama)、[模型广场](https://drama.dafeiyangapi.top/pricing)。
