import { Image as ImageIcon, Video } from "lucide-react";
import type { ComponentType } from "react";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import type { FeatureAvailability } from "@/stores/use-user-store";

export type WorkspaceNavItem = {
    id: string;
    title: string;
    icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
    to: string;
};

function toolItem(slug: NavigationToolSlug, to: string): WorkspaceNavItem {
    const tool = navigationTools.find((item) => item.slug === slug);
    return { id: slug, title: tool?.label ?? slug, icon: tool?.icon, to };
}

export function buildWorkspaceNav(features: FeatureAvailability) {
    return [
        {
            heading: "创作入口",
            primary: true,
            items: [
                { ...toolItem("create", "/create"), id: "home" },
                ...(features.imageWorkbenchEnabled ? [{ id: "toolbox-image", title: "图片生成", icon: ImageIcon, to: "/toolbox/image" }] : []),
                ...(features.videoWorkbenchEnabled ? [{ id: "toolbox-video", title: "视频生成", icon: Video, to: "/toolbox/video" }] : []),
                toolItem("canvas", "/canvas"),
            ],
        },
        {
            heading: "项目与素材",
            primary: false,
            items: [
                toolItem("projects", "/projects"),
                toolItem("assets", "/assets"),
                ...(features.taskCenterEnabled ? [toolItem("tasks", "/tasks")] : []),
            ],
        },
        {
            heading: "能力扩展",
            primary: false,
            items: [
                toolItem("skills", "/skills"),
                ...(features.pluginCenterEnabled ? [toolItem("plugins", "/plugins")] : []),
            ],
        },
    ];
}
