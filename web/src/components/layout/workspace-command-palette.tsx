import { Command, Home, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type AriaAttributes, type ComponentType, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";

import { navigationTools } from "@/constant/navigation-tools";
import { Kbd } from "@/components/ui/base/kbd";
import { cn } from "@/lib/utils";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { useUserStore } from "@/stores/use-user-store";

type PaletteEntry = {
    id: string;
    title: string;
    icon: ComponentType<{ className?: string; strokeWidth?: number } & AriaAttributes>;
    to?: string;
    run?: () => void;
};

/** 顶栏搜索 / ⌘K 命令面板：按功能开关过滤当前可用页面入口。 */
export function WorkspaceCommandPalette({ open, onClose, returnFocusTarget }: { open: boolean; onClose: () => void; returnFocusTarget?: HTMLElement | null }) {
    const navigate = useNavigate();
    const features = useUserStore((state) => state.features);
    const [query, setQuery] = useState("");
    const [highlight, setHighlight] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const restoreFocus = useRef(true);
    const paletteId = useId();
    const listId = `${paletteId}-results`;

    const entries = useMemo<PaletteEntry[]>(() => {
        const toolEntry = (slug: string, to?: string): PaletteEntry => {
            const tool = navigationTools.find((item) => item.slug === slug);
            return { id: slug, title: tool?.label ?? slug, icon: tool?.icon ?? Home, to };
        };
        return [
            { id: "home", title: "首页", icon: Home, to: "/" },
            toolEntry("projects", "/projects"),
            toolEntry("canvas", "/canvas"),
            ...(features.taskCenterEnabled ? [toolEntry("tasks", "/tasks")] : []),
            toolEntry("assets", "/assets"),
            toolEntry("skills", "/skills"),
            ...(features.creditsEnabled ? [{ ...toolEntry("wallet"), run: () => openWorkspaceWallet() }] : []),
            toolEntry("settings", "/settings"),
        ];
    }, [features]);

    const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return entries;
        return entries.filter((entry) => entry.title.toLowerCase().includes(keyword));
    }, [entries, query]);

    const activateEntry = (entry: PaletteEntry) => {
        restoreFocus.current = false;
        onClose();
        if (entry.run) {
            entry.run();
            return;
        }
        if (entry.to) navigate(entry.to);
    };

    useEffect(() => {
        if (!open) return;
        const trigger = returnFocusTarget !== undefined ? returnFocusTarget : document.activeElement instanceof HTMLElement ? document.activeElement : null;
        restoreFocus.current = true;
        setQuery("");
        inputRef.current?.focus({ preventScroll: true });
        return () => {
            // 导航或打开另一个面板时，由目标界面接管焦点。
            if (restoreFocus.current && trigger?.isConnected && !trigger.matches(":disabled") && !trigger.closest('[inert], [hidden], [aria-hidden="true"]') && trigger.getClientRects().length > 0 && getComputedStyle(trigger).visibility !== "hidden") {
                trigger.focus({ preventScroll: true });
            }
        };
    }, [open, returnFocusTarget]);

    useEffect(() => {
        setHighlight(0);
    }, [filtered.length, open]);

    useEffect(() => {
        if (!open) return;
        const active = filtered[highlight];
        if (active) document.getElementById(`${listId}-${active.id}`)?.scrollIntoView?.({ block: "nearest" });
    }, [filtered, highlight, listId, open]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key === "Tab") {
            const stops = Array.from(dialogRef.current?.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button") || [])
                .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0);
            const first = stops[0];
            const last = stops[stops.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
            return;
        }
        if (event.target !== inputRef.current) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
        } else if (event.key === "Enter" && filtered[highlight]) {
            event.preventDefault();
            activateEntry(filtered[highlight]);
        }
    };

    if (!open) return null;

    return (
        <div className="workspace-utility-overlay workspace-command-palette absolute inset-0 z-50 flex items-start justify-center bg-background/40 px-4 pt-28 backdrop-blur-sm lg:pt-32">
            <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${paletteId}-title`} onKeyDown={handleKeyDown} className="relative w-full max-w-xl overflow-hidden rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-strong)] shadow-2xl">
                <h2 id={`${paletteId}-title`} className="sr-only">搜索页面或操作</h2>
                <div className="p-3 pb-2">
                    <div className="flex h-10 items-center gap-2 rounded-[var(--r-md)] border border-[var(--workspace-border)] bg-foreground/5 px-3 transition-colors hover:border-[var(--workspace-border-strong)] focus-within:border-[var(--workspace-border-strong)] focus-within:bg-foreground/[.06]">
                        <Search className="size-4 shrink-0 text-foreground/45" strokeWidth={1.6} aria-hidden="true" />
                        <input
                            ref={inputRef}
                            role="combobox"
                            aria-label="搜索页面或操作"
                            aria-autocomplete="list"
                            aria-expanded="true"
                            aria-controls={listId}
                            aria-activedescendant={filtered[highlight] ? `${listId}-${filtered[highlight].id}` : undefined}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-[var(--fs-body)] outline-none placeholder:text-foreground/45"
                            placeholder="搜索页面或操作…"
                        />
                        <button type="button" onClick={onClose} aria-label="关闭命令面板（⌘K / Ctrl+K）" className="hidden shrink-0 rounded-sm transition-colors duration-150 hover:bg-surface-hover hover:text-foreground sm:inline-flex">
                            <Kbd>⌘K</Kbd>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="ml-0.5 shrink-0 rounded-md p-1 text-foreground/50 transition-colors hover:bg-surface-hover hover:text-foreground"
                            aria-label="关闭搜索"
                        >
                            <X className="size-4" strokeWidth={1.6} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <span className="sr-only" role="status">{filtered.length ? `找到 ${filtered.length} 个页面或操作` : "没有匹配的页面或操作"}</span>
                <div className="max-h-80 overflow-y-auto overscroll-contain p-2">
                        <ul id={listId} role="listbox" aria-label="页面与操作" className="flex flex-col gap-0.5">
                            {filtered.map((entry, index) => {
                                const Icon = entry.icon;
                                return (
                                    <li key={entry.id} role="presentation">
                                        <button
                                            type="button"
                                            id={`${listId}-${entry.id}`}
                                            role="option"
                                            aria-selected={index === highlight}
                                            tabIndex={-1}
                                            onMouseEnter={() => setHighlight(index)}
                                            onClick={() => activateEntry(entry)}
                                            className={cn(
                                                "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[var(--fs-body)] transition-colors",
                                                index === highlight ? "bg-surface-hover text-foreground" : "text-foreground/65",
                                            )}
                                        >
                                            <Icon className={cn("size-4 shrink-0", index === highlight ? "text-foreground" : "text-foreground/55")} strokeWidth={1.6} aria-hidden="true" />
                                            <span className="truncate">{entry.title}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    {!filtered.length ? (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Command className="mb-2 size-6 text-foreground/30" strokeWidth={1.5} aria-hidden="true" />
                            <p className="max-w-full break-words px-3 text-[13px] font-medium text-[var(--user-ink-muted)]">未找到「{query}」相关页面</p>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
