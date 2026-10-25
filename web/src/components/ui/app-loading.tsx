import { cn } from "@/lib/utils";

/** Same three-frame motif as the static document, available before React loads. */
export function AppLoading({ label = "正在准备画面", detail, className, brand = false, screen = false, compact = false }: {
    label?: string; detail?: string; className?: string; brand?: boolean; screen?: boolean; compact?: boolean;
}) {
    return <div className={cn("app-loading", brand && "app-loading--brand", screen && "app-loading--screen", compact && "app-loading--compact", className)} role="status" aria-live="polite" aria-busy="true" aria-label={label}>
        <div className="app-loading__content">
            <span className="app-loading__frames" aria-hidden="true"><i /><i /><i /></span>
            <div className="app-loading__copy"><span className="app-loading__label">{label}</span>{detail && <span className="app-loading__detail">{detail}</span>}</div>
            <span className="app-loading__track" aria-hidden="true" />
        </div>
    </div>;
}
