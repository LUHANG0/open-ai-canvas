import type { GenerationStatus } from "@/hooks/use-generation-readiness";
import { cn } from "@/lib/utils";

export function GenerationStatusNotice({ status, className }: { status: GenerationStatus; className?: string }) {
    const reason = status.reason || status.fee.label;
    if (!reason) return null;
    return <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[var(--fs-caption)] leading-relaxed", className)} role="status" aria-live="polite" data-canvas-no-zoom>
        <span title={status.fee.description}>{reason}</span>
        {status.ready && status.source === "supplier" ? <span>金额以供应商账单为准</span> : null}
        {!status.ready && status.settingsHref ? <a href={status.settingsHref} target="_blank" rel="noreferrer" className="underline underline-offset-2">检查设置<span className="sr-only">（在新窗口打开）</span></a> : null}
        {status.retryKind ? <button type="button" onClick={status.retry} className="underline underline-offset-2">重试</button> : null}
    </div>;
}
