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
    title: "让想象，\n不止于想象。",
    description: "梦层 · AI 影像创作",
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
            items: [item("写下灵感", "", "/create"), item("展开画布", "", "/canvas"), item("推进作品", "", "/projects")],
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
            visible: false,
            items: [
                item("没有创作经验，也能开始吗？", "可以从一句话或一组参考开始，逐步探索故事和画面。"),
                item("模型生成如何收费？", "以工作台实际配置和提交前的提示为准。"),
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
