import { lazy, Suspense } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";
import type { DirectorScene, DirectorSceneOutput } from "@/types/director";
import { selectCanvasDirectorImageNodes } from "./canvas-director-workbench-inputs";
import { CanvasWorkspaceLoadingOverlay } from "./canvas-workspace-loading-overlay";

const CanvasDirectorWorkbench = lazy(() => import("@/components/canvas/director/canvas-director-workbench").then((module) => ({ default: module.CanvasDirectorWorkbench })));

type CanvasProjectDirectorWorkbenchProps = {
    open: boolean;
    scene: DirectorScene | null;
    nodes: CanvasNodeData[];
    theme: CanvasTheme;
    onboardingScope: string;
    onClose: () => void;
    onChange: (scene: DirectorScene) => void;
    onApply: (output: DirectorSceneOutput) => Promise<void>;
    onDeleteImageNode: (nodeId: string) => void;
    onFlush: () => void | Promise<void>;
};

export function CanvasProjectDirectorWorkbench({ open, scene, nodes, theme, onboardingScope, onClose, onChange, onApply, onDeleteImageNode, onFlush }: CanvasProjectDirectorWorkbenchProps) {
    if (!open || !scene) return null;
    return (
        <Suspense
            fallback={
                <CanvasWorkspaceLoadingOverlay theme={theme} title="正在加载 3D 导演台" description="准备场景、镜头与空间控制。" />
            }
        >
            <CanvasDirectorWorkbench
                open
                scene={scene}
                imageNodes={selectCanvasDirectorImageNodes(nodes)}
                onClose={onClose}
                onChange={onChange}
                onApply={onApply}
                onDeleteImageNode={onDeleteImageNode}
                onFlush={onFlush}
                onboardingScope={onboardingScope}
            />
        </Suspense>
    );
}
