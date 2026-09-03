import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getPublicSite, type PublicSiteConfig, type PublicSiteSetting } from "@/services/api/public-site";

const PUBLIC_SITE_CACHE_KEY = "infinite-canvas:public-site:v1";

export const DEFAULT_PUBLIC_SITE_CONFIG: PublicSiteConfig = {
    hero: {
        eyebrow: "AI FILM PRODUCTION OS",
        title: "让故事开机。",
        description: "从剧本、角色、分镜到成片，在一个工作台完成 AI 影视创作。",
        primaryCta: "开始创作",
        secondaryCta: "查看作品",
        showreelUrl: "",
        posterUrl: "",
        showreelLabel: "YINGCE SHOWREEL · 01",
    },
    sections: {
        productTitle: "不是一个生成器，\n是一套制作系统。",
        productDescription: "把创意、资产、镜头、模型与交付放在同一条生产线上，让每次生成都回到项目上下文。",
        workflowTitle: "从故事到成片，\n每一步都连续。",
        workflowDescription: "创作过程不再散落在不同工具和聊天记录里，角色、场景、镜头与结果始终属于同一个项目。",
        showcaseTitle: "创作正在发生。",
        showcaseDescription: "展示真实制作路径、产品能力与可公开作品。",
        aboutTitle: "为真正的影视生产而设计。",
        aboutDescription: "支持本地部署、数据自主、多模型接入和可扩展 Agent，让创作者掌握自己的工作流。",
    },
    showcases: [
        { id: "story-to-screen", title: "故事到分镜", category: "短剧生产", description: "从章节、角色与场景设定开始，连续生成可执行的分镜脚本。", coverUrl: "", videoUrl: "", externalUrl: "" },
        { id: "director-canvas", title: "导演台与自由画布", category: "视觉编排", description: "在镜头工作台与无限画布之间组织参考、提示词和生成结果。", coverUrl: "", videoUrl: "", externalUrl: "" },
        { id: "generation-delivery", title: "生成到交付", category: "成片制作", description: "统一跟踪图片、视频和音频任务，并把镜头结果整理为可交付文件。", coverUrl: "", videoUrl: "", externalUrl: "" },
    ],
    links: { docsUrl: "", repositoryUrl: "https://github.com/LUHANG0/open-ai-canvas", deploymentUrl: "/about#deployment", contactUrl: "", icpText: "" },
    seo: {
        homeTitle: "影策｜AI 影视与短剧创作工作台",
        homeDescription: "影策是一套从故事、角色、分镜到成片交付的 AI 影视创作工作台。",
        productTitle: "产品能力｜影策",
        showcaseTitle: "作品与案例｜影策",
        aboutTitle: "关于影策｜影策",
    },
};

const DEFAULT_PUBLIC_SITE: PublicSiteSetting = { revision: 0, config: DEFAULT_PUBLIC_SITE_CONFIG };

type PublicSiteContextValue = {
    site: PublicSiteSetting;
    refresh: () => Promise<void>;
    refreshing: boolean;
};

const PublicSiteContext = createContext<PublicSiteContextValue | null>(null);

export function PublicSiteProvider({ children }: { children: ReactNode }) {
    const [site, setSite] = useState(readCachedPublicSite);
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const next = normalizePublicSite(await getPublicSite());
            setSite(next);
            try {
                window.localStorage.setItem(PUBLIC_SITE_CACHE_KEY, JSON.stringify(next));
            } catch {
                // Public content still renders from memory when storage is restricted.
            }
        } catch {
            // Public marketing content must not block login or the application shell.
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const value = useMemo(() => ({ site, refresh, refreshing }), [refresh, refreshing, site]);
    return <PublicSiteContext.Provider value={value}>{children}</PublicSiteContext.Provider>;
}

export function usePublicSite() {
    const value = useContext(PublicSiteContext);
    if (!value) throw new Error("usePublicSite must be used within PublicSiteProvider");
    return value;
}

function readCachedPublicSite() {
    if (typeof window === "undefined") return DEFAULT_PUBLIC_SITE;
    try {
        return normalizePublicSite(JSON.parse(window.localStorage.getItem(PUBLIC_SITE_CACHE_KEY) || "null"));
    } catch {
        return DEFAULT_PUBLIC_SITE;
    }
}

function normalizePublicSite(value: unknown): PublicSiteSetting {
    if (!value || typeof value !== "object") return DEFAULT_PUBLIC_SITE;
    const candidate = value as Partial<PublicSiteSetting>;
    if (typeof candidate.revision !== "number" || !candidate.config || typeof candidate.config.hero?.title !== "string") return DEFAULT_PUBLIC_SITE;
    return {
        revision: candidate.revision,
        config: {
            ...DEFAULT_PUBLIC_SITE_CONFIG,
            ...candidate.config,
            hero: { ...DEFAULT_PUBLIC_SITE_CONFIG.hero, ...candidate.config.hero },
            sections: { ...DEFAULT_PUBLIC_SITE_CONFIG.sections, ...candidate.config.sections },
            links: { ...DEFAULT_PUBLIC_SITE_CONFIG.links, ...candidate.config.links },
            seo: { ...DEFAULT_PUBLIC_SITE_CONFIG.seo, ...candidate.config.seo },
            showcases: Array.isArray(candidate.config.showcases) ? candidate.config.showcases : DEFAULT_PUBLIC_SITE_CONFIG.showcases,
        },
    };
}
