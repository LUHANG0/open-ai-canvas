import { useEffect, useState } from "react";

import CanvasProjectPage from "@/pages/canvas/project";
import { CANVAS_REPRO_PROJECT_ID, createCanvasReproProject } from "@/lib/canvas/canvas-repro-fixture";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

/**
 * DEV-only 画布 P0 复现台。
 *
 * 使用真实 CanvasProjectPage 和真实持久化 Store；只在隔离浏览器首次打开时写入
 * 一个固定夹具，刷新后保留用户在夹具上的修改，用于验证自动保存和恢复。
 * 该路由由 import.meta.env.DEV 守卫，生产构建不会包含本页。
 */
export default function CanvasReproLab() {
    const hydrated = useCanvasStore((state) => state.hydrated);
    const fixtureExists = useCanvasStore((state) => state.projects.some((project) => project.id === CANVAS_REPRO_PROJECT_ID));
    const replaceProjects = useCanvasStore((state) => state.replaceProjects);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!hydrated) return;
        if (!fixtureExists) replaceProjects([createCanvasReproProject()]);
        setReady(true);
    }, [fixtureExists, hydrated, replaceProjects]);

    if (!ready) {
        return (
            <main className="grid min-h-dvh place-items-center bg-neutral-100 text-sm text-neutral-600" role="status" aria-live="polite">
                正在准备画布 P0 验收夹具…
            </main>
        );
    }

    return <CanvasProjectPage />;
}
