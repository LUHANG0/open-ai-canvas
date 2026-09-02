import type { ComponentProps } from "react";

import { CanvasShareModal } from "@/components/canvas/canvas-share-modal";
import { CanvasStylePickerModal } from "@/components/canvas/canvas-style-picker-modal";
import { CanvasDirectorTemplateModal } from "@/components/canvas/director/canvas-director-template-modal";
import type { DirectorTemplateId } from "@/lib/canvas/director/director-templates";
import type { Position } from "@/types/canvas";
import { LibTVImportDialog } from "./components/libtv-import-dialog";
import { TapNowImportDialog } from "./components/tapnow-import-dialog";
import { resolveCanvasDirectorTemplateSelection } from "./canvas-project-entry-dialog-routing";

type ShareBeforeCreate = ComponentProps<typeof CanvasShareModal>["beforeCreate"];
type ImportViewport = ComponentProps<typeof LibTVImportDialog>["viewport"];
type ImportViewportSize = ComponentProps<typeof LibTVImportDialog>["viewportSize"];
type LibTVApply = ComponentProps<typeof LibTVImportDialog>["onApply"];
type TapNowApply = ComponentProps<typeof TapNowImportDialog>["onApply"];
type StyleValue = ComponentProps<typeof CanvasStylePickerModal>["value"];
type StyleSelect = ComponentProps<typeof CanvasStylePickerModal>["onSelect"];

type CanvasProjectEntryDialogsProps = {
    projectId: string;
    viewport: ImportViewport;
    viewportSize: ImportViewportSize;
    shareOpen: boolean;
    onCloseShare: () => void;
    beforeCreateShare: ShareBeforeCreate;
    libTVImportOpen: boolean;
    onCloseLibTVImport: () => void;
    onApplyLibTVImport: LibTVApply;
    tapNowImportOpen: boolean;
    onCloseTapNowImport: () => void;
    onApplyTapNowImport: TapNowApply;
    stylePickerOpen: boolean;
    styleValue: StyleValue;
    styleApplying: boolean;
    onCloseStylePicker: () => void;
    onSelectStyle: StyleSelect;
    directorTemplateRequest: { position?: Position } | null;
    onCloseDirectorTemplate: () => void;
    onCreateDirectorShot: (templateId: DirectorTemplateId, position?: Position) => void;
};

export function CanvasProjectEntryDialogs({
    projectId,
    viewport,
    viewportSize,
    shareOpen,
    onCloseShare,
    beforeCreateShare,
    libTVImportOpen,
    onCloseLibTVImport,
    onApplyLibTVImport,
    tapNowImportOpen,
    onCloseTapNowImport,
    onApplyTapNowImport,
    stylePickerOpen,
    styleValue,
    styleApplying,
    onCloseStylePicker,
    onSelectStyle,
    directorTemplateRequest,
    onCloseDirectorTemplate,
    onCreateDirectorShot,
}: CanvasProjectEntryDialogsProps) {
    return (
        <>
            <CanvasShareModal projectId={projectId} open={shareOpen} onClose={onCloseShare} beforeCreate={beforeCreateShare} />
            <LibTVImportDialog open={libTVImportOpen} projectId={projectId} viewport={viewport} viewportSize={viewportSize} onClose={onCloseLibTVImport} onApply={onApplyLibTVImport} />
            <TapNowImportDialog open={tapNowImportOpen} projectId={projectId} viewport={viewport} viewportSize={viewportSize} onClose={onCloseTapNowImport} onApply={onApplyTapNowImport} />
            <CanvasStylePickerModal open={stylePickerOpen} value={styleValue} applying={styleApplying} onClose={onCloseStylePicker} onSelect={onSelectStyle} />
            <CanvasDirectorTemplateModal
                open={Boolean(directorTemplateRequest)}
                onClose={onCloseDirectorTemplate}
                onSelect={(templateId) => {
                    const selection = resolveCanvasDirectorTemplateSelection(directorTemplateRequest, templateId);
                    onCreateDirectorShot(selection.templateId, selection.position);
                }}
            />
        </>
    );
}
