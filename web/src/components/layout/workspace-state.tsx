import { Button, Skeleton } from "antd";
import type { ReactNode } from "react";
import { useId } from "react";

import { WorkspaceSignalIcon, type WorkspaceSignalIconVariant } from "@/components/ui/aceternity/workspace-signal-icon";
import { cn } from "@/lib/utils";

type WorkspaceStateProps = {
    icon?: WorkspaceSignalIconVariant;
    title: string;
    description?: string;
    action?: ReactNode;
    compact?: boolean;
    className?: string;
    role?: "alert" | "status";
};

export function WorkspaceState({ icon = "empty", title, description, action, compact = false, className, role }: WorkspaceStateProps) {
    const titleId = useId();
    const descriptionId = useId();

    return (
        <section
            className={cn("workspace-state flex flex-col items-center justify-center text-center", compact ? "is-compact min-h-44 py-8" : "min-h-[320px] py-12", className)}
            role={role}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            aria-busy={icon === "loading" || undefined}
        >
            <WorkspaceSignalIcon variant={icon} size={compact ? "md" : "lg"} />
            <h2 id={titleId} className="workspace-state-title mt-4 text-[var(--fs-body-lg)] font-semibold leading-6 text-foreground">{title}</h2>
            {description ? <p id={descriptionId} className="workspace-state-description mt-1.5 max-w-[42ch] text-xs leading-5 text-foreground/58">{description}</p> : null}
            {action ? <div className="workspace-state-action mt-5">{action}</div> : null}
        </section>
    );
}

export function WorkspaceErrorState({ title = "暂时无法加载", description, actionLabel = "重新加载", onRetry, compact = false }: { title?: string; description?: string; actionLabel?: string; onRetry?: () => void; compact?: boolean }) {
    return <WorkspaceState role="alert" icon="error" title={title} description={description || "请检查网络连接后重试，当前内容不会被覆盖。"} compact={compact} action={onRetry ? <Button onClick={onRetry}>{actionLabel}</Button> : undefined} />;
}

export function WorkspaceLoadingState({ label = "正在加载内容", detail, rows = 3, className }: { label?: string; detail?: string; rows?: number; className?: string }) {
    const labelId = useId();
    const detailId = useId();

    return (
        <section className={cn("workspace-loading-state py-8", className)} role="status" aria-busy="true" aria-live="polite" aria-labelledby={labelId} aria-describedby={detail ? detailId : undefined}>
            <div className="mb-5 flex items-center gap-3">
                <WorkspaceSignalIcon variant="loading" size="sm" />
                <div><div id={labelId} className="workspace-loading-state-title text-sm font-medium">{label}</div>{detail ? <div id={detailId} className="workspace-loading-state-description mt-0.5 text-xs text-foreground/50">{detail}</div> : null}</div>
            </div>
            <div className="workspace-loading-state-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
                {Array.from({ length: rows }, (_, index) => <div key={index} className="workspace-loading-state-card rounded-md bg-surface-active p-4"><Skeleton active title={{ width: `${48 + index * 8}%` }} paragraph={{ rows: 3 }} /></div>)}
            </div>
        </section>
    );
}
