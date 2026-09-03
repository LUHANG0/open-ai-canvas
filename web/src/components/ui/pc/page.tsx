import { Button, Select } from "antd";
import { ChevronLeft, ChevronRight, ListFilter, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";

import { cn } from "@/lib/utils";

export type WorkspacePageProps = {
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    grid?: boolean;
    fluid?: boolean;
    scroll?: boolean;
};

export function WorkspacePage({ children, className, contentClassName, grid = false, fluid = false, scroll = true }: WorkspacePageProps) {
    return (
        <main
            className={cn("app-user-content app-workspace-page-frame h-full min-h-0 text-foreground", scroll && "app-workspace-scroll is-scroll-owner overflow-y-auto overscroll-contain", grid && "app-workspace-grid", className)}
            data-scroll-owner={scroll ? "page" : undefined}
        >
            <div className={cn("app-workspace-page-content", fluid ? "is-fluid h-full w-full" : "w-full px-3 py-3 sm:px-4 sm:py-4 xl:px-5", contentClassName)}>{children}</div>
        </main>
    );
}

export type PageHeaderProps = {
    title: string;
    description?: string;
    meta?: ReactNode;
    actions?: ReactNode;
    eyebrow?: ReactNode;
    className?: string;
};

export function PageHeader({ title, description, meta, actions, eyebrow, className }: PageHeaderProps) {
    const titleId = useId();
    const descriptionId = useId();

    return (
        <header className={cn("app-page-header flex min-h-14 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
            <div className="app-page-header-copy flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                    {eyebrow ? <div className="app-page-header-eyebrow">{eyebrow}</div> : null}
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <h1 id={titleId} className="app-page-header-title truncate font-semibold leading-7">
                            {title}
                        </h1>
                        {meta ? <div className="app-page-header-meta flex min-w-0 flex-wrap items-center gap-2">{meta}</div> : null}
                    </div>
                    {description ? (
                        <p id={descriptionId} className="app-page-header-description mt-1 text-xs leading-5 text-foreground/58">
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
            {actions ? <div className="app-page-header-actions flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
    );
}

export type ListToolbarProps = {
    children: ReactNode;
    filters?: ReactNode;
    filtersAlwaysVisible?: boolean;
    activeFilters?: ReactNode;
    trailing?: ReactNode;
    active?: boolean;
    onReset?: () => void;
    className?: string;
    ariaLabel?: string;
};

export function ListToolbar({ children, filters, filtersAlwaysVisible = false, activeFilters, trailing, active, onReset, className, ariaLabel }: ListToolbarProps) {
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filtersId = useId();

    useEffect(() => {
        if (active) setFiltersOpen(true);
    }, [active]);

    return (
        <section className={cn("app-list-toolbar mt-3 flex min-h-12 flex-col gap-2 pb-3 lg:flex-row lg:items-center lg:justify-between", className)} aria-label={ariaLabel || "搜索、筛选和列表操作"}>
            <div className="app-list-toolbar-main flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                {children}
                {filters ? (
                    <>
                        {!filtersAlwaysVisible ? (
                            <Button
                                type="default"
                                className="app-filter-toggle"
                                aria-controls={filtersId}
                                aria-expanded={filtersOpen}
                                aria-label={active ? "筛选，当前有已应用条件" : "筛选"}
                                icon={<ListFilter className="size-3.5" aria-hidden="true" />}
                                onClick={() => setFiltersOpen((open) => !open)}
                            >
                                筛选{active ? <span className="app-filter-active-dot" aria-hidden="true" /> : null}
                            </Button>
                        ) : null}
                        <div id={filtersId} className={cn("app-list-toolbar-filters flex flex-wrap items-center gap-2", (filtersAlwaysVisible || filtersOpen) && "is-open")}>
                            {filters}
                        </div>
                    </>
                ) : null}
                {activeFilters ? (
                    <div className="app-list-toolbar-chips" aria-label="已应用的筛选条件">
                        {activeFilters}
                    </div>
                ) : null}
            </div>
            <div className="app-list-toolbar-actions flex shrink-0 flex-wrap items-center gap-2">
                {active && onReset ? (
                    <Button type="text" icon={<RotateCcw className="size-3.5" aria-hidden="true" />} onClick={onReset}>
                        重置
                    </Button>
                ) : null}
                {trailing}
            </div>
        </section>
    );
}

export type TableSurfaceProps = {
    children: ReactNode;
    className?: string;
    ariaLabel?: string;
};

export function TableSurface({ children, className, ariaLabel }: TableSurfaceProps) {
    return (
        <div className={cn("app-table-surface mt-4 min-w-0 overflow-hidden rounded-lg bg-surface", className)} role={ariaLabel ? "region" : undefined} aria-label={ariaLabel}>
            {children}
        </div>
    );
}

export type CollectionGridProps = {
    children: ReactNode;
    className?: string;
    ariaLabel?: string;
};

export function CollectionGrid({ children, className, ariaLabel }: CollectionGridProps) {
    return (
        <div className={cn("app-collection-grid mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(248px,1fr))]", className)} role={ariaLabel ? "region" : undefined} aria-label={ariaLabel}>
            {children}
        </div>
    );
}

/* 自研轻量分页：页码胶囊 + 省略号 + 每页条数 + 总数，避免第三方分页样式侵入页面工具栏。 */
function pageItems(current: number, pages: number): (number | "…")[] {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "…", pages];
    if (current >= pages - 3) return [1, "…", pages - 4, pages - 3, pages - 2, pages - 1, pages];
    return [1, "…", current - 1, current, current + 1, "…", pages];
}

export type PaginationBarProps = {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
    pageSizeOptions?: number[];
    alwaysShow?: boolean;
    itemLabel?: string;
    ariaLabel?: string;
    className?: string;
};

export function PaginationBar({ current, pageSize, total, onChange, pageSizeOptions = [20, 50, 100], alwaysShow = false, itemLabel = "条", ariaLabel = "分页", className }: PaginationBarProps) {
    if (!alwaysShow && total <= pageSize && current === 1) return null;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
    const end = total === 0 ? 0 : Math.min(total, current * pageSize);
    const items = pageItems(current, pages);
    return (
        <nav className={cn("app-pagination-bar mt-4 flex min-h-10 min-w-0 items-center justify-end gap-2 px-2 py-1.5", className)} aria-label={ariaLabel}>
            <span className="app-pagination-total" aria-live="polite">
                {total === 0 ? `共 0 ${itemLabel}` : `${start}-${end} / 共 ${total} ${itemLabel}`}
            </span>
            <Select
                aria-label={`每页显示${itemLabel}数`}
                size="small"
                value={pageSize}
                className="app-pagination-size"
                options={pageSizeOptions.map((size) => ({ value: size, label: `${size} ${itemLabel}/页` }))}
                onChange={(value) => onChange(1, Number(value))}
            />
            <div className="app-pagination-pages">
                <button type="button" className="app-pagination-btn app-pagination-prev" disabled={current <= 1} aria-label="上一页" onClick={() => onChange(current - 1, pageSize)}>
                    <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                {items.map((item, index) =>
                    item === "…" ? (
                        <span key={`ellipsis-${index}`} className="app-pagination-ellipsis" aria-hidden="true">
                            …
                        </span>
                    ) : (
                        <button key={item} type="button" className={`app-pagination-btn${item === current ? " is-active" : ""}`} aria-label={`第 ${item} 页`} aria-current={item === current ? "page" : undefined} onClick={() => onChange(item, pageSize)}>
                            {item}
                        </button>
                    ),
                )}
                <button type="button" className="app-pagination-btn app-pagination-next" disabled={current >= pages} aria-label="下一页" onClick={() => onChange(current + 1, pageSize)}>
                    <ChevronRight className="size-4" aria-hidden="true" />
                </button>
            </div>
        </nav>
    );
}
