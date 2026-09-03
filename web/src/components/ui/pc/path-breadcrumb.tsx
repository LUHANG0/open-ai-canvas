import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PathBreadcrumbItem = {
    key: string;
    label: ReactNode;
};

export type PathBreadcrumbProps = {
    ariaLabel: string;
    rootLabel: ReactNode;
    items?: PathBreadcrumbItem[];
    currentLabel?: ReactNode;
    className?: string;
    onRootClick: () => void;
    onItemClick: (key: string) => void;
};

export function PathBreadcrumb({ ariaLabel, rootLabel, items = [], currentLabel, className, onRootClick, onItemClick }: PathBreadcrumbProps) {
    return (
        <nav aria-label={ariaLabel} className={cn("flex min-w-0 items-center gap-1 text-xs text-foreground/48", className)}>
            <button type="button" className="truncate rounded px-1.5 py-1 hover:bg-surface-hover" onClick={onRootClick}>
                {rootLabel}
            </button>
            {items.map((item) => (
                <span key={item.key} className="contents">
                    <span aria-hidden="true">/</span>
                    <button type="button" className="truncate rounded px-1.5 py-1 font-medium text-foreground hover:bg-surface-hover" onClick={() => onItemClick(item.key)}>
                        {item.label}
                    </button>
                </span>
            ))}
            {currentLabel ? (
                <>
                    <span aria-hidden="true">/</span>
                    <span className="font-medium text-foreground">{currentLabel}</span>
                </>
            ) : null}
        </nav>
    );
}
