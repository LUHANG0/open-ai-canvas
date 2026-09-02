import { lazy, Suspense, type ComponentProps } from "react";

import type { CanvasShareModal as CanvasShareModalComponent } from "@/components/canvas/canvas-share-modal";
import type { CanvasStylePickerModal as CanvasStylePickerModalComponent } from "@/components/canvas/canvas-style-picker-modal";
import type { DirectorTemplateId } from "@/lib/canvas/director/director-templates";
import type { Position } from "@/types/canvas";
import type { LibTVImportDialog as LibTVImportDialogComponent } from "./components/libtv-import-dialog";
import type { TapNowImportDialog as TapNowImportDialogComponent } from "./components/tapnow-import-dialog";
import { resolveCanvasDirectorTemplateSelection } from "./canvas-project-entry-dialog-routing";

const CanvasShareModal = lazy(() => import("@/components/canvas/canvas-share-modal").then((module) => ({ default: module.CanvasShareModal })));
const CanvasStylePickerModal = lazy(() => import("@/components/canvas/canvas-style-picker-modal").then((module) => ({ default: module.CanvasStylePickerModal })));
const CanvasDirectorTemplateModal = lazy(() => import("@/components/canvas/director/canvas-director-template-modal").then((module) => ({ default: module.CanvasDirectorTemplateModal })));
const LibTVImportDialog = lazy(() => import("./components/libtv-import-dialog").then((module) => ({ default: module.LibTVImportDialog })));
const TapNowImportDialog = lazy(() => import("./components/tapnow-import-dialog").then((module) => ({ default: module.TapNowImportDialog })));

type ShareBeforeCreate = ComponentProps<typeof CanvasShareModalComponent>["beforeCreate"];
type ImportViewport = ComponentProps<typeof LibTVImportDialogComponent>["viewport"];
type ImportViewportSize = ComponentProps<typeof LibTVImportDialogComponent>["viewportSize"];
type LibTVApply = ComponentProps<typeof LibTVImportDialogComponent>["onApply"];
type TapNowApply = ComponentProps<typeof TapNowImportDialogComponent>["onApply"];
type StyleValue = ComponentProps<typeof CanvasStylePickerModalComponent>["value"];
type StyleSelect = ComponentProps<typeof CanvasStylePickerModalComponent>["onSelect"];

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
            {shareOpen ? <Suspense fallback={<CanvasEntryDialogLoading label="正在加载分享设置…" />}><CanvasShareModal projectId={projectId} open onClose={onCloseShare} beforeCreate={beforeCreateShare} /></Suspense> : null}
            {libTVImportOpen ? <Suspense fallback={<CanvasEntryDialogLoading label="正在加载 LibTV 导入…" />}><LibTVImportDialog open projectId={projectId} viewport={viewport} viewportSize={viewportSize} onClose={onCloseLibTVImport} onApply={onApplyLibTVImport} /></Suspense> : null}
            {tapNowImportOpen ? <Suspense fallback={<CanvasEntryDialogLoading label="正在加载 TapNow 导入…" />}><TapNowImportDialog open projectId={projectId} viewport={viewport} viewportSize={viewportSize} onClose={onCloseTapNowImport} onApply={onApplyTapNowImport} /></Suspense> : null}
            {stylePickerOpen ? <Suspense fallback={<CanvasEntryDialogLoading label="正在加载画风选择…" />}><CanvasStylePickerModal open value={styleValue} applying={styleApplying} onClose={onCloseStylePicker} onSelect={onSelectStyle} /></Suspense> : null}
            {directorTemplateRequest ? (
                <Suspense fallback={<CanvasEntryDialogLoading label="正在加载导演模板…" />}>
                    <CanvasDirectorTemplateModal
                        open
                        onClose={onCloseDirectorTemplate}
                        onSelect={(templateId) => {
                            const selection = resolveCanvasDirectorTemplateSelection(directorTemplateRequest, templateId);
                            onCreateDirectorShot(selection.templateId, selection.position);
                        }}
                    />
                </Suspense>
            ) : null}
        </>
    );
}

function CanvasEntryDialogLoading({ label }: { label: string }) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/20 px-5 backdrop-blur-sm" role="status" aria-live="polite">
            <div className="rounded-xl border bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">{label}</div>
        </div>
    );
}
