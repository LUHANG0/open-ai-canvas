import { Button } from "antd";
import { Home, RefreshCw } from "lucide-react";
import { useNavigate, useRouteError } from "react-router";

import { WorkspaceSignalIcon } from "@/components/ui/aceternity/workspace-signal-icon";

import "./system-pc.css";

export default function RouteErrorPage() {
    const error = useRouteError();
    const navigate = useNavigate();
    const message = error instanceof Error ? error.message : "页面暂时无法显示";

    return (
        <main className="pc-system-page pc-system-page-main app-workspace-page grid h-dvh place-items-center px-6 text-foreground">
            <section className="pc-system-card is-error w-full max-w-md text-center" role="alert" aria-labelledby="pc-route-error-title">
                <div className="pc-system-code pc-system-pc-only">ERR</div>
                <WorkspaceSignalIcon variant="error" size="lg" className="pc-system-icon mx-auto" />
                <p className="pc-system-eyebrow text-xs font-medium text-muted-foreground">页面运行异常</p>
                <h1 id="pc-route-error-title" className="pc-system-title mt-3 text-2xl font-semibold">
                    当前页面没有正常加载
                </h1>
                <p className="pc-system-description mt-3 break-words text-sm leading-6 text-muted-foreground">{message}</p>
                <div className="pc-system-actions mt-6 flex justify-center gap-3">
                    <Button className="pc-system-secondary-action" icon={<RefreshCw className="size-4" />} onClick={() => window.location.reload()}>
                        重新加载
                    </Button>
                    <Button className="pc-system-primary-button" type="primary" icon={<Home className="size-4" />} onClick={() => navigate("/")}>
                        返回主页
                    </Button>
                </div>
            </section>
        </main>
    );
}
