# Drama API 接口说明

## 地址、鉴权与协议选择

Base URL 为 `https://drama.dafeiyangapi.top`。所有请求由登录态宿主后端中转，使用配置字段 `apiKey` 发送 `Authorization: Bearer …`。模型名从当前令牌的 `GET /v1/models` 或控制台取得，不把文档示例当作已开通模型。

本插件提供 `drama-chat`、`drama-image`、`drama-gemini-image`、`drama-seedance-a` 四个独立 Provider，均为声明式实现。GPT 图片与 Gemini 图片分别声明参数语义，不按模型名猜测线协议。视频范围按用户要求限定为 Seedance 2.0 A 系列及 2.5-A。

## 聊天

`POST /v1/chat/completions`，采用标准 Chat Completions 的 messages / choices、SSE delta、tool_calls / tool 结构。支持历史对话、系统提示词、工具调用与推理文本；文本流由宿主管理。专用接入页没有独立聊天章节，平台模型广场标注 Chat 端点并链接 New API 文档，真实模型兼容性仍需验收。未额外声明 Responses、Claude 或 Gemini 原生文本线路。

## GPT 与 Gemini 生图

GPT 无参考图时调用 `POST /v1/images/generations` JSON；有参考图时调用 `POST /v1/images/edits` multipart/form-data。Gemini 保持 `POST /v1/images/generations` JSON。不会在生成请求失败后自动重发编辑请求，端点在发送前按参考图选择。

| 宿主字段 | 上游字段 | 处理 |
| --- | --- | --- |
| model / prompt | model / prompt | 必填，去首尾空格 |
| imageCount | n | 1～128，未填默认 1 |
| aspectRatio + resolution | size | GPT 按管理员配置的分辨率与比例预设换算像素；Gemini 发送比例 |
| quality | quality | GPT 的独立质量值，空及 auto 省略；Gemini 不暴露该输入，而由 resolution 映射 |
| images | GPT：image[] 文件；Gemini：images[].image_url | 按 order 排序；GPT 由宿主将 HTTPS 或图片 Data URL 转为文件，Gemini 使用公网 HTTPS 地址 |
| providerOptions.<对应 Provider ID>.response_format | response_format | url（默认）或 b64_json，界面仅保留一处配置 |
| — | stream | JSON 生图固定 false；GPT multipart 编辑不发送 |

输出读取 `data[].url` 或 `data[].b64_json`，临时地址由宿主下载保存。蒙版、视频/音频参考在提交前拒绝。不会发送 resolution、background、output_format、async 或其它平台未声明字段。

GPT 编辑保留 model、prompt、n、size、quality、response_format，文件以重复的 `image[]` 部件提交，不发送 `images` JSON 字段或 mask。GPT 的 requiresPublicMediaUrls=false 是因为由宿主读取并上传文件，URL 仍限定 HTTPS，内联仅允许 PNG/JPEG/WebP Data URL；宿主继续负责 URL、SSRF、文件解析和大小限制。Gemini 保留 requiresPublicMediaUrls=true。

这一端点分流以正式站实际失败响应为依据：`gpt-image-2.5-sunburst` 明确拒绝 generations 的 images 并要求 edits。平台统一文档的参考图说明不适用于该 GPT 线路；multipart 编辑格式参考 New API 公开插件调用合同。没有真实收费请求验证其他型号的编辑结果。

两个图片协议均声明 imageResolution（1k / 2k / 4k）、画幅与生成数量。GPT size 声明 encoding=pixels：例如 4K 档 16:9 的宿主默认预设为 3840x2160，quality=medium 不会被改为 high。Gemini size 声明 encoding=ratio，1K / 2K / 4K 分别生成 quality=low / medium / high，不发送独立 resolution，也不暴露第二个质量选择。GPT 2.5 的 xhigh / max 只应在当前线路明确支持时由管理员添加；其他 GPT 型号不自动启用。

后台可分别配置各档位支持的画幅和精确像素预设，画布按相同合同显示、计价和组装请求。默认预设仅是宿主尺寸选择，不承诺每个上游型号接受全部组合；实际输出以上游为准。插件版本新增分辨率时，为旧 Drama 图片配置补齐新字段及已有画幅的尺寸组，保留管理员质量与数量设置，不重复初始化已经配置的分辨率。声明式数量上限由插件合同约束为 128；旧版无参数合同的宿主规则仍为 100。

## Seedance A 视频

创建为 `POST /v1/videos` JSON，查询为 `GET /v1/videos/{id}`，完成后从 `GET /v1/videos/{id}/content` 鉴权下载。优先使用创建返回的 `id`，兼容 `task_id`；不使用服务端内部上游任务编号。忽略 `metadata.url`，避免把任务未完成时的代理地址或临时地址误判为结果。

| 上游字段 | 映射 |
| --- | --- |
| model | 实际 A 系列模型名，支持标准 2.0-A、Fast-A、Mini-A 和 2.5-A |
| prompt | 原提示词去首尾空格，保留占位符及正文，不自动改写 |
| seconds | 正整数；标准 2.0-A 为 4～15，2.5-A 为 4～30；Fast/Mini 按模型配置 |
| aspect_ratio | 模型画幅；Auto 使用文档大小写；2.5-A 不允许 Auto |
| resolution | 明确填写模型开放值；4K 保留大写 K，其余转小写 |
| references | 图片、视频、音频分别按 order 排序后拼接，项为 type、role、source |

普通参考 role 为 reference；图片的 first_frame / last_frame 保留语义。首尾帧各一张、禁止混普通参考；标准 2.0-A 首尾帧要求 Auto。文档单项素材示例存在只含 first_frame 的片段，但参数限制明确要求成对，因此插件采用成对校验。所有素材使用公网 HTTPS URL；本包不提供 Base64 或素材库流程。

标准 2.0-A 最多 9 图、3 视频、3 音频，合计 12；2.5-A 最多 30 图、10 视频、10 音频，合计 50。Fast/Mini 的素材限额以控制台能力为准，默认关闭参考素材，配置后开启。宿主模型能力负责文件体积与时长限制，上游继续校验素材可达性、格式、组合与提示词引用编号。

普通参考在 prompt 中以同类型数组顺序从 1 编号，每个都需引用：图片 `@图N` 或 `@图片N`，视频 `@视频N`，音频 `@音频N`。插件不自动插入占位符，以免改变生成意图；非法编号、前导零、遗漏引用由平台返回错误并向用户显示。首尾帧也应按模型提示词要求描述。

不发送 generate_audio、audio、watermark、seed、size、duration、image_urls、content 或其他系列扩展字段。2.0-A / 2.5-A 时长、分辨率、画幅和数量在提交前校验；不能通过扩展对象注入未声明顶层字段。

状态仅映射 queued → pending、in_progress → processing、completed → succeeded、failed → failed，未知值继续等待，不提前下载。轮询间隔 15 秒，瞬时错误最多重试 3 次；失败读取 error.message、message 或字符串 error。HTTP 和业务错误保持失败。宿主保留实际 usage；下载失败不重新创建任务，已取得 ID 的超时任务继续查询原 ID。

## 安装与验证边界

在当前源码宿主中加载 `drama-api.yingce-plugin`。配置渠道令牌、协议和真实模型能力后测试；生图和视频的连接测试会生成真实任务并可能计费。

专项检查使用分发包和本地模拟 HTTP 服务，覆盖字段、参考顺序、首尾帧、模型差异、状态机、鉴权下载、恢复和错误。未使用真实密钥，未执行收费模型生成；真实分组、模型输出、参考素材可用性、内容审核、账单及画布保存由用户验收。

官方依据：[专用接入说明](https://drama.dafeiyangapi.top/docs/drama)、[模型广场](https://drama.dafeiyangapi.top/pricing)。

编辑传输依据：[New API 插件使用说明](https://github.com/QuantumNous/new-api-docs-v1/blob/main/content/docs/en/plugins/usage.mdx)。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "drama-api",
  "name": "Drama API",
  "version": "1.1.1",
  "author": "梦层 MengCeng",
  "description": "Drama API 独立协议：聊天、统一生图、Seedance 2.0/2.5 A 系列视频。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "New API 用户令牌",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "drama-chat",
        "label": "Drama API 聊天",
        "capabilities": [
          "text"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://drama.dafeiyangapi.top",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "model",
            "description": "当前令牌开放并具备该协议线路的 modelCode。",
            "required": true
          },
          {
            "name": "messages",
            "type": "message[]",
            "mapping": "messages",
            "description": "宿主系统指令、历史与多模态内容。",
            "required": true
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "documented optional fields",
            "description": "本协议 ID 命名空间的白名单可选字段。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/chat/completions",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "messages": {
              "$ref": "request.messages"
            },
            "temperature": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.temperature"
              }
            },
            "top_p": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.top_p"
              }
            },
            "max_tokens": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.extra.max_tokens"
                  },
                  {
                    "$ref": "request.providerOptions.drama-chat.max_tokens"
                  }
                ]
              }
            },
            "tools": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.tools"
              }
            },
            "tool_choice": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.tool_choice"
              }
            },
            "response_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.response_format"
              }
            },
            "stop": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.stop"
              }
            },
            "frequency_penalty": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.frequency_penalty"
              }
            },
            "presence_penalty": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.presence_penalty"
              }
            },
            "thinking": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.thinking"
              }
            },
            "service_tier": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.drama-chat.service_tier"
              }
            }
          }
        },
        "agent": {
          "method": "POST",
          "path": "/v1/chat/completions",
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "$ref": "request.extra.agent.chatCompletion"
              },
              {
                "model": {
                  "$ref": "request.model"
                }
              }
            ]
          }
        },
        "response": {
          "status": "succeeded",
          "textPaths": [
            "choices.0.message.content",
            "choices.0.text"
          ],
          "reasoningPaths": [
            "choices.0.message.reasoning_content"
          ],
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code"
          ],
          "messagePaths": [
            "error.message"
          ]
        },
        "agentResponse": {
          "textPaths": [
            "choices.0.message.content",
            "choices.0.text"
          ],
          "reasoningPaths": [
            "choices.0.message.reasoning_content"
          ],
          "toolCallsPath": "choices.0.message.tool_calls",
          "toolCallIdPaths": [
            "id"
          ],
          "toolCallNamePaths": [
            "function.name"
          ],
          "toolCallArgumentsPaths": [
            "function.arguments"
          ]
        },
        "streamingFormat": "chat-completion"
      },
      {
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://drama.dafeiyangapi.top",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "id": "drama-image",
        "label": "Drama API GPT 生图",
        "capabilities": [
          "image"
        ],
        "requiresPublicMediaUrls": false,
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅 / 尺寸",
            "type": "string",
            "binding": "aspectRatio",
            "encoding": "pixels",
            "pricing": true
          },
          {
            "name": "imageResolution",
            "label": "分辨率",
            "type": "string",
            "binding": "resolution",
            "values": [
              "1k",
              "2k",
              "4k"
            ],
            "default": "1k",
            "pricing": true,
            "description": "仅用于画幅到像素尺寸的换算，不向上游发送 resolution。"
          },
          {
            "name": "quality",
            "label": "质量 / 档位",
            "type": "string",
            "binding": "quality",
            "description": "low / medium / high 为质量；xhigh / max 仅适用于平台明确开放的 GPT 2.5 线路。",
            "pricing": true
          },
          {
            "name": "count",
            "label": "生成数量",
            "type": "integer",
            "binding": "imageCount",
            "min": 1,
            "max": 128,
            "step": 1,
            "default": 1
          },
          {
            "name": "responseFormat",
            "label": "响应格式",
            "type": "string",
            "binding": "providerOptions.drama-image.response_format",
            "values": [
              "url",
              "b64_json"
            ],
            "default": "url"
          }
        ],
        "validations": [
          {
            "assert": {
              "$ne": [
                {
                  "$trim": {
                    "$ref": "request.model"
                  }
                },
                ""
              ]
            },
            "message": "Drama API：请填写当前令牌可用的模型 ID"
          },
          {
            "assert": {
              "$ne": [
                {
                  "$trim": {
                    "$ref": "request.prompt"
                  }
                },
                ""
              ]
            },
            "message": "Drama API：提示词不能为空"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$ref": "request.images"
                      },
                      "as": "media",
                      "where": {
                        "$or": [
                          {
                            "$and": [
                              {
                                "$eq": [
                                  {
                                    "$first": {
                                      "$split": [
                                        {
                                          "$ref": "media.value"
                                        },
                                        "://"
                                      ]
                                    }
                                  },
                                  "https"
                                ]
                              },
                              {
                                "$gt": [
                                  {
                                    "$len": {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "media.value"
                                            },
                                            "://"
                                          ]
                                        },
                                        1
                                      ]
                                    }
                                  },
                                  0
                                ]
                              }
                            ]
                          },
                          {
                            "$in": [
                              {
                                "$first": {
                                  "$split": [
                                    {
                                      "$ref": "media.value"
                                    },
                                    ","
                                  ]
                                }
                              },
                              [
                                "data:image/png;base64",
                                "data:image/jpeg;base64",
                                "data:image/webp;base64"
                              ]
                            ]
                          }
                        ]
                      }
                    }
                  }
                },
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                }
              ]
            },
            "message": "Drama API：GPT 参考图必须为 HTTPS 地址或 PNG/JPEG/WebP Base64 图片"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.images"
                        }
                      },
                      "as": "media",
                      "where": {
                        "$eq": [
                          {
                            "$ref": "media.role"
                          },
                          "mask"
                        ]
                      }
                    }
                  }
                },
                0
              ]
            },
            "message": "Drama API：统一生图接口没有声明蒙版，请移除蒙版"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.videos"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.audios"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "Drama API：生图不接受视频或音频参考"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
                    {
                      "$ref": "request.imageCount"
                    },
                    0
                  ]
                },
                {
                  "$lte": [
                    {
                      "$ref": "request.imageCount"
                    },
                    128
                  ]
                }
              ]
            },
            "message": "Drama API：生成张数必须为 1～128（未指定时为 1）"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/images/generations",
          "contentType": "application/json",
          "body": {
            "model": {
              "$trim": {
                "$ref": "request.model"
              }
            },
            "prompt": {
              "$trim": {
                "$ref": "request.prompt"
              }
            },
            "n": {
              "$if": {
                "condition": {
                  "$gt": [
                    {
                      "$ref": "request.imageCount"
                    },
                    0
                  ]
                },
                "then": {
                  "$ref": "request.imageCount"
                },
                "else": 1
              }
            },
            "size": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$ref": "request.aspectRatio"
                          }
                        }
                      },
                      [
                        "",
                        "auto"
                      ]
                    ]
                  },
                  "then": null,
                  "else": {
                    "$trim": {
                      "$ref": "request.aspectRatio"
                    }
                  }
                }
              }
            },
            "quality": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$ref": "request.quality"
                          }
                        }
                      },
                      [
                        "",
                        "auto"
                      ]
                    ]
                  },
                  "then": null,
                  "else": {
                    "$trim": {
                      "$ref": "request.quality"
                    }
                  }
                }
              }
            },
            "response_format": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.drama-image.response_format"
                },
                "url"
              ]
            },
            "stream": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$gt": [
                      {
                        "$len": {
                          "$ref": "request.images"
                        }
                      },
                      0
                    ]
                  },
                  "then": null,
                  "else": false
                }
              }
            }
          },
          "pathTemplate": {
            "$if": {
              "condition": {
                "$gt": [
                  {
                    "$len": {
                      "$ref": "request.images"
                    }
                  },
                  0
                ]
              },
              "then": "/v1/images/edits",
              "else": "/v1/images/generations"
            }
          },
          "contentTypeTemplate": {
            "$if": {
              "condition": {
                "$gt": [
                  {
                    "$len": {
                      "$ref": "request.images"
                    }
                  },
                  0
                ]
              },
              "then": "multipart/form-data",
              "else": "application/json"
            }
          },
          "files": [
            {
              "name": "image[]",
              "source": {
                "$sortByOrder": {
                  "$ref": "request.images"
                }
              }
            }
          ]
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$map": {
              "from": {
                "$ref": "response.data"
              },
              "as": "item",
              "in": {
                "url": {
                  "$omitEmpty": {
                    "$ref": "item.url"
                  }
                },
                "dataUrl": {
                  "$if": {
                    "condition": {
                      "$ref": "item.b64_json"
                    },
                    "then": {
                      "$concat": [
                        "data:image/png;base64,",
                        {
                          "$ref": "item.b64_json"
                        }
                      ]
                    },
                    "else": null
                  }
                }
              }
            }
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code",
            "code"
          ],
          "messagePaths": [
            "error.message",
            "message"
          ],
          "resultEphemeral": true
        }
      },
      {
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://drama.dafeiyangapi.top",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "id": "drama-gemini-image",
        "label": "Drama API Gemini 生图",
        "capabilities": [
          "image"
        ],
        "requiresPublicMediaUrls": true,
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅比例",
            "type": "string",
            "binding": "aspectRatio",
            "pricing": true,
            "encoding": "ratio"
          },
          {
            "name": "imageResolution",
            "label": "分辨率",
            "type": "string",
            "binding": "resolution",
            "values": [
              "1k",
              "2k",
              "4k"
            ],
            "default": "1k",
            "pricing": true,
            "description": "1K / 2K / 4K 分别映射为平台的 quality=low / medium / high。"
          },
          {
            "name": "count",
            "label": "生成数量",
            "type": "integer",
            "binding": "imageCount",
            "min": 1,
            "max": 128,
            "step": 1,
            "default": 1
          },
          {
            "name": "responseFormat",
            "label": "响应格式",
            "type": "string",
            "binding": "providerOptions.drama-gemini-image.response_format",
            "values": [
              "url",
              "b64_json"
            ],
            "default": "url"
          }
        ],
        "validations": [
          {
            "assert": {
              "$ne": [
                {
                  "$trim": {
                    "$ref": "request.model"
                  }
                },
                ""
              ]
            },
            "message": "Drama API：请填写当前令牌可用的模型 ID"
          },
          {
            "assert": {
              "$ne": [
                {
                  "$trim": {
                    "$ref": "request.prompt"
                  }
                },
                ""
              ]
            },
            "message": "Drama API：提示词不能为空"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$ref": "request.images"
                      },
                      "as": "media",
                      "where": {
                        "$and": [
                          {
                            "$eq": [
                              {
                                "$first": {
                                  "$split": [
                                    {
                                      "$ref": "media.value"
                                    },
                                    "://"
                                  ]
                                }
                              },
                              "https"
                            ]
                          },
                          {
                            "$gt": [
                              {
                                "$len": {
                                  "$at": [
                                    {
                                      "$split": [
                                        {
                                          "$ref": "media.value"
                                        },
                                        "://"
                                      ]
                                    },
                                    1
                                  ]
                                }
                              },
                              0
                            ]
                          }
                        ]
                      }
                    }
                  }
                },
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                }
              ]
            },
            "message": "Drama API：参考素材必须使用公网 HTTPS 直链"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.images"
                        }
                      },
                      "as": "media",
                      "where": {
                        "$eq": [
                          {
                            "$ref": "media.role"
                          },
                          "mask"
                        ]
                      }
                    }
                  }
                },
                0
              ]
            },
            "message": "Drama API：统一生图接口没有声明蒙版，请移除蒙版"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.videos"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.audios"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "Drama API：生图不接受视频或音频参考"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
                    {
                      "$ref": "request.imageCount"
                    },
                    0
                  ]
                },
                {
                  "$lte": [
                    {
                      "$ref": "request.imageCount"
                    },
                    128
                  ]
                }
              ]
            },
            "message": "Drama API：生成张数必须为 1～128（未指定时为 1）"
          },
          {
            "assert": {
              "$in": [
                {
                  "$lower": {
                    "$ref": "request.resolution"
                  }
                },
                [
                  "1k",
                  "2k",
                  "4k"
                ]
              ]
            },
            "message": "Drama API Gemini 图片请选择 1K、2K 或 4K 档位"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/images/generations",
          "contentType": "application/json",
          "body": {
            "model": {
              "$trim": {
                "$ref": "request.model"
              }
            },
            "prompt": {
              "$trim": {
                "$ref": "request.prompt"
              }
            },
            "n": {
              "$if": {
                "condition": {
                  "$gt": [
                    {
                      "$ref": "request.imageCount"
                    },
                    0
                  ]
                },
                "then": {
                  "$ref": "request.imageCount"
                },
                "else": 1
              }
            },
            "size": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$lower": {
                          "$trim": {
                            "$ref": "request.aspectRatio"
                          }
                        }
                      },
                      [
                        "",
                        "auto"
                      ]
                    ]
                  },
                  "then": null,
                  "else": {
                    "$trim": {
                      "$ref": "request.aspectRatio"
                    }
                  }
                }
              }
            },
            "quality": {
              "$switch": {
                "cases": [
                  {
                    "when": {
                      "$eq": [
                        {
                          "$lower": {
                            "$ref": "request.resolution"
                          }
                        },
                        "2k"
                      ]
                    },
                    "then": "medium"
                  },
                  {
                    "when": {
                      "$eq": [
                        {
                          "$lower": {
                            "$ref": "request.resolution"
                          }
                        },
                        "4k"
                      ]
                    },
                    "then": "high"
                  }
                ],
                "default": "low"
              }
            },
            "images": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$sortByOrder": {
                      "$ref": "request.images"
                    }
                  },
                  "as": "media",
                  "in": {
                    "image_url": {
                      "$ref": "media.value"
                    }
                  }
                }
              }
            },
            "response_format": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.drama-gemini-image.response_format"
                },
                "url"
              ]
            },
            "stream": false
          }
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$map": {
              "from": {
                "$ref": "response.data"
              },
              "as": "item",
              "in": {
                "url": {
                  "$omitEmpty": {
                    "$ref": "item.url"
                  }
                },
                "dataUrl": {
                  "$if": {
                    "condition": {
                      "$ref": "item.b64_json"
                    },
                    "then": {
                      "$concat": [
                        "data:image/png;base64,",
                        {
                          "$ref": "item.b64_json"
                        }
                      ]
                    },
                    "else": null
                  }
                }
              }
            }
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code",
            "code"
          ],
          "messagePaths": [
            "error.message",
            "message"
          ],
          "resultEphemeral": true
        }
      },
      {
        "id": "drama-seedance-a",
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://drama.dafeiyangapi.top",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "label": "Drama API Seedance A（2.0 / 2.5）",
        "capabilities": [
          "video"
        ],
        "requiresPublicMediaUrls": true,
        "polling": {
          "intervalSeconds": 15,
          "transientRetryLimit": 3
        },
        "validations": [
          {
            "assert": {
              "$ne": [
                {
                  "$trim": {
                    "$ref": "request.model"
                  }
                },
                ""
              ]
            },
            "message": "Drama API：请填写当前令牌可用的模型 ID"
          },
          {
            "assert": {
              "$ne": [
                {
                  "$trim": {
                    "$ref": "request.prompt"
                  }
                },
                ""
              ]
            },
            "message": "Drama API：提示词不能为空"
          },
          {
            "assert": {
              "$in": [
                {
                  "$lower": {
                    "$trim": {
                      "$ref": "request.model"
                    }
                  }
                },
                [
                  "seedance2.0-a",
                  "seedance2.0-fast-a",
                  "seedance2.0-mini-a",
                  "seedance2.5-a"
                ]
              ]
            },
            "message": "Drama API：此协议仅支持文档中的 Seedance 2.0-A、Fast-A、Mini-A 和 2.5-A 型号"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
                    {
                      "$ref": "request.duration"
                    },
                    {
                      "$if": {
                        "condition": {
                          "$or": [
                            {
                              "$eq": [
                                {
                                  "$lower": {
                                    "$trim": {
                                      "$ref": "request.model"
                                    }
                                  }
                                },
                                "seedance2.0-a"
                              ]
                            },
                            {
                              "$eq": [
                                {
                                  "$lower": {
                                    "$trim": {
                                      "$ref": "request.model"
                                    }
                                  }
                                },
                                "seedance2.5-a"
                              ]
                            }
                          ]
                        },
                        "then": 4,
                        "else": 1
                      }
                    }
                  ]
                },
                {
                  "$lte": [
                    {
                      "$ref": "request.duration"
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$ref": "request.model"
                                }
                              }
                            },
                            "seedance2.0-a"
                          ]
                        },
                        "then": 15,
                        "else": {
                          "$if": {
                            "condition": {
                              "$eq": [
                                {
                                  "$lower": {
                                    "$trim": {
                                      "$ref": "request.model"
                                    }
                                  }
                                },
                                "seedance2.5-a"
                              ]
                            },
                            "then": 30,
                            "else": 3600
                          }
                        }
                      }
                    }
                  ]
                }
              ]
            },
            "message": "Drama API：时长不符合 A 系列限制：标准 2.0 为 4～15 秒，2.5 为 4～30 秒；Fast/Mini 以当前模型配置为准"
          },
          {
            "assert": {
              "$ne": [
                {
                  "$trim": {
                    "$ref": "request.resolution"
                  }
                },
                ""
              ]
            },
            "message": "Drama API：请明确配置模型开放的分辨率"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$lower": {
                        "$trim": {
                          "$ref": "request.model"
                        }
                      }
                    },
                    "seedance2.0-a"
                  ]
                },
                "then": {
                  "$in": [
                    {
                      "$lower": {
                        "$trim": {
                          "$ref": "request.resolution"
                        }
                      }
                    },
                    [
                      "480p",
                      "720p",
                      "1080p",
                      "4k"
                    ]
                  ]
                },
                "else": {
                  "$if": {
                    "condition": {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.5-a"
                      ]
                    },
                    "then": {
                      "$in": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.resolution"
                            }
                          }
                        },
                        [
                          "480p",
                          "720p"
                        ]
                      ]
                    },
                    "else": {
                      "$ne": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.resolution"
                            }
                          }
                        },
                        "auto"
                      ]
                    }
                  }
                }
              }
            },
            "message": "Drama API：分辨率不符合该 A 系列模型限制"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$lower": {
                        "$trim": {
                          "$ref": "request.model"
                        }
                      }
                    },
                    "seedance2.0-a"
                  ]
                },
                "then": {
                  "$in": [
                    {
                      "$lower": {
                        "$trim": {
                          "$ref": "request.aspectRatio"
                        }
                      }
                    },
                    [
                      "21:9",
                      "16:9",
                      "4:3",
                      "1:1",
                      "3:4",
                      "9:16",
                      "auto"
                    ]
                  ]
                },
                "else": {
                  "$if": {
                    "condition": {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.5-a"
                      ]
                    },
                    "then": {
                      "$in": [
                        {
                          "$trim": {
                            "$ref": "request.aspectRatio"
                          }
                        },
                        [
                          "21:9",
                          "16:9",
                          "4:3",
                          "1:1",
                          "3:4",
                          "9:16"
                        ]
                      ]
                    },
                    "else": {
                      "$ne": [
                        {
                          "$trim": {
                            "$ref": "request.aspectRatio"
                          }
                        },
                        ""
                      ]
                    }
                  }
                }
              }
            },
            "message": "Drama API：请选择该模型支持的画幅；2.5-A 不支持 Auto"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$ref": "request.images"
                      },
                      "as": "media",
                      "where": {
                        "$and": [
                          {
                            "$eq": [
                              {
                                "$first": {
                                  "$split": [
                                    {
                                      "$ref": "media.value"
                                    },
                                    "://"
                                  ]
                                }
                              },
                              "https"
                            ]
                          },
                          {
                            "$gt": [
                              {
                                "$len": {
                                  "$at": [
                                    {
                                      "$split": [
                                        {
                                          "$ref": "media.value"
                                        },
                                        "://"
                                      ]
                                    },
                                    1
                                  ]
                                }
                              },
                              0
                            ]
                          }
                        ]
                      }
                    }
                  }
                },
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                }
              ]
            },
            "message": "Drama API：参考素材必须使用公网 HTTPS 直链"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$ref": "request.videos"
                      },
                      "as": "media",
                      "where": {
                        "$and": [
                          {
                            "$eq": [
                              {
                                "$first": {
                                  "$split": [
                                    {
                                      "$ref": "media.value"
                                    },
                                    "://"
                                  ]
                                }
                              },
                              "https"
                            ]
                          },
                          {
                            "$gt": [
                              {
                                "$len": {
                                  "$at": [
                                    {
                                      "$split": [
                                        {
                                          "$ref": "media.value"
                                        },
                                        "://"
                                      ]
                                    },
                                    1
                                  ]
                                }
                              },
                              0
                            ]
                          }
                        ]
                      }
                    }
                  }
                },
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                }
              ]
            },
            "message": "Drama API：参考素材必须使用公网 HTTPS 直链"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$ref": "request.audios"
                      },
                      "as": "media",
                      "where": {
                        "$and": [
                          {
                            "$eq": [
                              {
                                "$first": {
                                  "$split": [
                                    {
                                      "$ref": "media.value"
                                    },
                                    "://"
                                  ]
                                }
                              },
                              "https"
                            ]
                          },
                          {
                            "$gt": [
                              {
                                "$len": {
                                  "$at": [
                                    {
                                      "$split": [
                                        {
                                          "$ref": "media.value"
                                        },
                                        "://"
                                      ]
                                    },
                                    1
                                  ]
                                }
                              },
                              0
                            ]
                          }
                        ]
                      }
                    }
                  }
                },
                {
                  "$len": {
                    "$ref": "request.audios"
                  }
                }
              ]
            },
            "message": "Drama API：参考素材必须使用公网 HTTPS 直链"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.images"
                        }
                      },
                      "as": "media",
                      "where": {
                        "$eq": [
                          {
                            "$ref": "media.role"
                          },
                          "mask"
                        ]
                      }
                    }
                  }
                },
                0
              ]
            },
            "message": "Drama API：视频不支持蒙版"
          },
          {
            "assert": {
              "$or": [
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.images"
                                }
                              },
                              "as": "media",
                              "where": {
                                "$eq": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "first_frame"
                                ]
                              }
                            }
                          }
                        },
                        0
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.images"
                                }
                              },
                              "as": "media",
                              "where": {
                                "$eq": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "last_frame"
                                ]
                              }
                            }
                          }
                        },
                        0
                      ]
                    }
                  ]
                },
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.images"
                                }
                              },
                              "as": "media",
                              "where": {
                                "$eq": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "first_frame"
                                ]
                              }
                            }
                          }
                        },
                        1
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.images"
                                }
                              },
                              "as": "media",
                              "where": {
                                "$eq": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "last_frame"
                                ]
                              }
                            }
                          }
                        },
                        1
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$add": [
                            {
                              "$len": {
                                "$ref": "request.images"
                              }
                            },
                            {
                              "$len": {
                                "$ref": "request.videos"
                              }
                            },
                            {
                              "$len": {
                                "$ref": "request.audios"
                              }
                            }
                          ]
                        },
                        2
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "Drama API：首尾帧必须各一张成对提交，且不能混入普通参考图、视频或音频"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$and": [
                      {
                        "$eq": [
                          {
                            "$lower": {
                              "$trim": {
                                "$ref": "request.model"
                              }
                            }
                          },
                          "seedance2.0-a"
                        ]
                      },
                      {
                        "$and": [
                          {
                            "$eq": [
                              {
                                "$len": {
                                  "$filter": {
                                    "from": {
                                      "$sortByOrder": {
                                        "$ref": "request.images"
                                      }
                                    },
                                    "as": "media",
                                    "where": {
                                      "$eq": [
                                        {
                                          "$ref": "media.role"
                                        },
                                        "first_frame"
                                      ]
                                    }
                                  }
                                }
                              },
                              1
                            ]
                          },
                          {
                            "$eq": [
                              {
                                "$len": {
                                  "$filter": {
                                    "from": {
                                      "$sortByOrder": {
                                        "$ref": "request.images"
                                      }
                                    },
                                    "as": "media",
                                    "where": {
                                      "$eq": [
                                        {
                                          "$ref": "media.role"
                                        },
                                        "last_frame"
                                      ]
                                    }
                                  }
                                }
                              },
                              1
                            ]
                          },
                          {
                            "$eq": [
                              {
                                "$add": [
                                  {
                                    "$len": {
                                      "$ref": "request.images"
                                    }
                                  },
                                  {
                                    "$len": {
                                      "$ref": "request.videos"
                                    }
                                  },
                                  {
                                    "$len": {
                                      "$ref": "request.audios"
                                    }
                                  }
                                ]
                              },
                              2
                            ]
                          }
                        ]
                      }
                    ]
                  }
                },
                {
                  "$eq": [
                    {
                      "$lower": {
                        "$trim": {
                          "$ref": "request.aspectRatio"
                        }
                      }
                    },
                    "auto"
                  ]
                }
              ]
            },
            "message": "Drama API：标准 2.0-A 首尾帧模式必须选择 Auto 画幅"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$or": [
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.0-a"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.5-a"
                      ]
                    }
                  ]
                },
                "then": {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$ref": "request.model"
                                }
                              }
                            },
                            "seedance2.5-a"
                          ]
                        },
                        "then": 30,
                        "else": 9
                      }
                    }
                  ]
                },
                "else": true
              }
            },
            "message": "Drama API：参考素材数量超过该模型上限"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$or": [
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.0-a"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.5-a"
                      ]
                    }
                  ]
                },
                "then": {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.videos"
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$ref": "request.model"
                                }
                              }
                            },
                            "seedance2.5-a"
                          ]
                        },
                        "then": 10,
                        "else": 3
                      }
                    }
                  ]
                },
                "else": true
              }
            },
            "message": "Drama API：参考素材数量超过该模型上限"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$or": [
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.0-a"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.5-a"
                      ]
                    }
                  ]
                },
                "then": {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.audios"
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$ref": "request.model"
                                }
                              }
                            },
                            "seedance2.5-a"
                          ]
                        },
                        "then": 10,
                        "else": 3
                      }
                    }
                  ]
                },
                "else": true
              }
            },
            "message": "Drama API：参考素材数量超过该模型上限"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$or": [
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.0-a"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$trim": {
                              "$ref": "request.model"
                            }
                          }
                        },
                        "seedance2.5-a"
                      ]
                    }
                  ]
                },
                "then": {
                  "$lte": [
                    {
                      "$add": [
                        {
                          "$len": {
                            "$ref": "request.images"
                          }
                        },
                        {
                          "$len": {
                            "$ref": "request.videos"
                          }
                        },
                        {
                          "$len": {
                            "$ref": "request.audios"
                          }
                        }
                      ]
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$lower": {
                                "$trim": {
                                  "$ref": "request.model"
                                }
                              }
                            },
                            "seedance2.5-a"
                          ]
                        },
                        "then": 50,
                        "else": 12
                      }
                    }
                  ]
                },
                "else": true
              }
            },
            "message": "Drama API：参考素材总数超过该模型上限"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/videos",
          "contentType": "application/json",
          "body": {
            "model": {
              "$trim": {
                "$ref": "request.model"
              }
            },
            "prompt": {
              "$trim": {
                "$ref": "request.prompt"
              }
            },
            "seconds": {
              "$ref": "request.duration"
            },
            "aspect_ratio": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$lower": {
                        "$trim": {
                          "$ref": "request.aspectRatio"
                        }
                      }
                    },
                    "auto"
                  ]
                },
                "then": "Auto",
                "else": {
                  "$trim": {
                    "$ref": "request.aspectRatio"
                  }
                }
              }
            },
            "resolution": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$lower": {
                        "$trim": {
                          "$ref": "request.resolution"
                        }
                      }
                    },
                    "4k"
                  ]
                },
                "then": "4K",
                "else": {
                  "$lower": {
                    "$trim": {
                      "$ref": "request.resolution"
                    }
                  }
                }
              }
            },
            "references": {
              "$omitEmpty": {
                "$concatArrays": [
                  {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.images"
                        }
                      },
                      "as": "media",
                      "in": {
                        "type": "image",
                        "role": {
                          "$if": {
                            "condition": {
                              "$in": [
                                {
                                  "$ref": "media.role"
                                },
                                [
                                  "first_frame",
                                  "last_frame"
                                ]
                              ]
                            },
                            "then": {
                              "$ref": "media.role"
                            },
                            "else": "reference"
                          }
                        },
                        "source": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  },
                  {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.videos"
                        }
                      },
                      "as": "media",
                      "in": {
                        "type": "video",
                        "role": "reference",
                        "source": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  },
                  {
                    "$map": {
                      "from": {
                        "$sortByOrder": {
                          "$ref": "request.audios"
                        }
                      },
                      "as": "media",
                      "in": {
                        "type": "audio",
                        "role": "reference",
                        "source": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/videos/{{taskId}}"
        },
        "result": {
          "method": "GET",
          "path": "/v1/videos/{{taskId}}/content",
          "headers": {
            "Accept": "video/*"
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$switch": {
              "cases": [
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "completed"
                    ]
                  },
                  "then": "succeeded"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "failed"
                    ]
                  },
                  "then": "failed"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "in_progress"
                    ]
                  },
                  "then": "processing"
                }
              ],
              "default": "pending"
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.error"
              }
            ]
          },
          "errorPaths": [
            "error.code",
            "code"
          ],
          "usage": {
            "$ref": "response.usage"
          }
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
