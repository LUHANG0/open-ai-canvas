// label 是中文源文案（用于搜索与兜底），界面显示用 labelKey 经 i18n 翻译。
import { Blocks, CircleDollarSign, Clapperboard, Images, LibraryBig, ListTodo, PanelsTopLeft, Settings, PenTool, WandSparkles, ShoppingBag } from "lucide-react";

export const navigationTools = [
    {
        slug: "create",
        label: "对话创作",
        icon: WandSparkles,
        section: "创作空间",
    },
    { slug: "ecommerce", label: "电商创作", icon: ShoppingBag, section: "创作空间" },
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
        labelKey: "nav.tools.skills",
        icon: LibraryBig,
        section: "工作台管理",
    },
    {
        slug: "plugins",
        label: "插件中心",
        labelKey: "nav.tools.plugins",
        icon: Blocks,
        section: "工作台管理",
    },
    {
        slug: "wallet",
        label: "积分中心",
        labelKey: "nav.tools.wallet",
        icon: CircleDollarSign,
        section: "工作台管理",
    },
    {
        slug: "settings",
        label: "设置",
        labelKey: "nav.tools.settings",
        icon: Settings,
        section: "工作台管理",
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
