import { Blocks, CircleDollarSign, Clapperboard, Images, LibraryBig, ListTodo, PanelsTopLeft, Settings, WandSparkles } from "lucide-react";

export const navigationTools = [
    {
        slug: "create",
        label: "对话创作",
        icon: WandSparkles,
        section: "创作空间",
    },
    {
        slug: "projects",
        label: "短剧项目",
        icon: Clapperboard,
        section: "创作空间",
    },
    {
        slug: "canvas",
        label: "创作画布",
        icon: PanelsTopLeft,
        section: "创作空间",
    },
    {
        slug: "tasks",
        label: "任务记录",
        icon: ListTodo,
        section: "创作空间",
    },
    {
        slug: "assets",
        label: "素材库",
        icon: Images,
        section: "创作空间",
    },
    {
        slug: "skills",
        label: "技能库",
        icon: LibraryBig,
        section: "工作台管理",
    },
    {
        slug: "plugins",
        label: "插件中心",
        icon: Blocks,
        section: "工作台管理",
    },
    {
        slug: "wallet",
        label: "积分中心",
        icon: CircleDollarSign,
        section: "工作台管理",
    },
    {
        slug: "settings",
        label: "设置",
        icon: Settings,
        section: "工作台管理",
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
