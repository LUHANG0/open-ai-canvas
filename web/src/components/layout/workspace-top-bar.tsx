import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Link, useLocation } from "react-router";

import { SystemAnnouncementCenter } from "@/components/layout/system-announcement-center";
import { WorkspaceAccountMenu } from "@/components/layout/workspace-account-menu";
import { useWorkspaceTopBarContent } from "@/components/layout/workspace-top-bar-extension";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

const PAGE_CONTEXT: Record<string, { section: string; title: string }> = {
    home: { section: "Workspace", title: "首页" },
    create: { section: "Create", title: "AI 创作" },
    projects: { section: "Production", title: "短剧创作" },
    canvas: { section: "Canvas", title: "无限画布" },
    tasks: { section: "Jobs", title: "生成任务" },
    assets: { section: "Library", title: "素材库" },
    skills: { section: "Abilities", title: "技能库" },
    plugins: { section: "Extensions", title: "插件中心" },
    wallet: { section: "Credits", title: "积分中心" },
    settings: { section: "System", title: "设置" },
};

export function WorkspaceTopBar({ sidebarOpen, onToggleSidebar }: { sidebarOpen: boolean; onToggleSidebar: () => void }) {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const { pathname } = useLocation();
    const extension = useWorkspaceTopBarContent();

    const slug = pathname.split("/").filter(Boolean)[0];
    const pageContext = (slug && PAGE_CONTEXT[slug]) || { section: "Yingce", title: "影策" };

    return (
        <header className={`app-workspace-topbar flex shrink-0 items-center justify-between gap-2 px-3 sm:px-4 ${extension ? "has-extension" : ""}`} aria-label="工作区顶栏">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <button type="button" className="app-workspace-topbar-icon-button" aria-label={sidebarOpen ? "收起侧栏" : "展开侧栏"} onClick={onToggleSidebar}>
                    {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                </button>
                <nav className={`${extension ? "hidden 2xl:flex" : "flex"} app-workspace-page-context`} aria-label="当前位置">
                    <Link to="/" className="app-workspace-context-section shrink-0 transition-colors hover:text-foreground">
                        {pageContext.section}
                    </Link>
                    <span className="app-workspace-context-divider shrink-0" aria-hidden="true" />
                    <span className="app-workspace-context-title" aria-current="page">{pageContext.title}</span>
                </nav>
                {extension ? <div className="min-w-0 flex-1">{extension}</div> : null}
            </div>

            <div className="flex shrink-0 items-center gap-1">
                {user ? <SystemAnnouncementCenter userId={user.id} className="app-workspace-topbar-icon-button" /> : null}
                <AnimatedThemeToggler className="app-workspace-topbar-icon-button" theme={theme} onThemeChange={setTheme} aria-label="切换主题" />
                <WorkspaceAccountMenu />
            </div>
        </header>
    );
}
