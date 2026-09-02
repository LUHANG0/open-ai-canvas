import type { ChangeEventHandler, ComponentProps, RefObject } from "react";

import { CanvasLocalAgentPanel } from "@/components/canvas/canvas-local-agent-panel";
import { CanvasNodeInfoModal } from "@/components/canvas/canvas-node-toolbar";
import { CanvasUploadModal } from "@/components/canvas/canvas-upload-modal";
import { CANVAS_IMPORT_ACCEPT, shouldMountCanvasHeadlessAgent } from "./canvas-utility-overlay-state";

type CanvasProjectUtilityDialogsProps = {
    upload: ComponentProps<typeof CanvasUploadModal>;
    fileInputRef: RefObject<HTMLInputElement | null>;
    onFileInputChange: ChangeEventHandler<HTMLInputElement>;
    info: ComponentProps<typeof CanvasNodeInfoModal>;
};

export function CanvasProjectUtilityDialogs({ upload, fileInputRef, onFileInputChange, info }: CanvasProjectUtilityDialogsProps) {
    return (
        <>
            <CanvasUploadModal {...upload} />
            <input ref={fileInputRef} type="file" accept={CANVAS_IMPORT_ACCEPT} className="hidden" onChange={onFileInputChange} />
            <CanvasNodeInfoModal {...info} />
        </>
    );
}

type CanvasProjectHeadlessAgentProps = {
    compactAgent: boolean;
    assistantMounted: boolean;
    panel: Omit<ComponentProps<typeof CanvasLocalAgentPanel>, "headless">;
};

export function CanvasProjectHeadlessAgent({ compactAgent, assistantMounted, panel }: CanvasProjectHeadlessAgentProps) {
    if (!shouldMountCanvasHeadlessAgent(compactAgent, assistantMounted)) return null;
    return <CanvasLocalAgentPanel {...panel} headless />;
}
