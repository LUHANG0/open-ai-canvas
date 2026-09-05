import { useEffect, useState } from "react";

import { BrandLoader } from "@/components/ui/brand-loader";
import { cn } from "@/lib/utils";

type FullScreenLoaderProps = {
    label?: string;
    detail?: string;
    className?: string;
};

export function FullScreenLoader({ label = "正在打开创作空间", detail = "准备当前页面", className }: FullScreenLoaderProps) {
    return (
        <div data-full-screen-loader role="status" aria-live="polite" aria-label={[label, detail].filter(Boolean).join("，")} className={cn("full-screen-loader brand-loader-screen", className)}>
            <BrandLoader label={label} detail={detail} branded />
        </div>
    );
}

export function WorkspaceRouteLoader({ label = "正在打开页面" }: { label?: string }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 140);
        return () => window.clearTimeout(timer);
    }, []);

    return (
        <section data-workspace-route-loader className={cn("workspace-route-loader", visible && "is-visible")} role="status" aria-live="polite" aria-label={visible ? label : undefined}>
            {visible ? <BrandLoader label={label} /> : null}
        </section>
    );
}
