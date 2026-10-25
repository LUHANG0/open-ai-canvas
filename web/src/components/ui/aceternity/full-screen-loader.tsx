import { useEffect, useState } from "react";
import { AppLoading } from "@/components/ui/app-loading";
import { cn } from "@/lib/utils";

type FullScreenLoaderProps = { label?: string; detail?: string; className?: string };

export function FullScreenLoader({ label = "正在恢复工作区", detail = "同步账号、模型和项目数据", className }: FullScreenLoaderProps) {
    return <div data-full-screen-loader className={cn("full-screen-loader", className)}><AppLoading screen label={label} detail={detail} /></div>;
}

export function WorkspaceRouteLoader({ label = "正在打开页面" }: { label?: string }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setVisible(true), 140);
        return () => window.clearTimeout(timer);
    }, []);
    return <section data-workspace-route-loader className={cn("workspace-route-loader", visible && "is-visible")}><AppLoading compact label={label} /></section>;
}
