import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useNavigation } from "react-router";

import { navigationTools } from "@/constant/navigation-tools";

/** Data-router lazy keeps the current entry mounted until its replacement is ready. */
export function WorkspaceEntryStage({ children }: { children: ReactNode }) {
    const navigation = useNavigation();
    const target = navigation.location?.pathname;
    const label = target === "/toolbox/image" ? "图片生成" : target === "/toolbox/video" ? "视频生成" : navigationTools.find((item) => `/${item.slug}` === target)?.label;
    const pending = navigation.state === "loading" && Boolean(label);
    const [visible, setVisible] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        // A keyboard command may originate in the old page, which becomes inert while loading.
        if (pending && contentRef.current?.contains(document.activeElement)) stageRef.current?.focus({ preventScroll: true });
    }, [pending]);

    useEffect(() => {
        setVisible(false);
        if (!pending) return;
        const timer = window.setTimeout(() => setVisible(true), 140);
        return () => window.clearTimeout(timer);
    }, [pending, target]);

    return (
        <div ref={stageRef} tabIndex={-1} aria-label="页面内容" aria-busy={pending} className="relative h-full min-h-0 outline-none" data-workspace-entry-stage>
            <div ref={contentRef} inert={pending} className="h-full min-h-0">{children}</div>
            {pending && visible ? <div role="status" className="absolute right-4 top-3 z-10 rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-surface-strong)] px-3 py-2 text-xs text-foreground/65">正在打开{label}…</div> : null}
        </div>
    );
}
