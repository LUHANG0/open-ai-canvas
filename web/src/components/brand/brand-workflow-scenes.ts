export type WorkflowMedia = { image: string; video?: string };
export type WorkflowScene = { id: string; label: string; title: string; description: string; background: WorkflowMedia; nodes: { title: string; media: WorkflowMedia }[] };

// Public FLORA media reused at the user\'s request. Provenance stays in the source record; these scenes do not assert MengCeng model results.
export const WORKFLOW_SCENES: WorkflowScene[] = [
    {
        "id": "effects",
        "label": "视觉特效",
        "title": "同一场景，打开另一种现实。",
        "description": "让人物、环境与氛围沿着不同方向延伸。",
        "background": {
            "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/winter%20scene-poster.png",
            "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/vfx-bg.webm/ik-video.mp4"
        },
        "nodes": [
            {
                "title": "原始镜头",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/humanoid%20robot-poster.png?updatedAt=1759895220115",
                    "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/man%20walking%20on%20a%20trail.webm/ik-video.mp4"
                }
            },
            {
                "title": "机械生命",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/humanoid%20robot-poster.png?updatedAt=1759895220115",
                    "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/humanoid%20robot.webm/ik-video.mp4"
                }
            },
            {
                "title": "雪境",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/winter%20scene-poster.png?updatedAt=1759895292054",
                    "video": "https://ik.imagekit.io/ff5bkg98p/node-inputs/2025/9/8/10/04a31140-e53d-49ff-9568-4b851d2c7a17_D1mMSdMuj.mp4"
                }
            },
            {
                "title": "城市余烬",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/smoldering%20city-poster.png?updatedAt=1759895143467",
                    "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/smoldering%20city.webm/ik-video.mp4"
                }
            }
        ]
    },
    {
        "id": "fashion",
        "label": "时尚影像",
        "title": "让一套造型，有更多表达。",
        "description": "从服装与人物参考，探索视角和动态。",
        "background": {
            "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/model%20facing%20away%20(1).jpeg",
            "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/fashion-bg.webm/ik-video.mp4"
        },
        "nodes": [
            {
                "title": "服装参考",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(121).png?updatedAt=1759805505669"
                }
            },
            {
                "title": "人物背面",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/model%20facing%20away%20(1).jpeg?updatedAt=1759836465462"
                }
            },
            {
                "title": "转身镜头",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(121).png?updatedAt=1759805505669",
                    "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/fashion-bg.webm/ik-video.mp4"
                }
            }
        ]
    },
    {
        "id": "advertising",
        "label": "商业广告",
        "title": "把产品放进故事里。",
        "description": "连接人物、产品与场景，观察画面如何组合。",
        "background": {
            "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(106).webp",
            "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/advertising-bg.webm/ik-video.mp4"
        },
        "nodes": [
            {
                "title": "人物参考",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/woman%20in%20blazer.avif?updatedAt=1759895563251"
                }
            },
            {
                "title": "产品参考",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(104).webp?updatedAt=1759805505250"
                }
            },
            {
                "title": "组合画面",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(106).webp?updatedAt=1759805505480"
                }
            },
            {
                "title": "动态镜头",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(106).webp?updatedAt=1759805505480",
                    "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/advertising-bg.webm/ik-video.mp4"
                }
            }
        ]
    },
    {
        "id": "photography",
        "label": "产品摄影",
        "title": "为同一件作品，寻找不同光线。",
        "description": "材质、背景与构图，连接成一组视觉方向。",
        "background": {
            "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(107).png",
            "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/photography-bg.webm/ik-video.mp4"
        },
        "nodes": [
            {
                "title": "产品组合",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(105).png?updatedAt=1759805505289"
                }
            },
            {
                "title": "大理石",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(111).png?updatedAt=1759805505458"
                }
            },
            {
                "title": "丝绒",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(110).png?updatedAt=1759805505421"
                }
            },
            {
                "title": "材质方向",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(108).png?updatedAt=1759805505852"
                }
            },
            {
                "title": "影像方向",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(107).png?updatedAt=1759805505409"
                }
            }
        ]
    },
    {
        "id": "concept",
        "label": "概念设计",
        "title": "从一笔草图，走向一个世界。",
        "description": "保留构想，沿着材质与空间继续探索。",
        "background": {
            "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(119).png?updatedAt=1759805505768",
            "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/concepting-bg.webm/ik-video.mp4"
        },
        "nodes": [
            {
                "title": "初始草图",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(123).png?updatedAt=1759805505762"
                }
            },
            {
                "title": "木质",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(120).png?updatedAt=1759805505658"
                }
            },
            {
                "title": "石材",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(118).png?updatedAt=1759805505677"
                }
            },
            {
                "title": "玻璃",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(119).png?updatedAt=1759805505768"
                }
            }
        ]
    },
    {
        "id": "branding",
        "label": "品牌视觉",
        "title": "把一个想法，延展成视觉语言。",
        "description": "让符号、颜色与动态在同一个空间里建立联系。",
        "background": {
            "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/branding-poster.png",
            "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/branding-bg.webm/ik-video.mp4"
        },
        "nodes": [
            {
                "title": "视觉符号",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(122).png?updatedAt=1759805505509"
                }
            },
            {
                "title": "概念方向",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/branding-poster.png"
                }
            },
            {
                "title": "色彩参考",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(117).png?updatedAt=1759805505654"
                }
            },
            {
                "title": "动态元素",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/sprite%20sheet%20poster.png",
                    "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/sprite%20sheet.webm/ik-video.mp4"
                }
            }
        ]
    },
    {
        "id": "motion",
        "label": "动态影像",
        "title": "让标识，有自己的运动语言。",
        "description": "从平面标识与材质参考，探索三维形态和动态演绎。",
        "background": {
            "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(130).png?updatedAt=1759805505578",
            "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/motion-bg.webm/ik-video.mp4"
        },
        "nodes": [
            {
                "title": "标识参考",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(131).png?updatedAt=1759805505505"
                }
            },
            {
                "title": "三维液态材质",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(130).png?updatedAt=1759805505578"
                }
            },
            {
                "title": "标识动画",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(130).png?updatedAt=1759805505578",
                    "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/motion-bg.webm/ik-video.mp4"
                }
            }
        ]
    },
    {
        "id": "architecture",
        "label": "建筑空间",
        "title": "让空间，经历一天的光。",
        "description": "从建筑参考，探索不同时刻与环境。",
        "background": {
            "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/timelapse%20poster.png?updatedAt=1759896063528",
            "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/architecture-bg.webm/ik-video.mp4"
        },
        "nodes": [
            {
                "title": "建筑参考",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Image(113).webp?updatedAt=1759805506185"
                }
            },
            {
                "title": "日出",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/sunrise.png?updatedAt=1759896305410"
                }
            },
            {
                "title": "日落",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/sunset.png?updatedAt=1759896220653"
                }
            },
            {
                "title": "时间流动",
                "media": {
                    "image": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/timelapse%20poster.png?updatedAt=1759896063528",
                    "video": "https://ik.imagekit.io/ff5bkg98p/framer-website-assets/Videos/architecture-bg.webm/ik-video.mp4"
                }
            }
        ]
    }
];
