# 极九接口合同

## 身份与认证

插件 ID `jijiu`，四个 Provider 共享渠道 `apiKey`，发送 `Authorization: Bearer <令牌>`。Base URL 不重复拼接 `/v1`。渠道应按实际令牌分组隔离；模型以该令牌的 `GET /v1/models` 与当前站点文档交集为准。

## 聊天与 Agent

`jijiu-chat` 使用 `POST /v1/chat/completions`，开放 gpt-5.6-sol、gpt-6-sol、gpt-6.1-sol、gpt-6-astra 的标准纯文本聊天、SSE 和 Agent 工具调用。保留宿主系统指令、文本历史、工具定义、调用 ID、参数以及工具结果回传，不改写真实 usage。

上游在 272K 上下文处切换单价，目前渠道只配置标准档。普通聊天验证完整 messages JSON 不超过 50000 个 Unicode 字符；Agent 每步验证完整 chatCompletion JSON（系统指令、消息、工具 schema、调用及结果）不超过同一上限。即使每个字符均占 4 个 UTF-8 字节，也保留消息结构与输出余量。输出默认 8192，显式 Agent 输出上限须为 1–32000 的整数 Token。纯文本 content 数组与 assistant 的空内容工具调用可用；图片、音频、视频及文件输入被拒绝。超限明确失败，不删改或静默截断历史，不自动切换价格档，不因网络失败重放请求。

需要宿主同时支持 Agent 参数校验：`BuildAgent` 在构造请求前执行 Provider 的 `validations`，校验环境 `operation` 由宿主固定为 `agent` 或 `create`，不能由请求覆盖。宿主先把实际单步输出/思考策略写入校验输入，再构造出站请求。仅在安装该宿主修复后启用本插件的 Agent 能力；1.1.0 原有限制不等于上游不支持工具调用。

Agent 请求只映射 model、messages、tools、tool_choice、parallel_tool_calls=false、max_tokens、reasoning_effort 与 prompt_cache_key。工具权限、审批、执行与每轮计费仍由宿主管理。SSE 开启 include_usage，工具参数分片按宿主通用解析器合并；工具调用与下一轮工具结果保持同一 ID。Token 单价按每百万 Token 配置，输入、输出和缓存读取分别使用成本加 20% 的售价；缓存命中从普通输入中扣除后单独计费，不重复收费。每轮保留独立任务及账单身份，沿用结算、退款与不确定结果处理。

## GPT / Banana 同步图片

`jijiu-image` 无参考图时 `POST /v1/images/generations` JSON，带参考图时 `POST /v1/images/edits` multipart 文件字段 `image`，宿主读取素材后上传文件。只发送 model、prompt、整数 n=1、像素 size；不套用夜总会的异步图片接口。按 order 排序参考图；禁止蒙版、视频与音频。图片响应遍历 data[]，支持 url 和 b64_json，结果交由宿主保存。

gpt-image-2、gpt-image-2.5、gpt-image-2.5-sunburst 固定 1K。gpt-image-2-2K/4K 和 gemini-nano-banana-2.1 可配置 1K/2K/4K，后者同样使用 OpenAI 图片接口，不能因为 gemini 前缀改走 Gemini 原生入口。上限由各渠道模型配置进一步限制，不把示例当全部上游能力。

## Gemini 原生图片

`jijiu-gemini-image` 仅匹配 gemini-3-pro-image、gemini-3.1-flash-image，使用 Bearer `POST /v1beta/models/{model}:generateContent`。提示词和参考图进入 contents[].parts[]；宿主支持的内嵌图片使用 inlineData，已有文件引用由 Gemini 通用映射处理。generationConfig.imageConfig.imageSize 使用 1K/2K/4K，aspectRatio 为画幅。响应筛选包含 inlineData/inline_data 的 parts，不把第一个文字 part 当图片。

## 视频

`jijiu-video` 提交 `POST /v1/videos` JSON，seconds 必须是整数；保存 id，轮询 `GET /v1/videos/{id}`。状态不区分大小写，completed/success/succeeded 成功，failed/failure/error 失败，未知状态继续等待。每 8 秒轮询，暂时错误最多重试 3 次原查询。完成后使用 `GET /v1/videos/{id}/content`，由宿主出站策略处理安全重定向、鉴权和媒体持久化，不能把 Bearer 泄露给重定向目标。

默认媒体字段 images/videos/audios 均为按 order 排序的公网 HTTPS URL 数组；全参 C 使用 images/video_refs/audio_refs；WAN 特价 1080 使用 reference_image_urls/reference_audio_urls。固定分辨率线路不发送多余 resolution；wan3.0-video 显式发送 1080p。只发送当前线路规定的字段，不透传 n、fps、quality、negative_prompt 等参数。

时长、分辨率、素材数量与画幅按 manifest 的逐型号白名单验证，拒绝会被上游截断/改档的输入。SD2.0 两个 903z 型号仅 10–15 秒；全参 C、MiniMax、WAN 至少 5 秒；其余型号以各行合同为准。SD2.0 线路一的介绍与文档下限存在 4/5 秒差异，采用兼容交集 5–15 秒。WAN 特价 1080 仅允许 5/10/15/30 秒，避免上游自动对齐。

## 明确的能力边界

- 官转 seedance-2.5 全参带参考视频时按输出秒数加参考视频秒数计费；当前插件暂拒参考视频，待宿主结算合同支持后再开放。图和音频输入仍可用。
- 没有猜测首尾帧专用字段，当前只提供通用参考图；也不将所有线路的音频参考宣称为音频生成开关。
- 参考素材总时长和最短片段限制还需按各线路在宿主能力层核实；无法证明的输入不应放开。令牌目录可见性不能证明实际调用、余额或上游可用。
- 价目表 `display_status=paused` 的线路保持停用；网络超时不自动重放创建。
- 音乐模型是另一套聊天返回音频链接合同，本包未将其伪装为文本、TTS 或视频模型。

## 验证

协议测试使用本地请求/响应夹具，覆盖逐线路字段、排序、同步文件、Gemini 文字与图片混合响应、状态大小写和参数拒绝。真实远端生成与费用结算只有实际执行后才算验收，不用报价或模型列表成功替代。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "jijiu",
  "name": "极九 API",
  "version": "1.2.0",
  "author": "梦层 MengCeng",
  "description": "极九独立协议：Chat Completions、GPT 同步生图/改图、Gemini 原生生图和逐线路视频。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "极九分组令牌",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "jijiu-chat",
        "label": "极九 Chat Completions",
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
        "baseUrl": "https://newapi.jijiucanvas.com",
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
                "$ref": "request.providerOptions.jijiu-chat.temperature"
              }
            },
            "top_p": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.jijiu-chat.top_p"
              }
            },
            "max_tokens": {
              "$coalesce": [
                {
                  "$ref": "request.extra.max_tokens"
                },
                {
                  "$ref": "request.providerOptions.jijiu-chat.max_tokens"
                },
                8192
              ]
            },
            "response_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.jijiu-chat.response_format"
              }
            },
            "stop": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.jijiu-chat.stop"
              }
            },
            "frequency_penalty": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.jijiu-chat.frequency_penalty"
              }
            },
            "presence_penalty": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.jijiu-chat.presence_penalty"
              }
            }
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
        "streamingFormat": "chat-completion",
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "gpt-5.6-sol",
                  "gpt-6-sol",
                  "gpt-6.1-sol",
                  "gpt-6-astra"
                ]
              ]
            },
            "message": "请选择当前开放的聊天模型"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "operation"
                    },
                    "agent"
                  ]
                },
                "then": true,
                "else": {
                  "$and": [
                    {
                      "$gt": [
                        {
                          "$len": {
                            "$ref": "request.messages"
                          }
                        },
                        0
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$len": {
                            "$json": {
                              "$ref": "request.messages"
                            }
                          }
                        },
                        50000
                      ]
                    }
                  ]
                }
              }
            },
            "message": "当前聊天模型仅开放标准上下文，完整消息（含历史）过长，请精简后重试"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "operation"
                    },
                    "agent"
                  ]
                },
                "then": true,
                "else": {
                  "$eq": [
                    {
                      "$len": {
                        "$filter": {
                          "from": {
                            "$ref": "request.messages"
                          },
                          "as": "message",
                          "where": {
                            "$eq": [
                              {
                                "$first": {
                                  "$split": [
                                    {
                                      "$json": {
                                        "$ref": "message.content"
                                      }
                                    },
                                    "\""
                                  ]
                                }
                              },
                              ""
                            ]
                          }
                        }
                      }
                    },
                    {
                      "$len": {
                        "$ref": "request.messages"
                      }
                    }
                  ]
                }
              }
            },
            "message": "当前聊天线路仅支持纯文本消息"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "operation"
                    },
                    "agent"
                  ]
                },
                "then": true,
                "else": {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$ref": "request.images"
                          }
                        },
                        0
                      ]
                    },
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
                }
              }
            },
            "message": "当前聊天线路不接受参考媒体"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "operation"
                    },
                    "agent"
                  ]
                },
                "then": true,
                "else": {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$coalesce": [
                            {
                              "$ref": "request.extra.max_tokens"
                            },
                            {
                              "$ref": "request.providerOptions.jijiu-chat.max_tokens"
                            },
                            8192
                          ]
                        },
                        1
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$coalesce": [
                            {
                              "$ref": "request.extra.max_tokens"
                            },
                            {
                              "$ref": "request.providerOptions.jijiu-chat.max_tokens"
                            },
                            8192
                          ]
                        },
                        32000
                      ]
                    }
                  ]
                }
              }
            },
            "message": "本次输出上限须为 1 至 32000 Token"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "operation"
                    },
                    "agent"
                  ]
                },
                "then": {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$first": {
                            "$split": [
                              {
                                "$json": {
                                  "$ref": "request.extra.agent.chatCompletion.messages"
                                }
                              },
                              "["
                            ]
                          }
                        },
                        ""
                      ]
                    },
                    {
                      "$gt": [
                        {
                          "$len": {
                            "$ref": "request.extra.agent.chatCompletion.messages"
                          }
                        },
                        0
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$len": {
                            "$json": {
                              "$ref": "request.extra.agent.chatCompletion"
                            }
                          }
                        },
                        50000
                      ]
                    }
                  ]
                },
                "else": true
              }
            },
            "message": "当前 Agent 仅开放标准上下文，系统指令、工具定义及历史合计过长，请精简或新建对话"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "operation"
                    },
                    "agent"
                  ]
                },
                "then": {
                  "$eq": [
                    {
                      "$len": {
                        "$filter": {
                          "from": {
                            "$ref": "request.extra.agent.chatCompletion.messages"
                          },
                          "as": "message",
                          "where": {
                            "$or": [
                              {
                                "$eq": [
                                  {
                                    "$first": {
                                      "$split": [
                                        {
                                          "$json": {
                                            "$ref": "message.content"
                                          }
                                        },
                                        "\""
                                      ]
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
                                        "$first": {
                                          "$split": [
                                            {
                                              "$json": {
                                                "$ref": "message.content"
                                              }
                                            },
                                            "["
                                          ]
                                        }
                                      },
                                      ""
                                    ]
                                  },
                                  {
                                    "$gt": [
                                      {
                                        "$len": {
                                          "$ref": "message.content"
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
                                              "$ref": "message.content"
                                            },
                                            "as": "part",
                                            "where": {
                                              "$and": [
                                                {
                                                  "$eq": [
                                                    {
                                                      "$ref": "part.type"
                                                    },
                                                    "text"
                                                  ]
                                                },
                                                {
                                                  "$eq": [
                                                    {
                                                      "$first": {
                                                        "$split": [
                                                          {
                                                            "$json": {
                                                              "$ref": "part.text"
                                                            }
                                                          },
                                                          "\""
                                                        ]
                                                      }
                                                    },
                                                    ""
                                                  ]
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      },
                                      {
                                        "$len": {
                                          "$ref": "message.content"
                                        }
                                      }
                                    ]
                                  }
                                ]
                              },
                              {
                                "$and": [
                                  {
                                    "$eq": [
                                      {
                                        "$ref": "message.role"
                                      },
                                      "assistant"
                                    ]
                                  },
                                  {
                                    "$eq": [
                                      {
                                        "$json": {
                                          "$ref": "message.content"
                                        }
                                      },
                                      "null"
                                    ]
                                  },
                                  {
                                    "$gt": [
                                      {
                                        "$len": {
                                          "$ref": "message.tool_calls"
                                        }
                                      },
                                      0
                                    ]
                                  }
                                ]
                              }
                            ]
                          }
                        }
                      }
                    },
                    {
                      "$len": {
                        "$ref": "request.extra.agent.chatCompletion.messages"
                      }
                    }
                  ]
                },
                "else": true
              }
            },
            "message": "当前 Agent 聊天线路仅支持文本消息和工具调用，不支持图片、视频或音频输入"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "operation"
                    },
                    "agent"
                  ]
                },
                "then": {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$coalesce": [
                            {
                              "$ref": "request.extra.agent.chatCompletion.max_tokens"
                            },
                            8192
                          ]
                        },
                        1
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$coalesce": [
                            {
                              "$ref": "request.extra.agent.chatCompletion.max_tokens"
                            },
                            8192
                          ]
                        },
                        32000
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$ref": "request.extra.agent.chatCompletion.max_tokens"
                            },
                            8192
                          ]
                        },
                        {
                          "$toInt": {
                            "$coalesce": [
                              {
                                "$ref": "request.extra.agent.chatCompletion.max_tokens"
                              },
                              8192
                            ]
                          }
                        }
                      ]
                    }
                  ]
                },
                "else": true
              }
            },
            "message": "Agent 单步输出上限须为 1 至 32000 的整数 Token"
          }
        ],
        "agent": {
          "method": "POST",
          "path": "/v1/chat/completions",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "messages": {
              "$ref": "request.extra.agent.chatCompletion.messages"
            },
            "max_tokens": {
              "$coalesce": [
                {
                  "$ref": "request.extra.agent.chatCompletion.max_tokens"
                },
                8192
              ]
            },
            "tools": {
              "$omitEmpty": {
                "$ref": "request.extra.agent.chatCompletion.tools"
              }
            },
            "tool_choice": {
              "$omitEmpty": {
                "$ref": "request.extra.agent.chatCompletion.tool_choice"
              }
            },
            "reasoning_effort": {
              "$omitEmpty": {
                "$ref": "request.extra.agent.chatCompletion.reasoning_effort"
              }
            },
            "prompt_cache_key": {
              "$omitEmpty": {
                "$ref": "request.extra.agent.chatCompletion.prompt_cache_key"
              }
            },
            "parallel_tool_calls": false
          }
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
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://newapi.jijiucanvas.com",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "id": "jijiu-image",
        "label": "极九 GPT / Banana 同步生图",
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
            "name": "count",
            "label": "生成数量",
            "type": "integer",
            "binding": "imageCount",
            "min": 1,
            "max": 1,
            "step": 1,
            "default": 1
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
            "message": "极九：请填写当前令牌可用的模型 ID"
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
            "message": "极九：提示词不能为空"
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
            "message": "极九：GPT 参考图必须为 HTTPS 地址或 PNG/JPEG/WebP Base64 图片"
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
            "message": "极九：统一生图接口没有声明蒙版，请移除蒙版"
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
            "message": "极九：生图不接受视频或音频参考"
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
            "message": "极九：单次生成固定一张"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "gpt-image-2",
                  "gpt-image-2.5",
                  "gpt-image-2.5-sunburst",
                  "gpt-image-2-2K/4K",
                  "gemini-nano-banana-2.1"
                ]
              ]
            },
            "message": "极九：请选择当前开放的同步生图型号"
          },
          {
            "assert": {
              "$or": [
                {
                  "$in": [
                    {
                      "$ref": "request.model"
                    },
                    [
                      "gpt-image-2-2K/4K",
                      "gemini-nano-banana-2.1"
                    ]
                  ]
                },
                {
                  "$in": [
                    {
                      "$lower": {
                        "$ref": "request.resolution"
                      }
                    },
                    [
                      "",
                      "1k"
                    ]
                  ]
                }
              ]
            },
            "message": "极九：1K 型号不能提交 2K/4K 分辨率"
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
              "name": "image",
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
        "id": "jijiu-gemini-image",
        "label": "极九 Gemini 原生生图",
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
        "baseUrl": "https://newapi.jijiucanvas.com",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅比例",
            "type": "string",
            "binding": "aspectRatio",
            "encoding": "ratio",
            "values": [
              "1:1",
              "2:3",
              "3:2",
              "3:4",
              "4:3",
              "4:5",
              "5:4",
              "9:16",
              "16:9",
              "21:9"
            ],
            "default": "1:1"
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
            "pricing": true
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
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "图片模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "图片提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "provider image/reference fields",
            "description": "参考图或编辑源图，role 由业务层确定。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "required": false,
            "mapping": "n/sample_count",
            "description": "输出数量。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "size/aspect_ratio",
            "description": "比例或尺寸，语义按协议说明。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution/imageSize",
            "description": "分辨率档位。"
          },
          {
            "name": "quality",
            "type": "string",
            "required": false,
            "mapping": "quality",
            "description": "质量档位。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "插件命名空间内的厂商扩展字段。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1beta/models/{{model}}:generateContent",
          "contentType": "application/json",
          "body": {
            "contents": [
              {
                "role": "user",
                "parts": {
                  "$concatArrays": [
                    [
                      {
                        "text": {
                          "$ref": "request.prompt"
                        }
                      }
                    ],
                    {
                      "$map": {
                        "from": {
                          "$ref": "request.images"
                        },
                        "as": "media",
                        "in": {
                          "$if": {
                            "condition": {
                              "$ref": "media.dataUrl"
                            },
                            "then": {
                              "inlineData": {
                                "mimeType": {
                                  "$dataMime": {
                                    "$ref": "media.dataUrl"
                                  }
                                },
                                "data": {
                                  "$dataPayload": {
                                    "$ref": "media.dataUrl"
                                  }
                                }
                              }
                            },
                            "else": {
                              "fileData": {
                                "mimeType": {
                                  "$omitEmpty": {
                                    "$ref": "media.mimeType"
                                  }
                                },
                                "fileUri": {
                                  "$ref": "media.url"
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            ],
            "generationConfig": {
              "responseModalities": [
                "TEXT",
                "IMAGE"
              ],
              "imageConfig": {
                "aspectRatio": {
                  "$omitEmpty": {
                    "$ref": "request.aspectRatio"
                  }
                },
                "imageSize": {
                  "$omitEmpty": {
                    "$coalesce": [
                      {
                        "$switch": {
                          "cases": [
                            {
                              "when": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.quality"
                                    }
                                  },
                                  [
                                    "1k",
                                    "low"
                                  ]
                                ]
                              },
                              "then": "1K"
                            },
                            {
                              "when": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.quality"
                                    }
                                  },
                                  [
                                    "2k",
                                    "medium"
                                  ]
                                ]
                              },
                              "then": "2K"
                            },
                            {
                              "when": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.quality"
                                    }
                                  },
                                  [
                                    "4k",
                                    "high"
                                  ]
                                ]
                              },
                              "then": "4K"
                            }
                          ],
                          "default": null
                        }
                      },
                      {
                        "$switch": {
                          "cases": [
                            {
                              "when": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.resolution"
                                    }
                                  },
                                  [
                                    "1k",
                                    "low"
                                  ]
                                ]
                              },
                              "then": "1K"
                            },
                            {
                              "when": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.resolution"
                                    }
                                  },
                                  [
                                    "2k",
                                    "medium"
                                  ]
                                ]
                              },
                              "then": "2K"
                            },
                            {
                              "when": {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "request.resolution"
                                    }
                                  },
                                  [
                                    "4k",
                                    "high"
                                  ]
                                ]
                              },
                              "then": "4K"
                            }
                          ],
                          "default": null
                        }
                      }
                    ]
                  }
                }
              }
            },
            "systemInstruction": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.jijiu-gemini-image.systemInstruction"
                  },
                  {
                    "$if": {
                      "condition": {
                        "$ref": "request.instructions"
                      },
                      "then": {
                        "parts": [
                          {
                            "text": {
                              "$ref": "request.instructions"
                            }
                          }
                        ]
                      },
                      "else": null
                    }
                  }
                ]
              }
            }
          }
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$map": {
              "from": {
                "$filter": {
                  "from": {
                    "$ref": "response.candidates.0.content.parts"
                  },
                  "as": "part",
                  "where": {
                    "$or": [
                      {
                        "$ref": "part.inlineData"
                      },
                      {
                        "$ref": "part.inline_data"
                      }
                    ]
                  }
                }
              },
              "as": "part",
              "in": {
                "dataUrl": {
                  "$concat": [
                    "data:",
                    {
                      "$coalesce": [
                        {
                          "$ref": "part.inlineData.mimeType"
                        },
                        {
                          "$ref": "part.inline_data.mime_type"
                        },
                        "image/png"
                      ]
                    },
                    ";base64,",
                    {
                      "$coalesce": [
                        {
                          "$ref": "part.inlineData.data"
                        },
                        {
                          "$ref": "part.inline_data.data"
                        }
                      ]
                    }
                  ]
                }
              }
            }
          },
          "text": {
            "$map": {
              "from": {
                "$filter": {
                  "from": {
                    "$ref": "response.candidates.0.content.parts"
                  },
                  "as": "part",
                  "where": {
                    "$ref": "part.text"
                  }
                }
              },
              "as": "part",
              "in": {
                "$ref": "part.text"
              }
            }
          },
          "usage": {
            "$ref": "response.usageMetadata"
          },
          "errorPaths": [
            "error.code",
            "code"
          ],
          "messagePaths": [
            "error.message",
            "message",
            "fail_reason"
          ]
        },
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "gemini-3-pro-image",
                  "gemini-3.1-flash-image"
                ]
              ]
            },
            "message": "极九：该接口仅支持 Gemini 原生图片模型"
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
            "message": "极九：提示词不能为空"
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
            "message": "极九：单次生成固定一张"
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
            "message": "极九：生图不接受视频或音频参考"
          }
        ]
      },
      {
        "id": "jijiu-video",
        "label": "极九视频（Seedance / WAN / MiniMax）",
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
        "baseUrl": "https://newapi.jijiucanvas.com",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "满血seedance-2.5全参C",
                  "稳定seedance-2.5全参D",
                  "稳定seedance-2.5参图参音F",
                  "官转seedance-2.0全参",
                  "官转seedance-2.5全参",
                  "SD2.0满血稳定933-线路一",
                  "SD2.0满血稳定933-线路四",
                  "SD2.0特价稳定903z",
                  "SD2.0mini特价稳定903z",
                  "SD2.5特价301010线路一",
                  "wan3.0-video",
                  "wan3.0-video特价1080",
                  "Minimax-h3-933特价"
                ]
              ]
            },
            "message": "极九：请选择当前文档开放的视频完整型号"
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
            "message": "极九：提示词不能为空"
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
                      "$switch": {
                        "cases": [
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "满血seedance-2.5全参C"
                              ]
                            },
                            "then": 5
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "稳定seedance-2.5全参D"
                              ]
                            },
                            "then": 4
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "稳定seedance-2.5参图参音F"
                              ]
                            },
                            "then": 4
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "官转seedance-2.0全参"
                              ]
                            },
                            "then": 4
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "官转seedance-2.5全参"
                              ]
                            },
                            "then": 4
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.0满血稳定933-线路一"
                              ]
                            },
                            "then": 5
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.0满血稳定933-线路四"
                              ]
                            },
                            "then": 4
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.0特价稳定903z"
                              ]
                            },
                            "then": 10
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.0mini特价稳定903z"
                              ]
                            },
                            "then": 10
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.5特价301010线路一"
                              ]
                            },
                            "then": 4
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "wan3.0-video"
                              ]
                            },
                            "then": 5
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "wan3.0-video特价1080"
                              ]
                            },
                            "then": 5
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "Minimax-h3-933特价"
                              ]
                            },
                            "then": 5
                          }
                        ],
                        "default": 9999
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
                      "$switch": {
                        "cases": [
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "满血seedance-2.5全参C"
                              ]
                            },
                            "then": 30
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "稳定seedance-2.5全参D"
                              ]
                            },
                            "then": 30
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "稳定seedance-2.5参图参音F"
                              ]
                            },
                            "then": 30
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "官转seedance-2.0全参"
                              ]
                            },
                            "then": 15
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "官转seedance-2.5全参"
                              ]
                            },
                            "then": 30
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.0满血稳定933-线路一"
                              ]
                            },
                            "then": 15
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.0满血稳定933-线路四"
                              ]
                            },
                            "then": 15
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.0特价稳定903z"
                              ]
                            },
                            "then": 15
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.0mini特价稳定903z"
                              ]
                            },
                            "then": 15
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "SD2.5特价301010线路一"
                              ]
                            },
                            "then": 30
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "wan3.0-video"
                              ]
                            },
                            "then": 30
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "wan3.0-video特价1080"
                              ]
                            },
                            "then": 30
                          },
                          {
                            "when": {
                              "$eq": [
                                {
                                  "$ref": "request.model"
                                },
                                "Minimax-h3-933特价"
                              ]
                            },
                            "then": 30
                          }
                        ],
                        "default": 0
                      }
                    }
                  ]
                }
              ]
            },
            "message": "极九：时长超出当前线路范围"
          },
          {
            "assert": {
              "$in": [
                {
                  "$lower": {
                    "$ref": "request.resolution"
                  }
                },
                {
                  "$switch": {
                    "cases": [
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "满血seedance-2.5全参C"
                          ]
                        },
                        "then": [
                          "1080p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5全参D"
                          ]
                        },
                        "then": [
                          "480p",
                          "720p",
                          "1080p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5参图参音F"
                          ]
                        },
                        "then": [
                          "480p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.0全参"
                          ]
                        },
                        "then": [
                          "720p",
                          "1080p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.5全参"
                          ]
                        },
                        "then": [
                          "720p",
                          "1080p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路一"
                          ]
                        },
                        "then": [
                          "720p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路四"
                          ]
                        },
                        "then": [
                          "480p",
                          "720p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0特价稳定903z"
                          ]
                        },
                        "then": [
                          "720p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0mini特价稳定903z"
                          ]
                        },
                        "then": [
                          "720p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.5特价301010线路一"
                          ]
                        },
                        "then": [
                          "480p",
                          "720p",
                          "1080p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video"
                          ]
                        },
                        "then": [
                          "1080p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video特价1080"
                          ]
                        },
                        "then": [
                          "1080p"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "Minimax-h3-933特价"
                          ]
                        },
                        "then": [
                          "768p"
                        ]
                      }
                    ],
                    "default": []
                  }
                }
              ]
            },
            "message": "极九：分辨率不在当前线路允许范围"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.aspectRatio"
                },
                {
                  "$switch": {
                    "cases": [
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "满血seedance-2.5全参C"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "4:3",
                          "3:4",
                          "1:1",
                          "21:9"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5全参D"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "1:1"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5参图参音F"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "1:1"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.0全参"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "1:1",
                          "4:3",
                          "3:4"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.5全参"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "1:1",
                          "4:3",
                          "3:4"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路一"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "1:1",
                          "4:3",
                          "3:4"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路四"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "1:1",
                          "4:3",
                          "3:4"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0特价稳定903z"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "1:1",
                          "4:3",
                          "3:4"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0mini特价稳定903z"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "1:1",
                          "4:3",
                          "3:4"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.5特价301010线路一"
                          ]
                        },
                        "then": [
                          "21:9",
                          "16:9",
                          "4:3",
                          "1:1",
                          "3:4",
                          "9:16"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "4:3",
                          "3:4",
                          "1:1",
                          "21:9"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video特价1080"
                          ]
                        },
                        "then": [
                          "16:9",
                          "9:16",
                          "4:3",
                          "3:4",
                          "1:1",
                          "21:9"
                        ]
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "Minimax-h3-933特价"
                          ]
                        },
                        "then": [
                          "21:9",
                          "16:9",
                          "4:3",
                          "3:2",
                          "1:1",
                          "2:3",
                          "3:4",
                          "9:16"
                        ]
                      }
                    ],
                    "default": []
                  }
                }
              ]
            },
            "message": "极九：画幅不在当前线路允许范围"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                {
                  "$switch": {
                    "cases": [
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "满血seedance-2.5全参C"
                          ]
                        },
                        "then": 30
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5全参D"
                          ]
                        },
                        "then": 30
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5参图参音F"
                          ]
                        },
                        "then": 30
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.0全参"
                          ]
                        },
                        "then": 9
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.5全参"
                          ]
                        },
                        "then": 30
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路一"
                          ]
                        },
                        "then": 9
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路四"
                          ]
                        },
                        "then": 9
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0特价稳定903z"
                          ]
                        },
                        "then": 9
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0mini特价稳定903z"
                          ]
                        },
                        "then": 9
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.5特价301010线路一"
                          ]
                        },
                        "then": 30
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video"
                          ]
                        },
                        "then": 9
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video特价1080"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "Minimax-h3-933特价"
                          ]
                        },
                        "then": 9
                      }
                    ],
                    "default": 0
                  }
                }
              ]
            },
            "message": "极九：参考素材数量超限或该线路不支持此类素材"
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
            "message": "极九：视频参考素材必须为公网 HTTPS 直链"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                {
                  "$switch": {
                    "cases": [
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "满血seedance-2.5全参C"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5全参D"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5参图参音F"
                          ]
                        },
                        "then": 0
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.0全参"
                          ]
                        },
                        "then": 0
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.5全参"
                          ]
                        },
                        "then": 0
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路一"
                          ]
                        },
                        "then": 0
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路四"
                          ]
                        },
                        "then": 3
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0特价稳定903z"
                          ]
                        },
                        "then": 0
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0mini特价稳定903z"
                          ]
                        },
                        "then": 0
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.5特价301010线路一"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video"
                          ]
                        },
                        "then": 0
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video特价1080"
                          ]
                        },
                        "then": 0
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "Minimax-h3-933特价"
                          ]
                        },
                        "then": 3
                      }
                    ],
                    "default": 0
                  }
                }
              ]
            },
            "message": "极九：参考素材数量超限或该线路不支持此类素材"
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
            "message": "极九：视频参考素材必须为公网 HTTPS 直链"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.audios"
                  }
                },
                {
                  "$switch": {
                    "cases": [
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "满血seedance-2.5全参C"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5全参D"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "稳定seedance-2.5参图参音F"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.0全参"
                          ]
                        },
                        "then": 3
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "官转seedance-2.5全参"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路一"
                          ]
                        },
                        "then": 3
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0满血稳定933-线路四"
                          ]
                        },
                        "then": 3
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0特价稳定903z"
                          ]
                        },
                        "then": 3
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.0mini特价稳定903z"
                          ]
                        },
                        "then": 3
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "SD2.5特价301010线路一"
                          ]
                        },
                        "then": 10
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video"
                          ]
                        },
                        "then": 3
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "wan3.0-video特价1080"
                          ]
                        },
                        "then": 5
                      },
                      {
                        "when": {
                          "$eq": [
                            {
                              "$ref": "request.model"
                            },
                            "Minimax-h3-933特价"
                          ]
                        },
                        "then": 3
                      }
                    ],
                    "default": 0
                  }
                }
              ]
            },
            "message": "极九：参考素材数量超限或该线路不支持此类素材"
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
            "message": "极九：视频参考素材必须为公网 HTTPS 直链"
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
                            "$ref": "media.role"
                          },
                          [
                            "mask",
                            "first_frame",
                            "last_frame"
                          ]
                        ]
                      }
                    }
                  }
                },
                0
              ]
            },
            "message": "极九：当前插件只开放通用参考图，不猜测首尾帧字段"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.model"
                    },
                    "wan3.0-video特价1080"
                  ]
                },
                {
                  "$in": [
                    {
                      "$ref": "request.duration"
                    },
                    [
                      5,
                      10,
                      15,
                      30
                    ]
                  ]
                }
              ]
            },
            "message": "极九：WAN 特价线路只能选择 5、10、15、30 秒，避免上游自动改时长"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.model"
                    },
                    "官转seedance-2.0全参"
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
                },
                {
                  "$gt": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "极九：该线路参考音频须同时提供画面参考"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.model"
                    },
                    "稳定seedance-2.5全参D"
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
                                "$ref": "request.videos"
                              },
                              "as": "media",
                              "where": {
                                "$gte": [
                                  {
                                    "$ref": "media.metadata.durationMs"
                                  },
                                  1
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
                    {
                      "$lte": [
                        {
                          "$add": [
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.0.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.1.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.2.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.3.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.4.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.5.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.6.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.7.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.8.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.videos.9.metadata.durationMs"
                                },
                                0
                              ]
                            }
                          ]
                        },
                        30000
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "极九：参考片段时长缺失、低于最短要求或合计超限"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.model"
                    },
                    "稳定seedance-2.5全参D"
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
                                "$ref": "request.audios"
                              },
                              "as": "media",
                              "where": {
                                "$gte": [
                                  {
                                    "$ref": "media.metadata.durationMs"
                                  },
                                  1
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
                    {
                      "$lte": [
                        {
                          "$add": [
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.0.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.1.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.2.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.3.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.4.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.5.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.6.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.7.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.8.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.9.metadata.durationMs"
                                },
                                0
                              ]
                            }
                          ]
                        },
                        30000
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "极九：参考片段时长缺失、低于最短要求或合计超限"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.model"
                    },
                    "官转seedance-2.0全参"
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
                                "$ref": "request.audios"
                              },
                              "as": "media",
                              "where": {
                                "$gte": [
                                  {
                                    "$ref": "media.metadata.durationMs"
                                  },
                                  2000
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
                    {
                      "$lte": [
                        {
                          "$add": [
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.0.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.1.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.2.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.3.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.4.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.5.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.6.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.7.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.8.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.9.metadata.durationMs"
                                },
                                0
                              ]
                            }
                          ]
                        },
                        15000
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "极九：参考片段时长缺失、低于最短要求或合计超限"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.model"
                    },
                    "官转seedance-2.5全参"
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
                                "$ref": "request.audios"
                              },
                              "as": "media",
                              "where": {
                                "$gte": [
                                  {
                                    "$ref": "media.metadata.durationMs"
                                  },
                                  2000
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
                    {
                      "$lte": [
                        {
                          "$add": [
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.0.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.1.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.2.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.3.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.4.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.5.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.6.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.7.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.8.metadata.durationMs"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.audios.9.metadata.durationMs"
                                },
                                0
                              ]
                            }
                          ]
                        },
                        30000
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "极九：参考片段时长缺失、低于最短要求或合计超限"
          }
        ],
        "polling": {
          "intervalSeconds": 8,
          "transientRetryLimit": 3
        },
        "create": {
          "method": "POST",
          "path": "/v1/videos",
          "contentType": "application/json",
          "body": {
            "$switch": {
              "cases": [
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "满血seedance-2.5全参C"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "video_refs": {
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
                    "audio_refs": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "稳定seedance-2.5全参D"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
                    },
                    "resolution": {
                      "$lower": {
                        "$ref": "request.resolution"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "videos": {
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
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "稳定seedance-2.5参图参音F"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "官转seedance-2.0全参"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
                    },
                    "resolution": {
                      "$lower": {
                        "$ref": "request.resolution"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "官转seedance-2.5全参"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
                    },
                    "resolution": {
                      "$lower": {
                        "$ref": "request.resolution"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "SD2.0满血稳定933-线路一"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
                    },
                    "resolution": {
                      "$lower": {
                        "$ref": "request.resolution"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "SD2.0满血稳定933-线路四"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
                    },
                    "resolution": {
                      "$lower": {
                        "$ref": "request.resolution"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "videos": {
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
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "SD2.0特价稳定903z"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "SD2.0mini特价稳定903z"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "SD2.5特价301010线路一"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
                    },
                    "resolution": {
                      "$lower": {
                        "$ref": "request.resolution"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "videos": {
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
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "wan3.0-video"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
                    },
                    "resolution": {
                      "$lower": {
                        "$ref": "request.resolution"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "audios": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "wan3.0-video特价1080"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
                    },
                    "reference_image_urls": {
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
                    "reference_audio_urls": {
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
                    }
                  }
                },
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "request.model"
                      },
                      "Minimax-h3-933特价"
                    ]
                  },
                  "then": {
                    "model": {
                      "$ref": "request.model"
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
                      "$ref": "request.aspectRatio"
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
                            "$ref": "media.value"
                          }
                        }
                      }
                    },
                    "videos": {
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
                    "audios": {
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
                    }
                  }
                }
              ],
              "default": {}
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
                    "$in": [
                      {
                        "$lower": {
                          "$coalesce": [
                            {
                              "$ref": "response.status"
                            },
                            {
                              "$ref": "response.data.status"
                            },
                            "queued"
                          ]
                        }
                      },
                      [
                        "completed",
                        "success",
                        "succeeded"
                      ]
                    ]
                  },
                  "then": "succeeded"
                },
                {
                  "when": {
                    "$in": [
                      {
                        "$lower": {
                          "$coalesce": [
                            {
                              "$ref": "response.status"
                            },
                            {
                              "$ref": "response.data.status"
                            },
                            "queued"
                          ]
                        }
                      },
                      [
                        "failed",
                        "failure",
                        "error"
                      ]
                    ]
                  },
                  "then": "failed"
                },
                {
                  "when": {
                    "$in": [
                      {
                        "$lower": {
                          "$coalesce": [
                            {
                              "$ref": "response.status"
                            },
                            {
                              "$ref": "response.data.status"
                            },
                            "queued"
                          ]
                        }
                      },
                      [
                        "in_progress",
                        "processing",
                        "running"
                      ]
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
                "$ref": "response.fail_reason"
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
