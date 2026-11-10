import type { GenerationStatus } from "@/hooks/use-generation-readiness";
import { cn } from "@/lib/utils";

export function GenerationStatusNotice({ status, className, feeShownInline = false }: { status: GenerationStatus; className?: string; feeShownInline?: boolean }) {
    const reason = status.reason || (feeShownInline && !status.fee.blocked ? "" : status.fee.label);
    const supplierNotice = status.ready && status.source === "supplier";
    const settingsNotice = !status.ready && Boolean(status.settingsHref);
    if (!reason && !supplierNotice && !status.retryKind && !settingsNotice) return null;
    return <div className={cn("flex min-w-0 flex-wrap items-center whitespace-normal gap-x-2 gap-y-1 text-[var(--fs-caption)] leading-relaxed", className)} role="status" aria-live="polite" data-canvas-no-zoom>
        {reason ? <span title={status.reason || status.fee.description}>{reason}</span> : null}
        {supplierNotice ? <span>金额以供应商账单为准</span> : null}
        {settingsNotice ? <a href={status.settingsHref} target="_blank" rel="noreferrer" className="underline underline-offset-2">检查设置<span className="sr-only">（在新窗口打开）</span></a> : null}
        {status.retryKind ? <button type="button" onClick={status.retry} className="underline underline-offset-2">重试</button> : null}
    </div>;
}
