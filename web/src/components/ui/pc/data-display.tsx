import { X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./pc-ui.css";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "error" | "running";

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
    tone?: StatusTone;
    icon?: ReactNode;
    dot?: boolean;
    live?: boolean;
};

export function StatusBadge({ tone = "neutral", icon, dot = false, live = false, className, children, ...props }: StatusBadgeProps) {
    return (
        <span className={cn("pc-status-badge", `pc-status-badge--${tone}`, className)} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined} {...props}>
            {dot ? <span className="pc-status-badge__dot" aria-hidden="true" /> : null}
            {icon ? <span className="pc-status-badge__icon">{icon}</span> : null}
            <span className="pc-status-badge__label">{children}</span>
        </span>
    );
}

export type StatTileProps = HTMLAttributes<HTMLDivElement> & {
    label: ReactNode;
    value: ReactNode;
    detail?: ReactNode;
    icon?: ReactNode;
    trend?: ReactNode;
    trendTone?: "neutral" | "positive" | "negative";
};

export function StatTile({ label, value, detail, icon, trend, trendTone = "neutral", className, ...props }: StatTileProps) {
    return (
        <div className={cn("pc-stat-tile", className)} {...props}>
            <div className="pc-stat-tile__topline">
                <div className="pc-stat-tile__label">{label}</div>
                {icon ? <div className="pc-stat-tile__icon">{icon}</div> : null}
            </div>
            <div className="pc-stat-tile__value">{value}</div>
            {detail || trend ? (
                <div className="pc-stat-tile__footer">
                    {trend ? <span className={cn("pc-stat-tile__trend", `pc-stat-tile__trend--${trendTone}`)}>{trend}</span> : null}
                    {detail ? <span className="pc-stat-tile__detail">{detail}</span> : null}
                </div>
            ) : null}
        </div>
    );
}

export type SelectionBarProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    count: number;
    itemLabel?: string;
    summary?: ReactNode;
    actions?: ReactNode;
    onClear?: () => void;
    clearLabel?: string;
    hideWhenEmpty?: boolean;
};

export function SelectionBar({ count, itemLabel = "项", summary, actions, onClear, clearLabel = "清除选择", hideWhenEmpty = true, className, ...props }: SelectionBarProps) {
    if (hideWhenEmpty && count <= 0) return null;

    return (
        <div className={cn("pc-selection-bar", className)} {...props}>
            <div className="pc-selection-bar__summary" role="status" aria-live="polite">
                <span className="pc-selection-bar__count">
                    已选择 {count} {itemLabel}
                </span>
                {summary ? <span className="pc-selection-bar__detail">{summary}</span> : null}
            </div>
            <div className="pc-selection-bar__actions">
                {actions}
                {onClear ? (
                    <button type="button" className="pc-selection-bar__clear" aria-label={clearLabel} onClick={onClear}>
                        <X aria-hidden="true" />
                        <span>{clearLabel}</span>
                    </button>
                ) : null}
            </div>
        </div>
    );
}
