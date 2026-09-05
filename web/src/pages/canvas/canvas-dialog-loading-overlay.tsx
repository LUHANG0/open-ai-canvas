import { BrandLoadingIndicator } from "@/components/ui/brand-loader";

export type CanvasDialogLoadingOverlayProps = {
    label: string;
    onClose?: () => void;
};

export function CanvasDialogLoadingOverlay({ label, onClose }: CanvasDialogLoadingOverlayProps) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/20 px-5 backdrop-blur-sm" role="status" aria-live="polite">
            {onClose ? (
                <div className="flex items-center gap-3 rounded-xl border bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">
                    <span className="brand-loading-feedback">
                        <BrandLoadingIndicator />
                        {label}
                    </span>
                    <button type="button" className="rounded-md px-2 py-1 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={onClose}>
                        关闭
                    </button>
                </div>
            ) : (
                <div className="brand-loading-feedback rounded-xl border bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">
                    <BrandLoadingIndicator />
                    {label}
                </div>
            )}
        </div>
    );
}
