import { lazy, Suspense, type ComponentProps } from "react";

import type { AssetPickerModal as AssetPickerModalComponent } from "@/components/canvas/asset-picker-modal";
import type { CanvasProjectAssetModal as CanvasProjectAssetModalComponent } from "@/components/canvas/canvas-project-asset-modal";
import type { CanvasNodeData } from "@/types/canvas";
import { focusCanvasVersionFromCompare, resolveCanvasProjectFolderInsertHandler } from "./canvas-project-library-routing";

const AssetPickerModal = lazy(() => import("@/components/canvas/asset-picker-modal").then((module) => ({ default: module.AssetPickerModal })));
const CanvasProjectAssetModal = lazy(() => import("@/components/canvas/canvas-project-asset-modal").then((module) => ({ default: module.CanvasProjectAssetModal })));
const CanvasVersionCompareModal = lazy(() => import("@/components/canvas/canvas-version-compare-modal").then((module) => ({ default: module.CanvasVersionCompareModal })));

type AssetPickerInsert = ComponentProps<typeof AssetPickerModalComponent>["onInsert"];
type ProjectAssetDetail = ComponentProps<typeof CanvasProjectAssetModalComponent>["detail"];
type ProjectAssetInsert = ComponentProps<typeof CanvasProjectAssetModalComponent>["onInsert"];
type ProjectFolderInsert = NonNullable<ComponentProps<typeof CanvasProjectAssetModalComponent>["onInsertFolder"]>;

export function CanvasProjectVersionCompareDialog({
    open,
    versions,
    onClose,
    onSetPrimary,
    onFocus,
}: {
    open: boolean;
    versions: CanvasNodeData[];
    onClose: () => void;
    onSetPrimary: (nodeId: string) => void;
    onFocus: (nodeId: string) => void;
}) {
    if (!open) return null;
    return (
        <Suspense fallback={<CanvasLibraryDialogLoading label="正在加载版本对比…" />}>
            <CanvasVersionCompareModal open versions={versions} onClose={onClose} onSetPrimary={onSetPrimary} onFocus={(nodeId) => focusCanvasVersionFromCompare(nodeId, onClose, onFocus)} />
        </Suspense>
    );
}

export function CanvasProjectAssetDialogs({
    assetPickerOpen,
    assetInsertScope,
    onInsertLibraryAssets,
    onCloseAssetPicker,
    projectAssetOpen,
    projectDetail,
    projectAssetInitialCategory,
    projectAssetInitialFolderId,
    projectAssetScope,
    onCloseProjectAssets,
    onInsertProjectAssets,
    onInsertProjectFolder,
}: {
    assetPickerOpen: boolean;
    assetInsertScope: string;
    onInsertLibraryAssets: AssetPickerInsert;
    onCloseAssetPicker: () => void;
    projectAssetOpen: boolean;
    projectDetail: ProjectAssetDetail;
    projectAssetInitialCategory: string;
    projectAssetInitialFolderId: string;
    projectAssetScope: string;
    onCloseProjectAssets: () => void;
    onInsertProjectAssets: ProjectAssetInsert;
    onInsertProjectFolder: ProjectFolderInsert;
}) {
    return (
        <>
            {assetPickerOpen ? (
                <Suspense fallback={<CanvasLibraryDialogLoading label="正在加载素材库…" />}>
                    <AssetPickerModal open multiple={assetInsertScope === "canvas"} onInsert={onInsertLibraryAssets} onClose={onCloseAssetPicker} />
                </Suspense>
            ) : null}
            {projectAssetOpen ? (
                <Suspense fallback={<CanvasLibraryDialogLoading label="正在加载项目素材…" />}>
                    <CanvasProjectAssetModal
                        open
                        detail={projectDetail}
                        initialCategory={projectAssetInitialCategory}
                        initialFolderId={projectAssetInitialFolderId}
                        onClose={onCloseProjectAssets}
                        onInsert={onInsertProjectAssets}
                        onInsertFolder={resolveCanvasProjectFolderInsertHandler(projectAssetScope, onInsertProjectFolder)}
                    />
                </Suspense>
            ) : null}
        </>
    );
}

function CanvasLibraryDialogLoading({ label }: { label: string }) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/20 px-5 backdrop-blur-sm" role="status" aria-live="polite">
            <div className="rounded-xl border bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">{label}</div>
        </div>
    );
}
