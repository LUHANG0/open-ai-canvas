# 夜总会接口说明

## 安装与配置

插件 ID 为 `yezonghui`，三个 Provider ID 为 `yezonghui-chat`、`yezonghui-image`、`yezonghui-video`。默认 Base URL 为 `https://new.yezonghui.org`。渠道配置 `apiKey`，宿主在创建、查询与下载时发送 `Authorization: Bearer <API_KEY>`；不要把密钥写进 URL、提示词或插件清单。

源码目录与 `yezonghui.yingce-plugin` 分发包包含同一份清单和文档。仓库自带插件由后端启动时加载；已运行的部署需要重新加载插件运行时或重启后端后才会看到新包。也可以通过现有插件上传入口安装分发包。宿主需要支持 Provider 的 `streamingFormat` 和 `polling` 声明；旧宿主不能保证相应流式与轮询策略生效。

模型列表以该 API Key 调用 `GET /v1/models` 的结果为准；`supported_endpoint_types` 只是能力提示，不能据此区分图片模型是否开通异步分组。管理员需确认当前模型的固定价、异步渠道、允许比例与分辨率。分辨率没有通用默认值；不得把示例值当全部模型的白名单。图片在模型参数中配置 `size`（映射比例）、`imageResolution`（必填分辨率）、`count`（固定 1）；视频在能力卡配置实际允许的比例、分辨率、时长与素材数量。默认关闭视频、音频参考输入，确认模型支持后配置对应上限。

## 聊天 yezonghui-chat

`POST /v1/chat/completions`，JSON。`model` 原样使用渠道模型 ID，`messages` 由宿主统一消息合同构造，保留系统指令与历史。`providerOptions.yezonghui-chat` 支持 `temperature`、`top_p`、`max_tokens`、`response_format`；任务的输出 Token 上限优先。普通文本响应读取 `choices[0].message.content`，推理读取 `reasoning_content`，用量读取 `usage`。

`streamingFormat: chat-completion` 声明宿主使用标准 Chat Completions SSE 解析器，普通文本与 Agent 都可逐段输出；流关闭时走 JSON，流请求返回 JSON 时由现有宿主解析，网络失败不通过重放请求降级。Agent 请求保留工具定义、工具选择和工具历史，响应读取 `choices[0].message.tool_calls` 的 `id`、`function.name`、`function.arguments`。

公开服务商文档未给出聊天与工具调用合同，此部分是明确的 OpenAI 兼容接入假设，需要真实模型验收。插件合同测试或本地模拟 SSE 通过不表示远端聊天已验收。

## 异步图片 yezonghui-image

创建 `POST /v1/images`，查询 `GET /v1/images/{id}`，下载 `GET /v1/images/{id}/content`。创建只发送以下五种字段，未填参考图时省略 `image_urls`：

| 统一字段 | 上游字段 | 规则 |
| --- | --- | --- |
| `model` | `model` | 必填，实际开放的模型 ID |
| `prompt` | `prompt` | 必填，去首尾空白后非空 |
| `aspectRatio` | `ratio` | 可选，必须为正整数比例，例如 `1:1`；按当前分组填写 |
| `resolution` | `resolution` | 必填，拒绝空值和 `auto`，保留模型档位拼写 |
| `images` | `image_urls` | 按 `order` 排序的公网 HTTP(S) URL 数组 |
| `imageCount` | 不发送 | 未指定或 1；大于 1 拒绝，一次任务固定一张 |

不发送 `n`、`size`、`quality`、`response_format`、`output_format`、`metadata`、`seconds` 等额外字段。拒绝蒙版、参考视频和参考音频。禁止把像素尺寸当作比例发送。

```json
{"model":"实际图片模型 ID","prompt":"窗台上的猫","ratio":"1:1","resolution":"1080p"}
```

## 视频 yezonghui-video

创建 `POST /v1/videos`，JSON；查询 `GET /v1/videos/{id}`；下载 `GET /v1/videos/{id}/content`。不用旧 `/v1/video/generations` 路径，不上传 multipart 文件。

| 统一字段 | 上游字段 | 规则 |
| --- | --- | --- |
| `model` | `model` | 必填，实际开放的模型 ID |
| `prompt` | `prompt` | 必填，可使用 `@图片1`、`@视频1`、`@音频1` 引用 |
| `duration` | `seconds` | 必须明确指定 1～3600 整数秒，转字符串；模型范围由渠道能力进一步收窄 |
| `aspectRatio` | `size` | 正整数画幅比例；不能是像素尺寸、分辨率或 auto |
| `resolution` | `resolution` | 必填且非 auto，转小写；不发送 resolution_name |
| `images` | `image_urls` | 按 order 排序的公网参考图片 URL 数组 |
| `videos` | `video_urls` | 按 order 排序的公网参考视频 URL 数组 |
| `audios` | `audio_urls` | 按 order 排序的公网参考音频 URL 数组；模型须支持 |
| `generateAudio` | `audio` | JSON 布尔值；不发送 generate_audio |
| `providerOptions` | 五个白名单扩展字段 | 只读取 yezonghui-video 命名空间 |

可选扩展为 `providerOptions.yezonghui-video.negative_prompt`（string）、`seed`（JSON integer）、`fps`（JSON integer）、`camera_fixed`（boolean）、`metadata`（object）；使用者必须按类型传入，不进行字符串到布尔的猜测转换。厂商专用字段放进 `metadata`，不透传任意顶层 JSON。`watermark` 无独立顶层映射。单次只创建一个任务，不发送 `n`。

```json
{"model":"实际视频模型 ID","prompt":"@图片1 缓慢转身","seconds":"10","size":"16:9","resolution":"1080p","image_urls":["https://example.com/reference.png"],"audio":false}
```

素材编号分别对应各类型按 order 排序后的数组。不得将角色标签自动当作上游首尾帧保证；需要特定首尾帧能力时，以模型实际合同为准。

## 响应、下载和错误

创建成功只代表已受理：保存顶层 `id`，读取顶层 `status`，不能把 HTTP 200 当生成完成。`queued`、`in_progress`、`unknown` 以及未来未识别状态继续查询；只有 `completed` 进入结果下载，`failed` 结束并显示 `error.message`。不读取旧式 data 信封中的状态，也不依赖兼容字段 `task_id`。

完成响应即使带 `url`，插件也始终使用同账号 Bearer 鉴权的 `/content` 下载；返回二进制类型以 Content-Type 为准，由现有宿主进行资源保存。未声明远端取消或删除接口，不自动删除上游任务。

错误同时兼容 `{ "error": { "code": "...", "message": "..." } }` 和 `{ "code": "invalid_resolution", "message": "...", "data": null }`。HTTP 400、401、403、404 等保留真实失败语义，不自动更换模型、分组、比例或分辨率。已受理任务的失败不等同于提交阶段错误。

图片轮询间隔 15 秒，视频 60 秒，首次查询也等待相同间隔；查询遇到临时网络错误、429 或 5xx 最多连续重试三次，退避受宿主控制，始终查询原任务 ID，不重放创建。整个任务的超时继续服从宿主运行时策略：建议图片至少 10 分钟，视频至少 30 分钟。下载重试和已有任务恢复沿用宿主机制。创建不是幂等接口，不声明或伪造上游幂等保证。

## 构建和验证边界

只重新嵌入本插件文档：`node plugin-packages/embed-documentation.mjs yezonghui`。从本目录将 `manifest.json`、`README.md` 和 `docs/interface.md` 打包为 ZIP，扩展名使用 `.yingce-plugin`。不要运行全目录构建覆盖其他人的插件包。

专项测试覆盖真实分发包的请求映射、禁止字段、参数拒绝、状态机、两种错误外壳、鉴权下载，以及本地模拟服务器的创建、查询重试、下载和聊天流式工具调用。尚需用实际 API Key 验证模型列表、远端聊天、文生图/参考图、文生视频/多素材及画布资源持久化；这些调用可能计费，应由用户配置渠道后按实际范围验收。

服务商依据：[视频 / 图片异步生成 API 对接规范](https://new.yezonghui.org/docs)。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "yezonghui",
  "name": "夜总会",
  "version": "1.0.0",
  "author": "影策",
  "description": "夜总会独立协议：聊天、异步生图和视频，按服务商合同提交、轮询和鉴权下载。",
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "API Key",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "yezonghui-chat",
        "label": "夜总会聊天",
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
        "baseUrl": "https://new.yezonghui.org",
        "streamingFormat": "chat-completion",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "实际开放的聊天模型 ID。"
          },
          {
            "name": "messages",
            "type": "message[]",
            "required": true,
            "mapping": "messages",
            "description": "宿主统一消息，包含系统指令和历史。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "temperature / top_p / max_tokens / response_format",
            "description": "仅 yezonghui-chat 命名空间的标准聊天选项。"
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
                "$ref": "request.providerOptions.yezonghui-chat.temperature"
              }
            },
            "top_p": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.yezonghui-chat.top_p"
              }
            },
            "response_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.yezonghui-chat.response_format"
              }
            },
            "max_tokens": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.extra.max_tokens"
                  },
                  {
                    "$ref": "request.providerOptions.yezonghui-chat.max_tokens"
                  }
                ]
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
            "choices.0.message.content"
          ],
          "reasoningPaths": [
            "choices.0.message.reasoning_content"
          ],
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
          ]
        },
        "agentResponse": {
          "textPaths": [
            "choices.0.message.content"
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
        }
      },
      {
        "id": "yezonghui-image",
        "label": "夜总会异步生图",
        "capabilities": [
          "image"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://new.yezonghui.org",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "令牌所属分组实际开放的图片模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "图片生成或参考图编辑提示词。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画幅比例，按模型与分组配置。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": true,
            "mapping": "resolution",
            "description": "必填分辨率档位，不接受 auto。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image_urls",
            "description": "公网参考图 URL，按 order 排序。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "required": false,
            "mapping": "fixed one; omitted upstream",
            "description": "一次固定一张，不发送 n。"
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
            "message": "夜总会：必须填写实际开通的模型 ID"
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
            "message": "夜总会：提示词不能为空"
          },
          {
            "assert": {
              "$not": {
                "$in": [
                  {
                    "$lower": {
                      "$trim": {
                        "$ref": "request.resolution"
                      }
                    }
                  },
                  [
                    "",
                    "auto"
                  ]
                ]
              }
            },
            "message": "夜总会：必须明确填写该模型允许的 resolution，不能使用 auto"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$ref": "request.imageCount"
                },
                1
              ]
            },
            "message": "夜总会异步生图：一次任务只生成一张图片"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                0
              ]
            },
            "message": "夜总会异步生图不支持参考视频"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.audios"
                  }
                },
                0
              ]
            },
            "message": "夜总会异步生图不支持参考音频"
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
            "message": "夜总会异步生图不支持蒙版编辑"
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
                            "$in": [
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
                              [
                                "https",
                                "http"
                              ]
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
            "message": "夜总会：参考图必须是公网 HTTP(S) 直链，不能使用 Base64 或本地路径"
          },
          {
            "assert": {
              "$ne": [
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
            "message": "夜总会：ratio 不能使用 auto，请选择模型允许的画幅"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$trim": {
                        "$ref": "request.aspectRatio"
                      }
                    },
                    ""
                  ]
                },
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$split": [
                              {
                                "$trim": {
                                  "$ref": "request.aspectRatio"
                                }
                              },
                              ":"
                            ]
                          }
                        },
                        2
                      ]
                    },
                    {
                      "$gt": [
                        {
                          "$toInt": {
                            "$at": [
                              {
                                "$split": [
                                  {
                                    "$trim": {
                                      "$ref": "request.aspectRatio"
                                    }
                                  },
                                  ":"
                                ]
                              },
                              0
                            ]
                          }
                        },
                        0
                      ]
                    },
                    {
                      "$gt": [
                        {
                          "$toInt": {
                            "$at": [
                              {
                                "$split": [
                                  {
                                    "$trim": {
                                      "$ref": "request.aspectRatio"
                                    }
                                  },
                                  ":"
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
              ]
            },
            "message": "夜总会：画幅必须使用 16:9 这样的比例，不能填写像素尺寸或分辨率"
          }
        ],
        "polling": {
          "intervalSeconds": 15,
          "transientRetryLimit": 3
        },
        "create": {
          "method": "POST",
          "path": "/v1/images",
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
            "ratio": {
              "$omitEmpty": {
                "$trim": {
                  "$ref": "request.aspectRatio"
                }
              }
            },
            "resolution": {
              "$trim": {
                "$ref": "request.resolution"
              }
            },
            "image_urls": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$sortByOrder": {
                      "$ref": "request.images"
                    }
                  },
                  "as": "media",
                  "in": {
                    "$ref": "media.value"
                  }
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/images/{{taskId}}"
        },
        "result": {
          "method": "GET",
          "path": "/v1/images/{{taskId}}/content",
          "headers": {
            "Accept": "image/*"
          }
        },
        "response": {
          "taskId": {
            "$ref": "response.id"
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
        },
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅比例",
            "type": "string",
            "binding": "aspectRatio",
            "encoding": "ratio",
            "pricing": true,
            "description": "按当前模型和分组配置可用比例。"
          },
          {
            "name": "imageResolution",
            "label": "分辨率",
            "type": "string",
            "binding": "resolution",
            "required": true,
            "pricing": true,
            "description": "填写模型允许的档位，不能使用 auto。"
          },
          {
            "name": "count",
            "label": "生成数量",
            "type": "integer",
            "binding": "imageCount",
            "min": 1,
            "max": 1,
            "step": 1,
            "default": 1
          }
        ]
      },
      {
        "id": "yezonghui-video",
        "label": "夜总会视频",
        "capabilities": [
          "video"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://new.yezonghui.org",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "令牌所属分组实际开放的视频模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "提示词可按数组顺序用 @图片1、@视频1、@音频1 引用。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": true,
            "mapping": "seconds",
            "description": "明确指定 1～3600 整数秒，并受模型能力约束。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "size",
            "description": "画幅比例，例如 16:9；不是像素尺寸。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": true,
            "mapping": "resolution",
            "description": "模型允许的分辨率档位，转小写发送。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "image_urls",
            "description": "按 order 排序的公网参考图。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "video_urls",
            "description": "按 order 排序的公网参考视频。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "audio_urls",
            "description": "按 order 排序的公网参考音频；仅上游支持时生效。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "audio",
            "description": "是否生成声音，不能发送 generate_audio。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "negative_prompt / seed / fps / camera_fixed / metadata",
            "description": "只读取 yezonghui-video 命名空间的五个已声明扩展字段。"
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
            "message": "夜总会：必须填写实际开通的模型 ID"
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
            "message": "夜总会：提示词不能为空"
          },
          {
            "assert": {
              "$not": {
                "$in": [
                  {
                    "$lower": {
                      "$trim": {
                        "$ref": "request.resolution"
                      }
                    }
                  },
                  [
                    "",
                    "auto"
                  ]
                ]
              }
            },
            "message": "夜总会：必须明确填写该模型允许的 resolution，不能使用 auto"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
                    {
                      "$ref": "request.duration"
                    },
                    1
                  ]
                },
                {
                  "$lte": [
                    {
                      "$ref": "request.duration"
                    },
                    3600
                  ]
                }
              ]
            },
            "message": "夜总会：视频时长必须为 1～3600 的整数秒，并符合模型限制"
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
                            "$in": [
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
                              [
                                "https",
                                "http"
                              ]
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
            "message": "夜总会：所有参考素材必须使用公网 HTTP(S) 直链"
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
                            "$in": [
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
                              [
                                "https",
                                "http"
                              ]
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
            "message": "夜总会：所有参考素材必须使用公网 HTTP(S) 直链"
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
                            "$in": [
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
                              [
                                "https",
                                "http"
                              ]
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
            "message": "夜总会：所有参考素材必须使用公网 HTTP(S) 直链"
          },
          {
            "assert": {
              "$ne": [
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
            "message": "夜总会：size 不能使用 auto，请选择模型允许的画幅"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$trim": {
                        "$ref": "request.aspectRatio"
                      }
                    },
                    ""
                  ]
                },
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$split": [
                              {
                                "$trim": {
                                  "$ref": "request.aspectRatio"
                                }
                              },
                              ":"
                            ]
                          }
                        },
                        2
                      ]
                    },
                    {
                      "$gt": [
                        {
                          "$toInt": {
                            "$at": [
                              {
                                "$split": [
                                  {
                                    "$trim": {
                                      "$ref": "request.aspectRatio"
                                    }
                                  },
                                  ":"
                                ]
                              },
                              0
                            ]
                          }
                        },
                        0
                      ]
                    },
                    {
                      "$gt": [
                        {
                          "$toInt": {
                            "$at": [
                              {
                                "$split": [
                                  {
                                    "$trim": {
                                      "$ref": "request.aspectRatio"
                                    }
                                  },
                                  ":"
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
              ]
            },
            "message": "夜总会：画幅必须使用 16:9 这样的比例，不能填写像素尺寸或分辨率"
          }
        ],
        "polling": {
          "intervalSeconds": 60,
          "transientRetryLimit": 3
        },
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
              "$toString": {
                "$ref": "request.duration"
              }
            },
            "size": {
              "$omitEmpty": {
                "$trim": {
                  "$ref": "request.aspectRatio"
                }
              }
            },
            "resolution": {
              "$lower": {
                "$trim": {
                  "$ref": "request.resolution"
                }
              }
            },
            "image_urls": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$sortByOrder": {
                      "$ref": "request.images"
                    }
                  },
                  "as": "media",
                  "in": {
                    "$ref": "media.value"
                  }
                }
              }
            },
            "video_urls": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$sortByOrder": {
                      "$ref": "request.videos"
                    }
                  },
                  "as": "media",
                  "in": {
                    "$ref": "media.value"
                  }
                }
              }
            },
            "audio_urls": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$sortByOrder": {
                      "$ref": "request.audios"
                    }
                  },
                  "as": "media",
                  "in": {
                    "$ref": "media.value"
                  }
                }
              }
            },
            "audio": {
              "$ref": "request.generateAudio"
            },
            "negative_prompt": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.yezonghui-video.negative_prompt"
              }
            },
            "seed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.yezonghui-video.seed"
              }
            },
            "fps": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.yezonghui-video.fps"
              }
            },
            "camera_fixed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.yezonghui-video.camera_fixed"
              }
            },
            "metadata": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.yezonghui-video.metadata"
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
            "$ref": "response.id"
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
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
