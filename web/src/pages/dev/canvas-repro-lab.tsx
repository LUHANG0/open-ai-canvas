import { useEffect, useState } from "react";
import { useParams } from "react-router";

import CanvasProjectPage from "@/pages/canvas/project";
import { CANVAS_LARGE_REPRO_PROJECT_ID, CANVAS_REPRO_PROJECT_ID, createCanvasReproProject, createLargeCanvasReproProject } from "@/lib/canvas/canvas-repro-fixture";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

/**
 * DEV-only 画布 P0 复现台。
 *
 * 使用真实 CanvasProjectPage 和真实持久化 Store；只在隔离浏览器首次打开时写入
 * 一个固定夹具，刷新后保留用户在夹具上的修改，用于验证自动保存和恢复。
 * 该路由由 import.meta.env.DEV 守卫，生产构建不会包含本页。
 */
export default function CanvasReproLab() {
    const { id = "" } = useParams();
    const fixtureId = id === CANVAS_LARGE_REPRO_PROJECT_ID ? CANVAS_LARGE_REPRO_PROJECT_ID : CANVAS_REPRO_PROJECT_ID;
    const hydrated = useCanvasStore((state) => state.hydrated);
    const fixtureExists = useCanvasStore((state) => state.projects.some((project) => project.id === fixtureId));
    const replaceProjects = useCanvasStore((state) => state.replaceProjects);
    const [readyFixtureId, setReadyFixtureId] = useState("");

    useEffect(() => {
        if (!hydrated) return;
        if (!fixtureExists) {
            const fixture = fixtureId === CANVAS_LARGE_REPRO_PROJECT_ID ? createLargeCanvasReproProject() : createCanvasReproProject();
            replaceProjects([...useCanvasStore.getState().projects.filter((project) => project.id !== fixtureId), fixture]);
        }
        setReadyFixtureId(fixtureId);
    }, [fixtureExists, fixtureId, hydrated, replaceProjects]);

    if (readyFixtureId !== fixtureId) {
        return (
            <main className="grid min-h-dvh place-items-center bg-neutral-100 text-sm text-neutral-600" role="status" aria-live="polite">
                正在准备画布验收夹具…
            </main>
        );
    }

    return <CanvasProjectPage />;
}
