import { Popover } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { CircleUserRound, Moon, Sun } from "lucide-react";
import { useImperativeHandle, useRef, type KeyboardEvent as ReactKeyboardEvent, type Ref } from "react";
import { Link, useLocation } from "react-router";

import { AppChangelogButton } from "@/components/layout/app-changelog-modal";
import { WorkspaceAccountCard } from "./workspace-account-card";
import { UserAvatar } from "./user-avatar";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { authEntry } from "@/lib/auth-navigation";

/** 顶部与侧栏复用同一账户卡片；顶部额外保留版本和主题偏好。 */
export function WorkspaceAccountMenu({ open: menuOpen, onOpenChange: setMenuOpen, triggerRef }: { open: boolean; onOpenChange: (open: boolean) => void; triggerRef: Ref<HTMLButtonElement> }) {
    const location = useLocation();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const escapeEventRef = useRef<{ event: KeyboardEvent; local: boolean } | null>(null);
    useImperativeHandle(triggerRef, () => buttonRef.current!, [hydrated, Boolean(user)]);

    const availableTrigger = () => {
        const button = buttonRef.current;
        if (!button?.isConnected || button.disabled || button.closest('[inert], [hidden], [aria-hidden="true"]') || !button.getClientRects().length || getComputedStyle(button).visibility === "hidden") return null;
        return button;
    };

    const observeEscape = (event: ReactKeyboardEvent<HTMLElement>) => {
        if (!menuOpen || event.key !== "Escape") return;
        // React portal 也会沿组件树冒泡；上层日志、输入法和已消费的 Escape 不应关闭账户浮层。
        const nativeEvent = event.nativeEvent;
        escapeEventRef.current = {
            event: nativeEvent,
            local: event.currentTarget.contains(event.target as Node) && !event.defaultPrevented && !nativeEvent.isComposing && nativeEvent.keyCode !== 229,
        };
        // window 原生 Escape 回调可能晚于 root 后的微任务检查点，未消费意图到下一任务才失效。
        setTimeout(() => {
            if (escapeEventRef.current?.event === nativeEvent) escapeEventRef.current = null;
        }, 0);
    };

    const changeOpen = (open: boolean) => {
        const escape = escapeEventRef.current;
        escapeEventRef.current = null;
        if (!open && escape && (!escape.local || escape.event.defaultPrevented)) return;
        const keyboardDismiss = !open && Boolean(escape);
        setMenuOpen(open);
        if (!keyboardDismiss) return;
        // 同一键盘任务内回焦，避免退场结束后抢走导航或新浮层的焦点。
        queueMicrotask(() => {
            const active = document.activeElement;
            const button = availableTrigger();
            if (!button) return;
            if (active !== document.body && active !== button && !(active && contentRef.current?.contains(active))) return;
            button.focus({ preventScroll: true });
        });
    };

    if (!hydrated) {
        return <span className="size-9 animate-pulse rounded-[var(--r-md)] bg-foreground/[.06]" aria-hidden />;
    }

    return user ? (
        <><Popover
            trigger="click"
            placement="bottomRight"
            arrow={false}
            rootClassName="workspace-account-popover"
            open={menuOpen}
            onOpenChange={changeOpen}
            content={(
                <div ref={contentRef} className="workspace-topbar-account-menu" data-workspace-account-menu="topbar" onKeyDown={observeEscape}>
                    <WorkspaceAccountCard onNavigate={() => setMenuOpen(false)} onWallet={() => { setMenuOpen(false); availableTrigger()?.focus({ preventScroll: true }); openWorkspaceWallet(); }} />

                    <div className="workspace-topbar-account-section">
                        <AppChangelogButton className="flex h-8 w-full items-center gap-2 rounded px-2 text-[var(--fs-label)] text-foreground/58 hover:bg-surface-hover hover:text-foreground [&_svg]:size-3.5" showLabel showVersion versionClassName="ml-auto text-[var(--fs-micro)] tabular-nums text-foreground/32" />
                    </div>

                    <div className="workspace-topbar-account-theme">
                        {theme === "dark" ? <Moon className="size-3.5 text-foreground/45" /> : <Sun className="size-3.5 text-foreground/45" />}
                        <span className="ml-2 flex-1 text-xs text-foreground/65">深色模式</span>
                        <Switch size="sm" checked={theme === "dark"} onChange={(checked) => setTheme(checked ? "dark" : "light")} aria-label="深色模式" />
                    </div>
                </div>
            )}
        >
            <button ref={buttonRef} type="button" onKeyDown={observeEscape} className="app-workspace-topbar-icon-button app-workspace-account-trigger" aria-label="账户菜单" aria-expanded={menuOpen} title={user.displayName || user.username}>
                <UserAvatar user={user} className="size-6" />
            </button>
        </Popover></>
    ) : <Link {...authEntry(location.pathname + location.search + location.hash)} className="app-workspace-topbar-guest inline-flex items-center gap-1.5 px-1.5 text-xs text-foreground/55" aria-label="登录" title="登录"><CircleUserRound aria-hidden className="size-5" /><span className="hidden sm:inline">游客</span></Link>;
}
