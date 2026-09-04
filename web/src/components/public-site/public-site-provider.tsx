import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getPublicSite, type PublicSiteConfig, type PublicSiteSetting } from "@/services/api/public-site";
import { BRAND_CONCEPT_SHOWCASES } from "@/lib/public-site-content";

const PUBLIC_SITE_CACHE_KEY = "infinite-canvas:public-site:v1";

export const DEFAULT_PUBLIC_SITE_CONFIG: PublicSiteConfig = {
    hero: {
        eyebrow: "AI FILM PRODUCTION OS",
        title: "让故事开机。",
        description: "组织故事、角色与分镜，在一个工作台推进你的 AI 影视创作。",
        primaryCta: "受邀登录",
        secondaryCta: "探索创作示例",
        showreelUrl: "",
        posterUrl: "",
        showreelLabel: "《最后一班》 / 品牌概念视觉",
    },
    sections: {
        productTitle: "让灵感有位置，\n让创作有连续性。",
        productDescription: "故事、参考、镜头和版本，在同一创作空间里相遇。从全局梳理，到一帧一帧打磨。",
        workflowTitle: "一个故事，\n一步步成为画面。",
        workflowDescription: "先把故事说清，再把每个镜头想明白。角色、场景与参考，跟随作品一起向前。",
        showcaseTitle: "创作正在发生。",
        showcaseDescription: "展示真实制作路径、产品能力与可公开作品。",
        aboutTitle: "为真正的影视生产而设计。",
        aboutDescription: "支持本地部署、数据自主、多模型接入和可扩展 Agent，让创作者掌握自己的工作流。",
    },
    showcases: BRAND_CONCEPT_SHOWCASES,
    links: { docsUrl: "", repositoryUrl: "", deploymentUrl: "/about#deployment", contactUrl: "", icpText: "", icpUrl: "https://beian.miit.gov.cn/" },
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
    // Revision zero is the unconfigured server default; use this frontend's matching launch content.
    if (candidate.revision === 0) return DEFAULT_PUBLIC_SITE;
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
