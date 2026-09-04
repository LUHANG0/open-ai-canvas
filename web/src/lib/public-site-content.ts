import type { PublicSiteShowcaseItem } from "@/services/api/public-site";

export const BRAND_CONCEPT_POSTER = "/brand/last-train-wide.webp";

export const BRAND_CONCEPT_SHOWCASES: PublicSiteShowcaseItem[] = [
    { id: "brand-concept-arrival", title: "最后一班 · 抵达", category: "品牌概念视觉 / 01", description: "暮色落进山谷。一个旅人，赶往尚未熄灯的站台。", coverUrl: BRAND_CONCEPT_POSTER, videoUrl: "", externalUrl: "" },
    { id: "brand-concept-traveler", title: "最后一班 · 等候", category: "品牌概念视觉 / 02", description: "一张旧车票，一束车窗里的暖光。故事在细节里发生。", coverUrl: "/brand/last-train-traveler.webp", videoUrl: "", externalUrl: "" },
    { id: "brand-concept-departure", title: "最后一班 · 出发", category: "品牌概念视觉 / 03", description: "列车穿过薄雾，把没有说完的故事带向远方。", coverUrl: "/brand/last-train-departure.webp", videoUrl: "", externalUrl: "" },
];

export function publicEntryLabel(signedIn: boolean) {
    return signedIn ? "进入工作台" : "受邀登录";
}
