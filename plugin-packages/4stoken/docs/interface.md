# 4SToken 接口说明

## 身份、安装与模型

插件 ID `4stoken`，默认 Base URL `https://api.4stoken.cn`，配置字段 `apiKey` 为 Client Key。所有创建、查询由宿主后端使用 `Authorization: Bearer <Client Key>`；不要将密钥写入 URL、提示词、源码或清单。服务启动会发现仓库的 `4stoken.yingce-plugin` 分发包，也可从插件上传入口安装。旧宿主不一定支持本包的流式和轮询声明，需配套当前源码。

模型列表读取 `GET /v1/models`，model 填 Portal 发布并由当前令牌实际开放的 modelCode。可用协议、比例、尺寸、分辨率、时长、素材数量及声音等以模型线路配置为准。本插件不内置模型名或价格白名单，不更换模型、分组或档位重试。

## 文本协议

| Provider | 路径 | 请求 / 响应 |
| --- | --- | --- |
| `4stoken-chat` | `/v1/chat/completions` | messages / choices |
| `4stoken-responses` | `/v1/responses` | input、instructions / output |
| `4stoken-claude` | `/v1/messages` | messages、system、max_tokens / content |

三个协议都使用 JSON 和 Bearer 鉴权，分别声明 `streamingFormat`，复用宿主的对应 SSE 解析器和 Agent 工具循环。普通文本保留系统指令、历史和受模型允许的多模态输入；Agent 保留工具定义、工具选择、函数调用 ID 和参数。不要用聊天 chunk 解析 Responses 的语义事件。

`model` 为当前线路模型，`messages` 是宿主消息合同，`providerOptions` 只读取对应 Provider ID 的命名空间。Chat 可选 temperature、top_p、max_tokens、stop、frequency_penalty、presence_penalty、tools、tool_choice、response_format、thinking、service_tier；Responses 可选 temperature、top_p、max_output_tokens、tools、previous_response_id。宿主输出 Token 上限优先于插件默认值。Claude 普通请求 max_tokens 缺省 4096，Agent 走宿主的输出限制与工具请求。流式开关由宿主控制，不允许通过扩展参数强行把同步响应变成 SSE。

最终文本、推理与 usage 使用各自协议响应映射。工具能力、推理、多模态等必须由模型线路支持，不因为入口兼容就假定可用。

## Gateway 图片任务 4stoken-image

文生图：`POST /v1/images/generations`，JSON。存在非蒙版参考图时切换 `POST /v1/images/edits`，multipart；参考图按 order 排序，重复 `image` 文件字段，蒙版使用一个 `mask` 文件字段。蒙版必须有源图，不接收视频或音频参考。

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| model | model | 当前图片模型编码，必填 |
| prompt | prompt | 非空生成 / 编辑提示词 |
| aspectRatio | size | 比例或像素尺寸，影响网关计费档位 |
| imageCount | n | 输出数量，未指定为 1，受模型配置限制 |
| images | image / mask | 编辑时作为 multipart 文件发送 |
| providerOptions | background / output_format / style | 白名单可选项；style 只在文生图发送 |

`async=true` 固定异步提交，不配置回调。模型图片参数为 size、count，可选透明背景与 outputFormat；不声明独立 resolution，也不发送通用 quality、response_format、output_compression 等字段。官转渠道自定义 quality 可能进入企业分组按 Token 计费，本插件不自动添加该参数。

`providerOptions.4stoken-image` 可明确设置 background、output_format、style；动态图片参数启用时，优先通过模型参数合同传递。创建保存 task_id，兼容 taskId；查询 `GET /v1/images/tasks/{taskId}`，间隔 10 秒，临时错误最多连续重试 3 次。正常读取顶层 data 数组，兼容服务商明确声明的旧版 result.data。同步结果若直接包含图片且未给 status，可直接消费；异步 pending/running 不得因已有 task_id 当作成功。

## Seedream 原生图片 4stoken-seedream

使用 `POST /api/v3/images/generations`，JSON，同步非流式；只用于实际开放该原生线路的模型。

model、prompt 必填；aspectRatio 映射 size，必须配置模型允许的 2K / 3K / 4K 等档位或像素尺寸，不能将比例字符串直接当原生尺寸。images 按 order 发送 image 数组，支持 URL 或 Base64；最多 14 张参考图。imageCount 大于 1 时发送 sequential_image_generation=auto 与 sequential_image_generation_options.max_images，否则为 disabled；参考图与输出数合计不能超过 15。

固定 stream=false、response_format=url，立即下载返回的临时链接。providerOptions.4stoken-seedream 白名单为 tools、output_format、watermark、optimize_prompt_options、guidance_scale；只按模型能力配置，不注入未经声明的字段。watermark 默认 true，明确设置 false 时保留；不支持蒙版。组图可能部分失败，宿主消费实际返回的成功媒体；空结果保持失败语义，不制造占位图。

## Gateway 视频任务 4stoken-video

创建 `POST /v1/videos`，JSON；查询 `GET /v1/videos/{taskId}`。这不是 Sora multipart，也不使用 NewAPI 的 `/v1/video/generations`，不能混用请求与响应。

| 统一字段 | 上游字段 | 说明 |
| --- | --- | --- |
| model | model | 当前视频 modelCode，必填 |
| prompt | prompt / content[].text | 提示词非空 |
| images | image_url(s) / start_image_url + end_image_url / content | 根据素材角色选择一种写法 |
| videos | content[].video_url | 带 reference_video 角色 |
| audios | content[].audio_url | 带 reference_audio 角色 |
| duration | duration | 正整数秒，受模型能力限制 |
| aspectRatio | aspect_ratio | 画幅比例，不映射为分辨率 size |
| resolution | resolution | 分辨率档位，空值和 auto 不发送 |
| generateAudio | generate_audio | JSON 布尔值，按模型能力支持 |
| watermark | watermark | JSON 布尔值，默认能力开启水印 |
| providerOptions | seed | 只读取 4stoken-video.seed 整数 |

普通单图发送 image_url，多图发送按 order 排序的 image_urls。单张 first_frame 按单图图生视频处理。明确的 first_frame / last_frame 成对发送 start_image_url / end_image_url，不可混入普通图片、参考视频或音频；单独尾帧和重复帧角色会拒绝。有视频或音频参考时使用文档支持的 content 内容块，包含文本和按类型、order 排序的素材，图片角色为 reference_image。

视频参考必须为公网 HTTP(S) URL，不接受本地文件、Base64、asset://；资源库、草稿样片、升档及 duration=-1 编辑流程不属于该 Provider。参考时长、数量、音频和画幅限制由实际模型能力配置；不要将某个 4SDance 示例的上限推广到其他模型。轮询间隔 15 秒，临时错误最多连续重试 3 次；这是客户端采用的本地策略，不是服务商限流保证。

## 响应、错误与结果保存

Gateway 图片和视频任务保存本地 task_id，兼容 taskId，不用上游任务 ID 替换查询 ID。pending 等待、running 处理中、succeeded 成功、failed 失败、canceled / cancelled 终止；未知状态按未完成继续查询，受宿主截止时间限制。失败消息兼容 error.message 与 error 字符串。

图片从 data[].url 下载，兼容旧 result.data 和 b64_json；视频读取 data[].video_url 或 data[].url。没有 result 下载端点，不推测 `/content`。链接临时有效，由宿主立即下载保存；下载失败保持原任务与真实错误，不重建收费任务。已有异步图片或视频任务超时恢复时查询原 ID。

HTTP 400 参数/线路错误、401 密钥无效、402 配额或消费限额超限、404 任务缺失均保持失败语义。创建不自动重放，不声明上游幂等保证，不改变分组或规格消除错误。暂时性轮询错误的有限重试只读取原任务。

## 构建与验证

`node plugin-packages/embed-documentation.mjs 4stoken` 只更新本包文档。将本目录的 manifest.json、README.md、docs/interface.md 打包为 ZIP，扩展名使用 `.yingce-plugin`。分发包必须与源码一致。

本地专项覆盖白名单映射、动态 JSON / multipart、重复文件字段、状态机、旧图片结果外壳、媒体 URL 下载、首尾帧混用拒绝、异步恢复及三种文本 SSE。模拟服务通过不代表远端模型、账务、真实工具能力或画布持久化验收通过。本次不携带真实密钥、不创建远端收费任务。

## 服务商依据

- [Chat Completions](https://www.4stoken.cn/docs/reference/chat-completions)
- [Responses](https://www.4stoken.cn/docs/reference/responses)
- [Claude Messages](https://www.4stoken.cn/docs/reference/anthropic-messages)
- [图片生成](https://www.4stoken.cn/docs/reference/image-generations)、[图片编辑](https://www.4stoken.cn/docs/reference/image-edits)、[图片任务](https://www.4stoken.cn/docs/reference/image-task)
- [Seedream 原生图片](https://www.4stoken.cn/docs/reference/seedream-image-generations)
- [Gateway 视频创建](https://www.4stoken.cn/docs/reference/video-generations)、[Gateway 视频查询](https://www.4stoken.cn/docs/reference/video-task)

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "4stoken",
  "name": "4SToken",
  "version": "1.0.0",
  "author": "梦层 MengCeng",
  "description": "4SToken 独立协议：三种聊天协议、Gateway 图片任务、Seedream 原生图片和视频任务。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "Client Key",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "4stoken-chat",
        "label": "4SToken 聊天",
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
        "baseUrl": "https://api.4stoken.cn",
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
                "$ref": "request.providerOptions.4stoken-chat.temperature"
              }
            },
            "top_p": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.top_p"
              }
            },
            "max_tokens": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.extra.max_tokens"
                  },
                  {
                    "$ref": "request.providerOptions.4stoken-chat.max_tokens"
                  }
                ]
              }
            },
            "tools": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.tools"
              }
            },
            "tool_choice": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.tool_choice"
              }
            },
            "response_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.response_format"
              }
            },
            "stop": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.stop"
              }
            },
            "frequency_penalty": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.frequency_penalty"
              }
            },
            "presence_penalty": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.presence_penalty"
              }
            },
            "thinking": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.thinking"
              }
            },
            "service_tier": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-chat.service_tier"
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
        "id": "4stoken-responses",
        "label": "4SToken Responses",
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
        "baseUrl": "https://api.4stoken.cn",
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
            "mapping": "input",
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
          "path": "/v1/responses",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "input": {
              "$map": {
                "from": {
                  "$filter": {
                    "from": {
                      "$ref": "request.messages"
                    },
                    "as": "message",
                    "where": {
                      "$ne": [
                        {
                          "$ref": "message.role"
                        },
                        "system"
                      ]
                    }
                  }
                },
                "as": "message",
                "in": {
                  "$merge": [
                    {
                      "$ref": "message"
                    },
                    {
                      "content": {
                        "$if": {
                          "condition": {
                            "$ref": "message.content.0.type"
                          },
                          "then": {
                            "$map": {
                              "from": {
                                "$ref": "message.content"
                              },
                              "as": "part",
                              "in": {
                                "$switch": {
                                  "cases": [
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$ref": "part.type"
                                          },
                                          "text"
                                        ]
                                      },
                                      "then": {
                                        "type": "input_text",
                                        "text": {
                                          "$ref": "part.text"
                                        }
                                      }
                                    },
                                    {
                                      "when": {
                                        "$eq": [
                                          {
                                            "$ref": "part.type"
                                          },
                                          "image_url"
                                        ]
                                      },
                                      "then": {
                                        "type": "input_image",
                                        "image_url": {
                                          "$ref": "part.image_url.url"
                                        }
                                      }
                                    }
                                  ],
                                  "default": {
                                    "$ref": "part"
                                  }
                                }
                              }
                            }
                          },
                          "else": {
                            "$ref": "message.content"
                          }
                        }
                      }
                    }
                  ]
                }
              }
            },
            "instructions": {
              "$omitEmpty": {
                "$ref": "request.instructions"
              }
            },
            "temperature": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-responses.temperature"
              }
            },
            "top_p": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-responses.top_p"
              }
            },
            "max_output_tokens": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.extra.max_output_tokens"
                  },
                  {
                    "$ref": "request.providerOptions.4stoken-responses.max_output_tokens"
                  }
                ]
              }
            },
            "tools": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-responses.tools"
              }
            },
            "previous_response_id": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-responses.previous_response_id"
              }
            }
          }
        },
        "agent": {
          "method": "POST",
          "path": "/v1/responses",
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "$ref": "request.extra.agent.responses"
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
            "output_text"
          ],
          "reasoningPaths": [
            "reasoning.summary.0.text"
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
            "output_text"
          ],
          "reasoningPaths": [
            "reasoning.summary.0.text"
          ],
          "toolCallsPath": "output",
          "toolCallIdPaths": [
            "call_id",
            "id"
          ],
          "toolCallNamePaths": [
            "name"
          ],
          "toolCallArgumentsPaths": [
            "arguments"
          ]
        },
        "streamingFormat": "responses"
      },
      {
        "id": "4stoken-claude",
        "label": "4SToken Claude",
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
        "baseUrl": "https://api.4stoken.cn",
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
          "path": "/v1/messages",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "max_tokens": {
              "$coalesce": [
                {
                  "$ref": "request.extra.max_tokens"
                },
                {
                  "$ref": "request.providerOptions.4stoken-claude.max_tokens"
                },
                4096
              ]
            },
            "system": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.instructions"
                  },
                  {
                    "$ref": "request.providerOptions.4stoken-claude.system"
                  }
                ]
              }
            },
            "messages": {
              "$filter": {
                "from": {
                  "$ref": "request.messages"
                },
                "as": "message",
                "where": {
                  "$ne": [
                    {
                      "$ref": "message.role"
                    },
                    "system"
                  ]
                }
              }
            }
          },
          "headers": {
            "anthropic-version": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.4stoken-claude.anthropic-version"
                },
                "2023-06-01"
              ]
            },
            "anthropic-beta": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-claude.anthropic-beta"
              }
            }
          }
        },
        "agent": {
          "method": "POST",
          "path": "/v1/messages",
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "$ref": "request.extra.agent.claude"
              },
              {
                "model": {
                  "$ref": "request.model"
                }
              }
            ]
          },
          "headers": {
            "anthropic-version": "2023-06-01"
          }
        },
        "response": {
          "status": "succeeded",
          "text": {
            "$map": {
              "from": {
                "$filter": {
                  "from": {
                    "$ref": "response.content"
                  },
                  "as": "part",
                  "where": {
                    "$eq": [
                      {
                        "$ref": "part.type"
                      },
                      "text"
                    ]
                  }
                }
              },
              "as": "part",
              "in": {
                "$ref": "part.text"
              }
            }
          },
          "reasoning": {
            "$map": {
              "from": {
                "$filter": {
                  "from": {
                    "$ref": "response.content"
                  },
                  "as": "part",
                  "where": {
                    "$eq": [
                      {
                        "$ref": "part.type"
                      },
                      "thinking"
                    ]
                  }
                }
              },
              "as": "part",
              "in": {
                "$ref": "part.thinking"
              }
            }
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.type"
          ],
          "messagePaths": [
            "error.message"
          ]
        },
        "agentResponse": {
          "textPaths": [
            "content.0.text"
          ],
          "reasoningPaths": [
            "content.0.thinking"
          ],
          "toolCallsPath": "content",
          "toolCallIdPaths": [
            "id"
          ],
          "toolCallNamePaths": [
            "name"
          ],
          "toolCallArgumentsPaths": [
            "input"
          ]
        },
        "streamingFormat": "claude-api"
      },
      {
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.4stoken.cn",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "id": "4stoken-image",
        "label": "4SToken 图片任务",
        "capabilities": [
          "image"
        ],
        "requiresPublicMediaUrls": false,
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "model",
            "description": "当前令牌实际可用的图片编码。",
            "required": true
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "prompt",
            "description": "图片生成或编辑提示词。",
            "required": true
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "mapping": "size",
            "description": "比例或像素尺寸，影响计费档位。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "mapping": "n",
            "description": "生成张数，由模型能力收窄。"
          },
          {
            "name": "images",
            "type": "media[]",
            "mapping": "image / mask multipart files",
            "description": "有源图片时切换 edits，重复 image 上传。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "background / output_format / style",
            "description": "白名单可选参数；默认不发送 quality。"
          }
        ],
        "imageParameters": [
          {
            "name": "size",
            "label": "尺寸 / 比例",
            "type": "string",
            "binding": "aspectRatio",
            "encoding": "pixels",
            "pricing": true
          },
          {
            "name": "count",
            "label": "生成数量",
            "type": "integer",
            "binding": "imageCount",
            "min": 1,
            "max": 100,
            "step": 1,
            "default": 1
          },
          {
            "name": "transparentBackground",
            "label": "透明背景",
            "type": "boolean",
            "binding": "transparentBackground",
            "default": false,
            "enabled": false
          },
          {
            "name": "outputFormat",
            "label": "输出格式",
            "type": "string",
            "binding": "providerOptions.4stoken-image.output_format",
            "values": [
              "png",
              "jpeg",
              "webp"
            ],
            "enabled": false
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
            "message": "4SToken：请填写实际可用的 modelCode"
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
            "message": "4SToken：提示词不能为空"
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
            "message": "4SToken 图片不接收视频或音频参考"
          },
          {
            "assert": {
              "$lte": [
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
                1
              ]
            },
            "message": "4SToken：一次编辑最多一个蒙版"
          },
          {
            "assert": {
              "$or": [
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
                              "mask"
                            ]
                          }
                        }
                      }
                    },
                    0
                  ]
                },
                {
                  "$gt": [
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
                            "$ne": [
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
                }
              ]
            },
            "message": "4SToken：蒙版必须同时提供源图片"
          }
        ],
        "polling": {
          "intervalSeconds": 10,
          "transientRetryLimit": 3
        },
        "create": {
          "method": "POST",
          "path": "/v1/images/generations",
          "pathTemplate": {
            "$if": {
              "condition": {
                "$gt": [
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
                          "$ne": [
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
              "then": "/v1/images/edits",
              "else": "/v1/images/generations"
            }
          },
          "contentType": "application/json",
          "contentTypeTemplate": {
            "$if": {
              "condition": {
                "$gt": [
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
                          "$ne": [
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
              "then": "multipart/form-data",
              "else": "application/json"
            }
          },
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
                    "$not": {
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
                    }
                  },
                  "then": {
                    "$trim": {
                      "$ref": "request.aspectRatio"
                    }
                  },
                  "else": null
                }
              }
            },
            "async": true,
            "background": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.4stoken-image.background"
                  },
                  {
                    "$if": {
                      "condition": {
                        "$eq": [
                          {
                            "$ref": "request.extra.transparentBackground"
                          },
                          "true"
                        ]
                      },
                      "then": "transparent",
                      "else": null
                    }
                  }
                ]
              }
            },
            "output_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-image.output_format"
              }
            },
            "style": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$not": {
                      "$gt": [
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
                                "$ne": [
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
                    }
                  },
                  "then": {
                    "$ref": "request.providerOptions.4stoken-image.style"
                  },
                  "else": null
                }
              }
            }
          },
          "files": [
            {
              "name": "image",
              "source": {
                "$filter": {
                  "from": {
                    "$sortByOrder": {
                      "$ref": "request.images"
                    }
                  },
                  "as": "media",
                  "where": {
                    "$ne": [
                      {
                        "$ref": "media.role"
                      },
                      "mask"
                    ]
                  }
                }
              }
            },
            {
              "name": "mask",
              "source": {
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
            }
          ]
        },
        "poll": {
          "method": "GET",
          "path": "/v1/images/tasks/{{taskId}}"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.taskId"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$ne": [
                  {
                    "$coalesce": [
                      {
                        "$ref": "response.status"
                      },
                      ""
                    ]
                  },
                  ""
                ]
              },
              "then": {
                "$switch": {
                  "cases": [
                    {
                      "when": {
                        "$eq": [
                          {
                            "$ref": "response.status"
                          },
                          "succeeded"
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
                        "$in": [
                          {
                            "$ref": "response.status"
                          },
                          [
                            "canceled",
                            "cancelled"
                          ]
                        ]
                      },
                      "then": "cancelled"
                    },
                    {
                      "when": {
                        "$eq": [
                          {
                            "$ref": "response.status"
                          },
                          "running"
                        ]
                      },
                      "then": "processing"
                    }
                  ],
                  "default": "pending"
                }
              },
              "else": {
                "$if": {
                  "condition": {
                    "$gt": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "response.data"
                            },
                            {
                              "$ref": "response.result.data"
                            }
                          ]
                        }
                      },
                      0
                    ]
                  },
                  "then": "succeeded",
                  "else": "pending"
                }
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.error"
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
          },
          "resultEphemeral": true,
          "images": {
            "$coalesce": [
              {
                "$ref": "response.data"
              },
              {
                "$ref": "response.result.data"
              }
            ]
          }
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
        "baseUrl": "https://api.4stoken.cn",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "id": "4stoken-seedream",
        "label": "4SToken Seedream 原生图片",
        "capabilities": [
          "image"
        ],
        "requiresPublicMediaUrls": false,
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "model",
            "description": "开放原生 Seedream 线路的模型编码。",
            "required": true
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "prompt",
            "description": "图片提示词。",
            "required": true
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "mapping": "size",
            "description": "明确档位或像素尺寸，按模型配置。",
            "required": false
          },
          {
            "name": "images",
            "type": "media[]",
            "mapping": "image",
            "description": "最多14张参考 URL 或 Base64。",
            "required": false
          },
          {
            "name": "imageCount",
            "type": "integer",
            "mapping": "sequential_image_generation_options.max_images",
            "description": "1～15，参考与输出合计不超过15。",
            "required": false
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "tools / output_format / watermark / optimize_prompt_options / guidance_scale",
            "description": "按模型能力启用的白名单字段。",
            "required": false
          }
        ],
        "imageParameters": [
          {
            "name": "size",
            "label": "尺寸",
            "type": "string",
            "binding": "aspectRatio",
            "encoding": "pixels",
            "pricing": true
          },
          {
            "name": "count",
            "label": "生成数量",
            "type": "integer",
            "binding": "imageCount",
            "min": 1,
            "max": 15,
            "step": 1,
            "default": 1
          },
          {
            "name": "outputFormat",
            "label": "输出格式",
            "type": "string",
            "binding": "providerOptions.4stoken-seedream.output_format",
            "values": [
              "png",
              "jpeg"
            ],
            "enabled": false
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
            "message": "4SToken：请填写实际可用的 modelCode"
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
            "message": "4SToken：提示词不能为空"
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
            "message": "4SToken Seedream 原生接口不支持蒙版"
          },
          {
            "assert": {
              "$and": [
                {
                  "$lte": [
                    {
                      "$len": {
                        "$sortByOrder": {
                          "$ref": "request.images"
                        }
                      }
                    },
                    14
                  ]
                },
                {
                  "$lte": [
                    {
                      "$add": [
                        {
                          "$len": {
                            "$sortByOrder": {
                              "$ref": "request.images"
                            }
                          }
                        },
                        {
                          "$max": [
                            {
                              "$ref": "request.imageCount"
                            },
                            1
                          ]
                        }
                      ]
                    },
                    15
                  ]
                }
              ]
            },
            "message": "4SToken Seedream：参考最多14张，参考与输出合计不超过15"
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
            "message": "4SToken Seedream 不接收视频或音频参考"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$split": [
                      {
                        "$ref": "request.aspectRatio"
                      },
                      ":"
                    ]
                  }
                },
                1
              ]
            },
            "message": "4SToken Seedream 原生 size 必须是档位或像素尺寸，不能直接传比例"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v3/images/generations",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "size": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$not": {
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
                    }
                  },
                  "then": {
                    "$trim": {
                      "$ref": "request.aspectRatio"
                    }
                  },
                  "else": null
                }
              }
            },
            "image": {
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
            "stream": false,
            "response_format": "url",
            "sequential_image_generation": {
              "$if": {
                "condition": {
                  "$gt": [
                    {
                      "$ref": "request.imageCount"
                    },
                    1
                  ]
                },
                "then": "auto",
                "else": "disabled"
              }
            },
            "sequential_image_generation_options": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$gt": [
                      {
                        "$ref": "request.imageCount"
                      },
                      1
                    ]
                  },
                  "then": {
                    "max_images": {
                      "$ref": "request.imageCount"
                    }
                  },
                  "else": null
                }
              }
            },
            "watermark": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.4stoken-seedream.watermark"
                },
                true
              ]
            },
            "tools": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-seedream.tools"
              }
            },
            "output_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-seedream.output_format"
              }
            },
            "optimize_prompt_options": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-seedream.optimize_prompt_options"
              }
            },
            "guidance_scale": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-seedream.guidance_scale"
              }
            }
          }
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$ref": "response.data"
          },
          "usage": {
            "$ref": "response.usage"
          },
          "resultEphemeral": true,
          "errorPaths": [
            "error.code"
          ],
          "messagePaths": [
            "error.message"
          ]
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
        "baseUrl": "https://api.4stoken.cn",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "id": "4stoken-video",
        "label": "4SToken 视频任务",
        "capabilities": [
          "video"
        ],
        "requiresPublicMediaUrls": true,
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "model",
            "description": "实际视频 modelCode。",
            "required": true
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "prompt / content[].text",
            "description": "视频提示词。",
            "required": true
          },
          {
            "name": "images",
            "type": "media[]",
            "mapping": "image_url(s) / start_image_url + end_image_url / content",
            "description": "普通参考与首尾帧分别映射。",
            "required": false
          },
          {
            "name": "videos",
            "type": "media[]",
            "mapping": "content[].video_url",
            "description": "视频参考内容块。",
            "required": false
          },
          {
            "name": "audios",
            "type": "media[]",
            "mapping": "content[].audio_url",
            "description": "音频参考内容块。",
            "required": false
          },
          {
            "name": "duration",
            "type": "integer",
            "mapping": "duration",
            "description": "正整数秒，按模型能力配置。",
            "required": true
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "mapping": "aspect_ratio",
            "description": "比例，不映射到 size。",
            "required": false
          },
          {
            "name": "resolution",
            "type": "string",
            "mapping": "resolution",
            "description": "分辨率档位。",
            "required": false
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "mapping": "generate_audio",
            "description": "生成声音开关。",
            "required": false
          },
          {
            "name": "watermark",
            "type": "boolean",
            "mapping": "watermark",
            "description": "水印开关。",
            "required": false
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "seed",
            "description": "只透传可选整数 seed。",
            "required": false
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
            "message": "4SToken：请填写实际可用的 modelCode"
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
            "message": "4SToken：提示词不能为空"
          },
          {
            "assert": {
              "$gt": [
                {
                  "$ref": "request.duration"
                },
                0
              ]
            },
            "message": "4SToken：请明确指定符合模型能力的正整数时长"
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
            "message": "4SToken 视频不支持蒙版"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$add": [
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
                        }
                      ]
                    },
                    0
                  ]
                },
                {
                  "$and": [
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
                        }
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$ref": "request.images"
                          }
                        },
                        2
                      ]
                    },
                    {
                      "$not": {
                        "$gt": [
                          {
                            "$add": [
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
                          0
                        ]
                      }
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
                        0
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$ref": "request.images"
                          }
                        },
                        1
                      ]
                    },
                    {
                      "$not": {
                        "$gt": [
                          {
                            "$add": [
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
                          0
                        ]
                      }
                    }
                  ]
                }
              ]
            },
            "message": "4SToken：首尾帧须成对且不能混入普通参考；单张首帧使用图生视频"
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
                            "http",
                            "https"
                          ]
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
            "message": "4SToken 视频参考素材必须使用公网 HTTP(S) URL"
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
                            "http",
                            "https"
                          ]
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
            "message": "4SToken 视频参考素材必须使用公网 HTTP(S) URL"
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
                            "http",
                            "https"
                          ]
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
            "message": "4SToken 视频参考素材必须使用公网 HTTP(S) URL"
          }
        ],
        "polling": {
          "intervalSeconds": 15,
          "transientRetryLimit": 3
        },
        "create": {
          "method": "POST",
          "path": "/v1/videos",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$not": {
                      "$gt": [
                        {
                          "$add": [
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
                        0
                      ]
                    }
                  },
                  "then": {
                    "$ref": "request.prompt"
                  },
                  "else": null
                }
              }
            },
            "content": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$gt": [
                      {
                        "$add": [
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
                      0
                    ]
                  },
                  "then": {
                    "$concatArrays": [
                      [
                        {
                          "type": "text",
                          "text": {
                            "$ref": "request.prompt"
                          }
                        }
                      ],
                      {
                        "$map": {
                          "from": {
                            "$sortByOrder": {
                              "$ref": "request.images"
                            }
                          },
                          "as": "media",
                          "in": {
                            "type": "image_url",
                            "image_url": {
                              "url": {
                                "$ref": "media.value"
                              }
                            },
                            "role": "reference_image"
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
                            "type": "video_url",
                            "video_url": {
                              "url": {
                                "$ref": "media.value"
                              }
                            },
                            "role": "reference_video"
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
                            "type": "audio_url",
                            "audio_url": {
                              "url": {
                                "$ref": "media.value"
                              }
                            },
                            "role": "reference_audio"
                          }
                        }
                      }
                    ]
                  },
                  "else": null
                }
              }
            },
            "image_url": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$and": [
                      {
                        "$not": {
                          "$gt": [
                            {
                              "$add": [
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
                            0
                          ]
                        }
                      },
                      {
                        "$not": {
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
                            }
                          ]
                        }
                      },
                      {
                        "$eq": [
                          {
                            "$len": {
                              "$ref": "request.images"
                            }
                          },
                          1
                        ]
                      }
                    ]
                  },
                  "then": {
                    "$first": {
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
                  "else": null
                }
              }
            },
            "image_urls": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$and": [
                      {
                        "$not": {
                          "$gt": [
                            {
                              "$add": [
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
                            0
                          ]
                        }
                      },
                      {
                        "$not": {
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
                            }
                          ]
                        }
                      },
                      {
                        "$gt": [
                          {
                            "$len": {
                              "$ref": "request.images"
                            }
                          },
                          1
                        ]
                      }
                    ]
                  },
                  "then": {
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
                  },
                  "else": null
                }
              }
            },
            "start_image_url": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
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
                      }
                    ]
                  },
                  "then": {
                    "$first": {
                      "$map": {
                        "from": {
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
                        },
                        "as": "media",
                        "in": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  },
                  "else": null
                }
              }
            },
            "end_image_url": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
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
                      }
                    ]
                  },
                  "then": {
                    "$first": {
                      "$map": {
                        "from": {
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
                        },
                        "as": "media",
                        "in": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  },
                  "else": null
                }
              }
            },
            "duration": {
              "$ref": "request.duration"
            },
            "aspect_ratio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$not": {
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
                    }
                  },
                  "then": {
                    "$trim": {
                      "$ref": "request.aspectRatio"
                    }
                  },
                  "else": null
                }
              }
            },
            "resolution": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$not": {
                      "$in": [
                        {
                          "$lower": {
                            "$ref": "request.resolution"
                          }
                        },
                        [
                          "",
                          "auto"
                        ]
                      ]
                    }
                  },
                  "then": {
                    "$ref": "request.resolution"
                  },
                  "else": null
                }
              }
            },
            "generate_audio": {
              "$ref": "request.generateAudio"
            },
            "watermark": {
              "$ref": "request.watermark"
            },
            "seed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.4stoken-video.seed"
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/videos/{{taskId}}"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.taskId"
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
                      "succeeded"
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
                    "$in": [
                      {
                        "$ref": "response.status"
                      },
                      [
                        "canceled",
                        "cancelled"
                      ]
                    ]
                  },
                  "then": "cancelled"
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "running"
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
                "$ref": "response.error"
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
          },
          "resultEphemeral": true,
          "videos": {
            "$ref": "response.data"
          }
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
