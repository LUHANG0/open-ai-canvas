import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { BannerAnnouncementsSlider } from "@/components/layout/banner-announcements-slider";
import { ModelSetupGuide } from "@/components/layout/model-setup-guide";
import { WorkspaceSidebarNav } from "@/components/layout/workspace-sidebar-nav";
import { readWorkspaceSidebarCollapsed, writeWorkspaceSidebarCollapsed } from "@/components/layout/workspace-sidebar-state";
import { WorkspaceTopBar } from "@/components/layout/workspace-top-bar";
import { WorkspaceTopBarExtensionProvider } from "@/components/layout/workspace-top-bar-extension";
import { WorkspaceWalletHost } from "@/components/layout/workspace-wallet-modal";
import { cn } from "@/lib/utils";
import { isSpatialWorkbenchPath } from "@/lib/workspace-routes";

const WorkspaceCommandPalette = lazy(() => import("@/components/layout/workspace-command-palette").then((module) => ({ default: module.WorkspaceCommandPalette })));

export function AppWorkspaceShell({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [mobileSidebarExpanded, setMobileSidebarExpanded] = useState(false);
    const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(readWorkspaceSidebarCollapsed);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [topAccountOpen, setTopAccountOpen] = useState(false);
    const [sidebarAccountOpen, setSidebarAccountOpen] = useState(false);
    const topAccountTriggerRef = useRef<HTMLButtonElement>(null);
    const sidebarAccountTriggerRef = useRef<HTMLButtonElement>(null);
    const paletteReturnFocusRef = useRef<HTMLElement | null>(null);
    const paletteOpenRef = useRef(false);
    const [mobileViewport, setMobileViewport] = useState(() => window.innerWidth < 1024);

    const hideChrome = pathname.startsWith("/admin") || /^\/canvas\/[^/]+/.test(pathname);
    const showGlobalTopBar = !hideChrome;
    const spatialWorkbench = isSpatialWorkbenchPath(pathname);
    const creationWorkspace = pathname === "/" || pathname === "/create";

    useEffect(() => {
        if (!hideChrome) return;
        setTopAccountOpen(false);
        setSidebarAccountOpen(false);
    }, [hideChrome]);

    useEffect(() => {
        const query = window.matchMedia("(max-width: 1023px)");
        const update = () => setMobileViewport(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    const toggleSidebar = () => {
        if (mobileViewport) {
            setMobileSidebarExpanded((current) => !current);
            return;
        }
        setDesktopSidebarCollapsed((current) => {
            const next = !current;
            writeWorkspaceSidebarCollapsed(next);
            return next;
        });
    };

    const expandDesktopSidebar = () => {
        setDesktopSidebarCollapsed(false);
        writeWorkspaceSidebarCollapsed(false);
    };

    const collapseDesktopSidebar = () => {
        setDesktopSidebarCollapsed(true);
        writeWorkspaceSidebarCollapsed(true);
    };

    const handleNavClick = () => {
        if (mobileViewport) setMobileSidebarExpanded(false);
    };

    const openPalette = useCallback(() => {
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const accountOwner = active?.closest<HTMLElement>("[data-workspace-account-menu]")?.dataset.workspaceAccountMenu;
        // 在收起账户和加载面板前确定返回目标，避免恢复到仍留在DOM中的隐藏菜单项。
        paletteReturnFocusRef.current = accountOwner === "topbar" ? topAccountTriggerRef.current : accountOwner === "sidebar" ? sidebarAccountTriggerRef.current : active;
        setTopAccountOpen(false);
        setSidebarAccountOpen(false);
        paletteOpenRef.current = true;
        setPaletteOpen(true);
    }, []);

    const closePalette = useCallback(() => {
        paletteOpenRef.current = false;
        setPaletteOpen(false);
    }, []);

    // ⌘K / Ctrl+K 全局呼出搜索面板。
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                if (paletteOpenRef.current) closePalette();
                else openPalette();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [closePalette, openPalette]);

    useEffect(() => {
        const handleWorkspaceNavigation = (rawEvent: Event) => {
            const event = rawEvent as CustomEvent<{ to?: string }>;
            if (!event.detail?.to) return;
            event.preventDefault();
            navigate(event.detail.to);
        };
        window.addEventListener("workspace:navigate", handleWorkspaceNavigation);
        return () => window.removeEventListener("workspace:navigate", handleWorkspaceNavigation);
    }, [navigate]);

    return (
        <>
            <WorkspaceTopBarExtensionProvider>
                <div className={cn("app-workspace-shell flex h-dvh min-h-0 w-full flex-col overflow-hidden", spatialWorkbench && "is-spatial", creationWorkspace && "is-creation-workspace")}>
                    {!hideChrome && mobileSidebarExpanded ? <button type="button" className="app-workspace-sidebar-scrim lg:hidden" aria-label="收起侧栏" onClick={() => setMobileSidebarExpanded(false)} /> : null}

                    {showGlobalTopBar ? <BannerAnnouncementsSlider /> : null}

                    <div className="app-workspace-main-row flex min-h-0 min-w-0 flex-1 overflow-hidden">
                        {!hideChrome ? (
                            <aside
                                id="workspace-sidebar"
                                inert={mobileViewport && !mobileSidebarExpanded}
                                className={cn(
                                    "app-workspace-sidebar flex h-full shrink-0 flex-col overflow-hidden",
                                    mobileSidebarExpanded && "is-mobile-expanded",
                                    desktopSidebarCollapsed && "is-collapsed",
                                )}
                            >
                                <WorkspaceSidebarNav
                                    collapsed={desktopSidebarCollapsed}
                                    onNavigate={handleNavClick}
                                    onOpenSearch={openPalette}
                                    accountOpen={sidebarAccountOpen}
                                    onAccountOpenChange={setSidebarAccountOpen}
                                    accountTriggerRef={sidebarAccountTriggerRef}
                                    onExpand={expandDesktopSidebar}
                                    onCollapse={collapseDesktopSidebar}
                                />
                            </aside>
                        ) : null}

                        <div className="app-workspace-stage relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            {showGlobalTopBar ? <WorkspaceTopBar sidebarOpen={mobileViewport ? mobileSidebarExpanded : !desktopSidebarCollapsed} onToggleSidebar={toggleSidebar} accountOpen={topAccountOpen} onAccountOpenChange={setTopAccountOpen} accountTriggerRef={topAccountTriggerRef} /> : null}
                            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
                        </div>
                    </div>

                    {paletteOpen ? <Suspense fallback={null}><WorkspaceCommandPalette open onClose={closePalette} returnFocusTarget={paletteReturnFocusRef.current} /></Suspense> : null}
                </div>
            </WorkspaceTopBarExtensionProvider>
            <WorkspaceWalletHost />
            <ModelSetupGuide hidden={pathname === "/login" || pathname === "/register" || pathname.startsWith("/admin")} />
        </>
    );
}
