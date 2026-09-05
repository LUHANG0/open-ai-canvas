import type { CSSProperties, ReactNode } from "react";

import { BrandMark } from "@/components/branding/brand-mark";
import { cn } from "@/lib/utils";

type IndicatorSize = "inline" | "sm" | "md" | "lg";

/** 装饰图形不重复播报状态；文案与 live region 由所在加载边界负责。 */
export function BrandLoadingIndicator({ size = "inline", className, style, children }: { size?: IndicatorSize; className?: string; style?: CSSProperties; children?: ReactNode }) {
    return (
        <span className={cn("brand-loading-indicator", `is-${size}`, className)} style={style} aria-hidden="true">
            <svg className="brand-loading-frame" viewBox="0 0 40 40" fill="none">
                <path d="M5 14V5H14" />
                <path d="M26 5H35V14" />
                <path d="M35 26V35H26" />
                <path d="M14 35H5V26" />
            </svg>
            {children || <span className="brand-loading-core" />}
        </span>
    );
}

export function BrandLoader({ label, detail, branded = false }: { label: string; detail?: string; branded?: boolean }) {
    return (
        <div className={cn("brand-loader", branded && "is-branded")}>
            <BrandLoadingIndicator size={branded ? "lg" : "md"}>{branded ? <BrandMark className="brand-loading-logo" /> : undefined}</BrandLoadingIndicator>
            <div className="brand-loader-copy">
                <span className="brand-loader-label">{label}</span>
                {detail ? <span className="brand-loader-detail">{detail}</span> : null}
            </div>
            <span className="brand-loader-frames" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
            </span>
        </div>
    );
}
