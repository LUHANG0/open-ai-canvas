import { Popover } from "antd";
import { motion, type Transition } from "motion/react";
import { ChevronDown, CircleUserRound, Infinity as InfinityIcon, PanelLeftClose, PanelLeftOpen, Search, Image as ImageIcon, Video } from "lucide-react";
import { useImperativeHandle, useRef, type ComponentType, type Ref } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

import { BrandLogoFrame } from "@/components/brand/brand-logo";
import { UserAvatar } from "@/components/layout/user-avatar";
import { Tooltip } from "@/components/ui/base/tooltip";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { preloadWorkspaceRoute } from "@/lib/workspace-route-modules";
import { authEntry } from "@/lib/auth-navigation";
import { useUserStore, type FeatureAvailability } from "@/stores/use-user-store";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { WorkspaceAccountCard } from "./workspace-account-card";
import { WorkspaceSidebarCheckin } from "./workspace-sidebar-checkin";
import { WorkspaceSidebarStorageMeter } from "./workspace-sidebar-storage-meter";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import "./workspace-sidebar-nav.css";

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
                toolItem("projects", "/projects"),
                toolItem("canvas", "/canvas"),
            ],
        },
        {
            heading: "素材与记录",
            primary: false,
            items: [
                toolItem("assets", "/assets"),
                ...(features.taskCenterEnabled ? [toolItem("tasks", "/tasks")] : []),
            ],
        },
        {
            heading: "工具",
            primary: false,
            items: [
                ...(features.imageWorkbenchEnabled ? [{ id: "toolbox-image", title: "图片生成", icon: ImageIcon, to: "/toolbox/image" }] : []),
                ...(features.videoWorkbenchEnabled ? [{ id: "toolbox-video", title: "视频生成", icon: Video, to: "/toolbox/video" }] : []),
                toolItem("skills", "/skills"),
                ...(features.pluginCenterEnabled ? [toolItem("plugins", "/plugins")] : []),
            ],
        },
    ];
}

// Image and video tools share a URL prefix but keep independent active states.
export function workspaceNavActiveId(pathname: string, section?: string | null) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] === "toolbox" && segments[1]) return `toolbox-${segments[1]}`;
    const slug = segments[0] || "home";
    if (slug === "create") return "home";
    return slug === "settings" && section ? `settings:${section}` : slug;
}

const compactTitles: Record<string, string> = {
    home: "对话",
    projects: "短剧",
    canvas: "画布",
    assets: "素材",
    tasks: "任务",
    skills: "技能",
    plugins: "插件",
    "toolbox-image": "生图",
    "toolbox-video": "视频",
};

function NavItem({ item, active, collapsed, onNavigate, layoutTransition }: { item: WorkspaceNavItem; active: boolean; collapsed: boolean; onNavigate: () => void; layoutTransition?: Transition }) {
    const Icon = item.icon;
    const linkTo = item.to;
    return <motion.li layout={layoutTransition ? "position" : false} initial={false} transition={{ layout: layoutTransition }}>
        <Tooltip title={collapsed ? item.title : undefined} placement="right">
            <Link
                to={linkTo}
                className={cn("workspace-navigation-link", active && "is-active")}
                data-nav-id={item.id}
                aria-label={collapsed ? item.title : undefined}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                onFocus={() => preloadWorkspaceRoute(linkTo)}
                onPointerDown={() => preloadWorkspaceRoute(linkTo)}
                onPointerEnter={() => preloadWorkspaceRoute(linkTo)}
            >
                {Icon ? <span className="workspace-navigation-icon" aria-hidden="true"><Icon strokeWidth={1.7} /></span> : null}
                <span className="workspace-navigation-label">{collapsed ? compactTitles[item.id] || item.title : item.title}</span>
            </Link>
        </Tooltip>
    </motion.li>;
}

export function WorkspaceSidebarNav({ collapsed, onNavigate, onOpenSearch, onExpand, onCollapse, accountOpen, onAccountOpenChange, accountTriggerRef, layoutTransition }: { collapsed: boolean; onNavigate: () => void; onOpenSearch: () => void; onExpand: () => void; onCollapse: () => void; accountOpen: boolean; onAccountOpenChange: (open: boolean) => void; accountTriggerRef: Ref<HTMLButtonElement>; layoutTransition?: Transition }) {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const features = useUserStore((state) => state.features);
    const user = useUserStore((state) => state.user);
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const accountButtonRef = useRef<HTMLButtonElement>(null);
    useImperativeHandle(accountTriggerRef, () => accountButtonRef.current!, [Boolean(user)]);
    const activeId = workspaceNavActiveId(location.pathname, searchParams.get("section"));
    const profileName = user?.displayName || user?.username || "登录";

    const accountContent = <div className="workspace-navigation-account-panel" data-workspace-account-menu="sidebar" onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        onAccountOpenChange(false);
        accountButtonRef.current?.focus({ preventScroll: true });
    }}>
        <WorkspaceAccountCard onNavigate={() => { onAccountOpenChange(false); onNavigate(); }} onWallet={() => { onAccountOpenChange(false); accountButtonRef.current?.focus({ preventScroll: true }); openWorkspaceWallet(); }} />
        <div className="workspace-navigation-account-status" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) { onAccountOpenChange(false); onNavigate(); } }}>
            <WorkspaceSidebarCheckin collapsed={false} />
            <WorkspaceSidebarStorageMeter collapsed={false} />
        </div>
    </div>;

    return <motion.div layout={layoutTransition ? "position" : false} initial={false} transition={{ layout: layoutTransition }} className={cn("workspace-navigation", collapsed && "is-collapsed")}>
        <header className="workspace-navigation-header">
            <Tooltip title={collapsed ? `${brandName}首页` : undefined} placement="right">
                <Link to="/" onClick={onNavigate} className="workspace-navigation-brand" aria-label={`${brandName}首页`}>
                    <BrandLogoFrame className="workspace-navigation-mark" logoClassName="size-full object-contain" alt="" fallback={<InfinityIcon aria-hidden="true" />} />
                    <span className="workspace-navigation-wordmark">{brandName}</span>
                </Link>
            </Tooltip>
        </header>

        <div className="workspace-navigation-search-area">
            <Tooltip title={collapsed ? "搜索页面或操作" : undefined} placement="right">
                <button type="button" className="workspace-navigation-search" onClick={onOpenSearch} aria-label="搜索页面或操作" aria-keyshortcuts="Meta+K Control+K" aria-haspopup="dialog">
                    <Search aria-hidden="true" /><span className="workspace-navigation-label">搜索</span><kbd aria-hidden="true">⌘ K</kbd>
                </button>
            </Tooltip>
        </div>

        <nav id="workspace-navigation-links" className="workspace-navigation-scroll" aria-label="工作区导航">
            {buildWorkspaceNav(features).map((group) => <section key={group.heading} className={cn("workspace-navigation-group", group.primary && "is-primary")} aria-label={group.heading}>
                {!group.primary ? <div className="workspace-navigation-heading" aria-hidden="true">{group.heading}</div> : null}
                <ul className="workspace-navigation-links">
                    {group.items.map((item) => <NavItem key={item.id} item={item} active={activeId === item.id} collapsed={collapsed} onNavigate={onNavigate} layoutTransition={layoutTransition} />)}
                </ul>
            </section>)}
        </nav>

        <footer className="workspace-navigation-footer">
            {user ? <Popover open={accountOpen} onOpenChange={onAccountOpenChange} trigger="click" placement="topLeft" arrow={false} rootClassName="workspace-account-popover" getPopupContainer={(trigger) => trigger.closest<HTMLElement>('[role="dialog"]') || document.body} content={accountContent}>
                <button ref={accountButtonRef} type="button" className="workspace-navigation-account" aria-label="打开账户菜单" aria-expanded={accountOpen} title={profileName}>
                    <UserAvatar user={user} className="workspace-navigation-avatar" />
                    <span className="workspace-navigation-account-label" aria-hidden="true">账户</span>
                    <span className="workspace-navigation-account-copy"><strong>{profileName}</strong></span>
                    <ChevronDown className="workspace-navigation-account-chevron" aria-hidden="true" />
                </button>
            </Popover> : <Link {...authEntry(location.pathname + location.search + location.hash)} className="workspace-navigation-account" aria-label="登录">
                <CircleUserRound className="workspace-navigation-avatar" aria-hidden="true" /><span className="workspace-navigation-label">登录</span>
            </Link>}
            <div className="workspace-navigation-toggle-row">
                <Tooltip title={collapsed ? "展开侧栏" : "收起侧栏"} placement="right">
                    <button type="button" className="workspace-navigation-toggle" aria-label={collapsed ? "展开侧栏菜单" : "收起侧栏"} aria-expanded={!collapsed} aria-controls="workspace-navigation-links" onClick={collapsed ? onExpand : onCollapse}>
                        {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
                        <span>{collapsed ? "展开" : "收起侧栏"}</span>
                    </button>
                </Tooltip>
            </div>
        </footer>
    </motion.div>;
}
