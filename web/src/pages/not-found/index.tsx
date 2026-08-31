import { Home } from "lucide-react";
import { Link } from "react-router";

import { WorkspaceSignalIcon } from "@/components/ui/aceternity/workspace-signal-icon";

import "../system-pc.css";

export default function NotFound() {
    return (
        <div className="pc-system-page app-workspace-page flex h-dvh flex-col overflow-hidden text-foreground">
            <main className="pc-system-page-main app-workspace-page flex h-full min-h-0 items-center justify-center overflow-y-auto px-6 py-10 text-foreground">
                <section className="pc-system-card w-full max-w-md text-center" aria-labelledby="pc-not-found-title">
                    <div className="pc-system-code mb-2 text-xs font-semibold tabular-nums text-foreground/45">404</div>
                    <WorkspaceSignalIcon variant="empty" size="lg" className="pc-system-icon mx-auto mb-5" />
                    <p className="pc-system-eyebrow">页面导航</p>
                    <h1 id="pc-not-found-title" className="pc-system-title text-3xl font-semibold tracking-normal">
                        页面不存在
                    </h1>
                    <p className="pc-system-description mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">这个地址没有对应的页面，可能已经移动或被合并到其他入口。</p>
                    <div className="pc-system-actions mt-8 flex flex-wrap justify-center gap-3">
                        <Link
                            to="/"
                            className="pc-system-primary-action inline-flex h-9 items-center gap-2 rounded-md bg-stone-950 px-4 text-[var(--fs-body)] font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
                        >
                            <Home className="size-4" />
                            返回首页
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
