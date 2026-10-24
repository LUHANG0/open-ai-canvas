import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocation, useNavigate } from "react-router";

import { BannerAnnouncementsSlider } from "@/components/layout/banner-announcements-slider";
import { ModelSetupGuide } from "@/components/layout/model-setup-guide";
import { WorkspaceSidebarNav } from "@/components/layout/workspace-sidebar-nav";
import { readWorkspaceSidebarCollapsed, writeWorkspaceSidebarCollapsed } from "@/components/layout/workspace-sidebar-state";
import { WorkspaceTopBar } from "@/components/layout/workspace-top-bar";
import { WorkspaceEntryStage } from "@/components/layout/workspace-entry-stage";
import { WorkspaceTopBarExtensionProvider } from "@/components/layout/workspace-top-bar-extension";
import { WorkspaceWalletHost } from "@/components/layout/workspace-wallet-modal";
import { cn } from "@/lib/utils";
import { isSpatialWorkbenchPath } from "@/lib/workspace-routes";
import { workspaceSidebarMotion } from "@/lib/workspace-sidebar-motion";

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
    const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
    const sidebarRef = useRef<HTMLElement>(null);
    const paletteReturnFocusRef = useRef<HTMLElement | null>(null);
    const paletteOpenRef = useRef(false);
    const [mobileViewport, setMobileViewport] = useState(() => window.innerWidth < 1024);
    const reducedMotion = useReducedMotion();
    const [requestedSidebarMotion, setSidebarMotion] = useState(() => workspaceSidebarMotion(getComputedStyle(document.documentElement), false));
    const sidebarMotion = useMemo(() => reducedMotion ? { ...requestedSidebarMotion, duration: 0 } : requestedSidebarMotion, [requestedSidebarMotion, reducedMotion]);

    useLayoutEffect(() => {
        if (mobileViewport && mobileSidebarExpanded) sidebarRef.current?.querySelector<HTMLAnchorElement>(".workspace-navigation-brand")?.focus({ preventScroll: true });
    }, [mobileViewport, mobileSidebarExpanded]);

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
        if (mobileViewport) {
            setMobileSidebarExpanded(false);
            setSidebarAccountOpen(false);
            window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus({ preventScroll: true }));
        }
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
                <div data-sidebar-motion={sidebarMotion.duration ? "on" : "off"} onPointerDownCapture={() => setSidebarMotion(workspaceSidebarMotion(getComputedStyle(document.documentElement), !reducedMotion))} onKeyDownCapture={() => setSidebarMotion((current) => current.duration === 0 ? current : { ...current, duration: 0 })} className={cn("app-workspace-shell flex h-dvh min-h-0 w-full flex-col overflow-hidden", spatialWorkbench && "is-spatial", creationWorkspace && "is-creation-workspace")}>
                    <AnimatePresence initial={false}>
                        {!hideChrome && mobileSidebarExpanded ? <motion.button key="sidebar-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={sidebarMotion} type="button" className="app-workspace-sidebar-scrim lg:hidden" aria-label="收起侧栏" tabIndex={-1} onClick={handleNavClick} /> : null}
                    </AnimatePresence>

                    {showGlobalTopBar ? <BannerAnnouncementsSlider /> : null}

                    <div className="app-workspace-main-row flex min-h-0 min-w-0 flex-1 overflow-hidden">
                        {!hideChrome ? (
                            <motion.aside
                                layout={mobileViewport ? false : "size"}
                                initial={false}
                                animate={{ x: mobileViewport && !mobileSidebarExpanded ? "-100%" : 0 }}
                                transition={{ ...sidebarMotion, layout: sidebarMotion }}
                                ref={sidebarRef}
                                id="workspace-sidebar"
                                role={mobileViewport && mobileSidebarExpanded ? "dialog" : undefined}
                                aria-modal={mobileViewport && mobileSidebarExpanded ? true : undefined}
                                aria-label={mobileViewport && mobileSidebarExpanded ? "工作区菜单" : undefined}
                                inert={mobileViewport && !mobileSidebarExpanded}
                                onKeyDown={(event) => {
                                    if (!mobileViewport || !mobileSidebarExpanded || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
                                    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); handleNavClick(); }
                                    if (event.key !== "Tab") return;
                                    const stops = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
                                    const target = event.shiftKey && document.activeElement === stops[0] ? stops.at(-1) : !event.shiftKey && document.activeElement === stops.at(-1) ? stops[0] : undefined;
                                    if (target) { event.preventDefault(); target.focus(); }
                                }}
                                className={cn(
                                    "app-workspace-sidebar workspace-sidebar-container flex h-full shrink-0 flex-col overflow-hidden",
                                    mobileSidebarExpanded && "is-mobile-expanded",
                                    desktopSidebarCollapsed && !mobileViewport && "is-collapsed",
                                )}
                            >
                                <WorkspaceSidebarNav
                                    collapsed={desktopSidebarCollapsed && !mobileViewport}
                                    layoutTransition={mobileViewport ? undefined : sidebarMotion}
                                    onNavigate={handleNavClick}
                                    onOpenSearch={openPalette}
                                    accountOpen={sidebarAccountOpen}
                                    onAccountOpenChange={setSidebarAccountOpen}
                                    accountTriggerRef={sidebarAccountTriggerRef}
                                    onExpand={expandDesktopSidebar}
                                    onCollapse={mobileViewport ? handleNavClick : collapseDesktopSidebar}
                                />
                            </motion.aside>
                        ) : null}

                        <motion.div layout={!mobileViewport} initial={false} transition={{ layout: sidebarMotion }} className="app-workspace-stage relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            <motion.div layout={mobileViewport ? false : "position"} initial={false} transition={{ layout: sidebarMotion }} className="flex h-full min-h-0 w-full flex-col">
                            {showGlobalTopBar ? <WorkspaceTopBar menuTriggerRef={mobileMenuButtonRef} sidebarOpen={mobileViewport ? mobileSidebarExpanded : !desktopSidebarCollapsed} onToggleSidebar={toggleSidebar} accountOpen={topAccountOpen} onAccountOpenChange={setTopAccountOpen} accountTriggerRef={topAccountTriggerRef} /> : null}
                            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden"><WorkspaceEntryStage>{children}</WorkspaceEntryStage></div>
                            </motion.div>
                        </motion.div>
                    </div>

                    {paletteOpen ? <Suspense fallback={null}><WorkspaceCommandPalette open onClose={closePalette} returnFocusTarget={paletteReturnFocusRef.current} /></Suspense> : null}
                </div>
            </WorkspaceTopBarExtensionProvider>
            <WorkspaceWalletHost />
            <ModelSetupGuide hidden={pathname === "/login" || pathname === "/register" || pathname.startsWith("/admin")} />
        </>
    );
}
