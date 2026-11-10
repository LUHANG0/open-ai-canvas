# FoxRouter 接口合同

## 认证、分组和计费

使用 HTTPS `https://foxrouter.org` 与 `Authorization: Bearer <apiKey>`，不使用官网展示的未加密海外入口。每把密钥绑定实际分组，渠道分别隔离。分组名称中的旧倍率不能作为成本：读取官网当前 `group_ratio`，再与实际密钥分组匹配。

聊天成本按每百万 Token 的输入、输出和缓存读取分别配置：输入为 `model_ratio × 2 × group_ratio`，输出再乘 `completion_ratio`，缓存读取再乘 `cache_ratio`。售价分别为成本加 20%。缓存命中沿用宿主 usage 处理，避免重复计算。当前 Chat Completions 不主动写入 Anthropic 缓存控制指令。以后如接入缓存创建或动态计费，应先扩展结算合同，不能把未支持的计价隐藏在固定档内。

生图当前每次提交一张，成本来自模型公开 `model_price × 实际分组倍率`，售价成本加 0.05 后向上取两位小数。GPT 文档虽允许 n=1–10，本插件初版限制为一张，避免上游按次、宿主按张产生批量计费歧义。多张参考图不等于多张输出。

## 聊天与 Agent

`POST /v1/chat/completions`，普通聊天保留系统指令、历史和当前提示词；`streamingFormat=chat-completion` 复用宿主 SSE 解析和 usage。Agent 合并宿主构造的 chatCompletion，并强制覆盖为管理员配置的实际 model，保留 tools、tool_choice、工具调用 ID 与工具结果。工具权限和审批仍由宿主负责。

模型白名单对应 2026-11-05 的公开聊天目录；图片、视频模型不能通过聊天协议调用。普通调用默认 max_tokens=8192，可由宿主或命名空间中的已声明参数覆盖。文档声明的 Chat Completions 可选字段按清单白名单发送；不透传任意 extra_body、路由 provider 或 transforms。暂未提供独立 Responses、Anthropic Messages 或 Gemini 原生文本协议。

## GPT 图片

`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`：无参考图为 `POST /v1/images/generations` JSON；有参考图为 `POST /v1/images/edits` multipart。每张图片使用重复 `image` 文件字段，按 order 排序，宿主安全读取 HTTPS 图片或 PNG/JPEG/WebP Base64 为文件。禁止发送无效的 JSON `image_urls` 或 `images` 代替 multipart 文件。

支持 `model`、`prompt`、n=1、size 为 auto / 1024x1024 / 1536x1024 / 1024x1536，以及独立 quality=auto/low/medium/high。最多四张参考图；当前不开放蒙版、独立 2K/4K、视频或音频参考。不能将另一渠道同名模型的分辨率配置套过来。

## Gemini / Banana 图片

三种型号 `gemini-3-pro-image`、`gemini-3.1-flash-image`、`gemini-nano-banana-2.1` 均使用 `POST /v1/images/generations` JSON，不能仅凭 Gemini 前缀切换原生 generateContent。发送 `model`、`prompt`、`aspect_ratio`、大写 `image_size=1K/2K/4K`；参考图以 `image_urls` HTTPS 地址数组传入，最多六张，按 order 排序。当前未暴露 seed 与 previous_request_id，不从别的密钥或账号续接请求。

图片响应遍历 `data[]`，支持 url / b64_json，结果交由宿主下载并持久化。保留业务错误与 HTTP 失败，创建请求不自动重发。

## 视频边界与上线

目前官网仅列 `gemini-omni-flash`，创建为 JSON `POST /v1/videos`，duration 为秒，image_urls 为参考图。2026-11-05 的文档价格为 0.086/次，但实时价格接口为固定 tier 表达式 0.6/次，且官方对应分组成功率很低；公开文档未给完整查询与下载合同。本版不猜测轮询接口，不贡献视频 Provider，也不将此线路上线。需取得完整合同与稳定性依据后再接入。

官网性能数据为观察依据，不等于梦层真实调用验收。只有在目标渠道密钥可访问模型、能力和价格报价核对通过后才启用通过筛选的型号；不稳定或观察不足型号保持隐藏。协议夹具测试、免扣费目录/报价和真实收费生成分别记录。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "foxrouter",
  "name": "FoxRouter API",
  "version": "1.0.0",
  "author": "梦层 MengCeng",
  "description": "FoxRouter 独立声明式协议：聊天、Agent、GPT multipart 改图及 Gemini 多参考图生图。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "FoxRouter 分组密钥",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "foxrouter-chat",
        "label": "FoxRouter Chat Completions",
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
        "baseUrl": "https://foxrouter.org",
        "requiresPublicMediaUrls": false,
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
            "description": "上游模型 ID。"
          },
          {
            "name": "messages",
            "type": "message[]",
            "required": true,
            "mapping": "provider message container",
            "description": "包含历史消息和当前用户输入。"
          },
          {
            "name": "instructions",
            "type": "string",
            "required": false,
            "mapping": "system/instructions",
            "description": "系统指令。"
          },
          {
            "name": "temperature",
            "type": "number",
            "required": false,
            "mapping": "temperature",
            "description": "采样温度。"
          },
          {
            "name": "top_p",
            "type": "number",
            "required": false,
            "mapping": "top_p",
            "description": "核采样参数。"
          },
          {
            "name": "max_tokens",
            "type": "integer",
            "required": false,
            "mapping": "max_tokens/max_output_tokens",
            "description": "最大输出 token。"
          },
          {
            "name": "tools",
            "type": "array",
            "required": false,
            "mapping": "tools/toolConfig",
            "description": "工具定义。"
          },
          {
            "name": "tool_choice",
            "type": "object|string",
            "required": false,
            "mapping": "tool_choice",
            "description": "工具选择策略。"
          },
          {
            "name": "response_format",
            "type": "object",
            "required": false,
            "mapping": "response_format/text",
            "description": "结构化输出配置。"
          },
          {
            "name": "stream",
            "type": "boolean",
            "required": false,
            "mapping": "stream",
            "description": "流式开关；后台任务当前以最终响应归一。"
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
                "$ref": "request.providerOptions.foxrouter-chat.temperature"
              }
            },
            "top_p": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.foxrouter-chat.top_p"
              }
            },
            "max_tokens": {
              "$coalesce": [
                {
                  "$ref": "request.extra.max_tokens"
                },
                {
                  "$ref": "request.providerOptions.foxrouter-chat.max_tokens"
                },
                8192
              ]
            },
            "tools": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.foxrouter-chat.tools"
              }
            },
            "tool_choice": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.foxrouter-chat.tool_choice"
              }
            },
            "response_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.foxrouter-chat.response_format"
              }
            },
            "stream": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.foxrouter-chat.stream"
              }
            },
            "reasoning_effort": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.foxrouter-chat.reasoning_effort"
              }
            },
            "parallel_tool_calls": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.foxrouter-chat.parallel_tool_calls"
              }
            },
            "stream_options": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.foxrouter-chat.stream_options"
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
        "streamingFormat": "chat-completion",
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "claude-fable-5",
                  "claude-fable-5-1",
                  "claude-fable-5.1",
                  "claude-haiku-5-5",
                  "claude-opus-4-5",
                  "claude-opus-4-6",
                  "claude-opus-4-6-thinking",
                  "claude-opus-4-7",
                  "claude-opus-4-8",
                  "claude-opus-5",
                  "claude-opus-5-5",
                  "claude-sonnet-4-5",
                  "claude-sonnet-4-6",
                  "claude-sonnet-4-6-thinking",
                  "claude-sonnet-5",
                  "claude-sonnet-5-5",
                  "deepseek-v3.2",
                  "deepseek-v4-flash-0731",
                  "deepseek-v4-flash-vision-exp",
                  "deepseek-v4-pro",
                  "deepseek-v4-pro-0813",
                  "deepseek-v4.1-flash",
                  "deepseek-v4.1-flash-1017",
                  "gemini-3.1-pro-preview",
                  "gemini-3.6-flash",
                  "gemini-3.7-flash",
                  "gemini-3.8-flash",
                  "gemini-4-argon",
                  "glm-5.1",
                  "glm-5.2",
                  "glm-5.3",
                  "glm-5.3-flash",
                  "glm-5.3-flashx",
                  "gpt-5.6-luna",
                  "gpt-5.6-sol",
                  "gpt-5.6-terra",
                  "gpt-6-astra",
                  "gpt-6-luna",
                  "gpt-6-sol",
                  "gpt-6.1-sol",
                  "gpt-6.1-terra",
                  "grok-4.5",
                  "grok-4.6",
                  "grok-4.7",
                  "hy3",
                  "hy4-preview",
                  "kimi-k2.6",
                  "kimi-k2.7-code",
                  "kimi-k2.8",
                  "kimi-k3",
                  "kimi-k3.1-pro",
                  "mimo-v2.5",
                  "mimo-v2.6-flash",
                  "mimo-v2.6-pro",
                  "minimax-m3",
                  "minimax-m3.1-flash",
                  "qwen3.7-max",
                  "qwen3.8-flash",
                  "qwen3.8-max",
                  "qwen3.8-max-0902"
                ]
              ]
            },
            "message": "FoxRouter：请选择当前开放的聊天型号；图片和视频不能使用聊天协议"
          }
        ]
      },
      {
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://foxrouter.org",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "id": "foxrouter-gpt-image",
        "label": "FoxRouter GPT Images",
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
            "values": [
              "1024x1024",
              "1536x1024",
              "1024x1536"
            ],
            "default": "1024x1024",
            "pricing": true
          },
          {
            "name": "quality",
            "label": "图片质量",
            "type": "string",
            "binding": "quality",
            "values": [
              "auto",
              "low",
              "medium",
              "high"
            ],
            "default": "auto",
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
            "message": "FoxRouter：请填写当前令牌可用的模型 ID"
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
            "message": "FoxRouter：提示词不能为空"
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
            "message": "FoxRouter：GPT 参考图必须为 HTTPS 地址或 PNG/JPEG/WebP Base64 图片"
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
            "message": "FoxRouter：统一生图接口没有声明蒙版，请移除蒙版"
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
            "message": "FoxRouter：生图不接受视频或音频参考"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.imageCount"
                },
                [
                  0,
                  1
                ]
              ]
            },
            "message": "FoxRouter：每次提交一张图片，避免按次与按张计费歧义"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "gpt-image-2.5-flare",
                  "gpt-image-2.5-sunburst"
                ]
              ]
            },
            "message": "FoxRouter：GPT 图片协议仅支持 flare 和 sunburst"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                4
              ]
            },
            "message": "FoxRouter：GPT 生图最多四张参考图"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.aspectRatio"
                },
                [
                  "",
                  "auto",
                  "1024x1024",
                  "1536x1024",
                  "1024x1536"
                ]
              ]
            },
            "message": "FoxRouter：GPT 图片仅支持文档声明的三个像素尺寸或 auto"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.quality"
                },
                [
                  "",
                  "auto",
                  "low",
                  "medium",
                  "high"
                ]
              ]
            },
            "message": "FoxRouter：GPT 图片质量须为 auto、low、medium 或 high"
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
                  "",
                  "1k"
                ]
              ]
            },
            "message": "FoxRouter：GPT 图片未声明独立 2K/4K 档位"
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
                "$ref": "request.quality"
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
        "id": "foxrouter-gemini-image",
        "label": "FoxRouter Gemini Images",
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
        "baseUrl": "https://foxrouter.org",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅",
            "type": "string",
            "binding": "aspectRatio",
            "encoding": "ratio",
            "values": [
              "1:1",
              "16:9",
              "9:16",
              "4:3",
              "3:4",
              "3:2",
              "2:3",
              "21:9"
            ],
            "default": "1:1",
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
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "gemini-3-pro-image",
                  "gemini-3.1-flash-image",
                  "gemini-nano-banana-2.1"
                ]
              ]
            },
            "message": "FoxRouter：请选择当前开放的 Gemini 生图型号"
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
            "message": "FoxRouter：提示词不能为空"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                6
              ]
            },
            "message": "FoxRouter：Gemini 生图最多六张参考图"
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
            "message": "FoxRouter：Gemini 参考图必须为公网 HTTPS 图片地址"
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
            "message": "FoxRouter：统一生图接口没有声明蒙版，请移除蒙版"
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
            "message": "FoxRouter：生图不接受视频或音频参考"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.imageCount"
                },
                [
                  0,
                  1
                ]
              ]
            },
            "message": "FoxRouter：每次提交一张图片，避免按次与按张计费歧义"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.aspectRatio"
                },
                [
                  "",
                  "1:1",
                  "16:9",
                  "9:16",
                  "4:3",
                  "3:4",
                  "3:2",
                  "2:3",
                  "21:9"
                ]
              ]
            },
            "message": "FoxRouter：请选择文档支持的画幅"
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
                  "",
                  "1k",
                  "2k",
                  "4k"
                ]
              ]
            },
            "message": "FoxRouter：请选择 1K、2K 或 4K 分辨率"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/images/generations",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "aspect_ratio": {
              "$coalesce": [
                {
                  "$ref": "request.aspectRatio"
                },
                "1:1"
              ]
            },
            "image_size": {
              "$upper": {
                "$coalesce": [
                  {
                    "$ref": "request.resolution"
                  },
                  "1k"
                ]
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
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
