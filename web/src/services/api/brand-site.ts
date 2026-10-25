import { http, apiBaseURL } from "./request";
export type BrandMedia = { resourceId: string; kind: "image" | "video" | ""; alt: string; posterId: string };
export type BrandItem = { title: string; description: string; link: string; media: BrandMedia };
export type BrandSection = { id: "process" | "entries" | "examples" | "faq"; title: string; description: string; visible: boolean; items: BrandItem[] };
export type BrandContent = {
    storyTitle: string;
    storyText: string;
    storyCaption: string;
    title: string;
    description: string;
    detail: string;
    primaryLabel: string;
    primaryLink: string;
    secondaryLabel: string;
    heroMedia: BrandMedia;
    sections: BrandSection[];
    footer: string;
};
export type BrandSiteState = { revision: number; draft: BrandContent; published: BrandContent; previous: BrandContent | null; publishedAt: string | null; draftSavedAt: string | null };
export const emptyBrandMedia = (): BrandMedia => ({ resourceId: "", kind: "", alt: "", posterId: "" });
const item = (title: string, description: string, link = ""): BrandItem => ({ title, description, link, media: emptyBrandMedia() });
export const DEFAULT_BRAND_CONTENT: BrandContent = {
    storyTitle: "一个不可能的场景",
    storyText: "她站在盐原上。\n天空悬着一片海。\n下一刻，故事开始了。",
    storyCaption: "盐原与巨浪 · AI 品牌创意示意",
    title: "把灵感，\n推进成画面。",
    description: "面向独立创作者与小型团队的 AI 影像创作工作台。",
    detail: "",
    primaryLabel: "开始创作",
    primaryLink: "/create",
    secondaryLabel: "",
    heroMedia: emptyBrandMedia(),
    footer: "下一幕，由你开始。",
    sections: [
        { id: "examples", title: "每一种想象，都有画面。", description: "", visible: true, items: [item("叙事", ""), item("人物", ""), item("世界", "")] },
        {
            id: "entries",
            title: "从第一句，到最后一镜。",
            description: "",
            visible: true,
            items: [item("AI 视频创作", "描述画面，带入参考素材，在对话中生成镜头、继续调整。", "/create?mode=video"), item("创作画布", "把文字、图片与视频放在同一张画布上，连接思路与创作素材。", "/canvas"), item("短剧项目", "围绕章节、角色与分镜组织故事，让每个镜头都有清晰的位置。", "/projects")],
        },
        {
            id: "process",
            title: "一个想法，逐渐有了画面。",
            description: "从一句话出发，保留探索的过程，也保留你的判断。",
            visible: false,
            items: [
                item("写下那一幕", "红衣女子站在盐原上，仰望悬在天空的巨浪。"),
                item("找到角色与世界", "风吹起她的黑发。人物、光线与世界开始有了联系。"),
                item("把故事拆成镜头", "盐原远景，人物的目光，指尖触碰浅水。把一个场景展开成镜头。"),
                item("向影像再走一步", "在画布中组织参考，再把素材带进项目，继续打磨。"),
            ],
        },
        {
            id: "faq",
            title: "常见问题",
            description: "",
            visible: true,
            items: [
                item("没有创作经验，也能开始吗？", "可以从一句话或一组参考开始，逐步探索故事和画面。"),
                item("如何加入梦层？", "已有账号可直接登录；受邀用户可打开邀请链接或输入邀请码。注册入口以页面当前显示为准。"),
                item("对话记录可以跨设备继续吗？", "登录后，对话创作历史会按账号同步。其他内容请以工作台显示的保存状态为准。"),
                item("模型生成如何收费？", "以工作台实际配置和提交前的提示为准。"),
                item("梦层会一键自动成片吗？", "当前工作台提供对话、画布与项目工具，素材筛选和作品打磨仍由创作者决定。"),
                item("可以从自己的参考素材开始吗？", "可以在支持的创作入口添加参考素材，具体格式和限制以工作台提示为准。"),
            ],
        },
    ],
};
export async function getBrandSite(signal?: AbortSignal) {
    return (await http.get<{ content: BrandContent }>("/public/brand-site", { signal })).content;
}
export async function getAdminBrandSite() {
    return (await http.get<{ setting: BrandSiteState }>("/admin/settings/brand-site")).setting;
}
export async function changeBrandSite(action: "draft" | "publish" | "restore", revision: number, content?: BrandContent) {
    return (await http.post<{ setting: BrandSiteState }>(`/admin/settings/brand-site/${action}`, { revision, content })).setting;
}
export function brandMediaURL(id: string, preview = false) {
    return `${apiBaseURL.replace(/\/$/, "")}/${preview ? "admin/settings" : "public"}/brand-site/media/${encodeURIComponent(id)}`;
}
