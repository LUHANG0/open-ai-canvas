import { lazy, Suspense, type ChangeEventHandler, type ComponentProps, type RefObject } from "react";

import type { CanvasLocalAgentPanel as CanvasLocalAgentPanelComponent } from "@/components/canvas/canvas-local-agent-panel";
import { CanvasNodeInfoModal } from "@/components/canvas/canvas-node-toolbar";
import type { CanvasUploadModal as CanvasUploadModalComponent } from "@/components/canvas/canvas-upload-modal";
import { CANVAS_IMPORT_ACCEPT, shouldMountCanvasHeadlessAgent } from "./canvas-utility-overlay-state";

const CanvasLocalAgentPanel = lazy(() => import("@/components/canvas/canvas-local-agent-panel").then((module) => ({ default: module.CanvasLocalAgentPanel })));
const CanvasUploadModal = lazy(() => import("@/components/canvas/canvas-upload-modal").then((module) => ({ default: module.CanvasUploadModal })));

type CanvasProjectUtilityDialogsProps = {
    upload: ComponentProps<typeof CanvasUploadModalComponent>;
    fileInputRef: RefObject<HTMLInputElement | null>;
    onFileInputChange: ChangeEventHandler<HTMLInputElement>;
    info: ComponentProps<typeof CanvasNodeInfoModal>;
};

export function CanvasProjectUtilityDialogs({ upload, fileInputRef, onFileInputChange, info }: CanvasProjectUtilityDialogsProps) {
    return (
        <>
            {upload.open ? (
                <Suspense fallback={<CanvasUtilityDialogLoading label="正在加载上传工具…" />}>
                    <CanvasUploadModal {...upload} />
                </Suspense>
            ) : null}
            <input ref={fileInputRef} type="file" accept={CANVAS_IMPORT_ACCEPT} className="hidden" onChange={onFileInputChange} />
            <CanvasNodeInfoModal {...info} />
        </>
    );
}

type CanvasProjectHeadlessAgentProps = {
    compactAgent: boolean;
    assistantMounted: boolean;
    panel: Omit<ComponentProps<typeof CanvasLocalAgentPanelComponent>, "headless">;
};

export function CanvasProjectHeadlessAgent({ compactAgent, assistantMounted, panel }: CanvasProjectHeadlessAgentProps) {
    if (!shouldMountCanvasHeadlessAgent(compactAgent, assistantMounted)) return null;
    return <Suspense fallback={null}><CanvasLocalAgentPanel {...panel} headless /></Suspense>;
}

function CanvasUtilityDialogLoading({ label }: { label: string }) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/20 px-5 backdrop-blur-sm" role="status" aria-live="polite">
            <div className="rounded-xl border bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">{label}</div>
        </div>
    );
}
