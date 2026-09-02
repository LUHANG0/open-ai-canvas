import type { ComponentProps } from "react";

import { AssetPickerModal } from "@/components/canvas/asset-picker-modal";
import { CanvasProjectAssetModal } from "@/components/canvas/canvas-project-asset-modal";
import { CanvasVersionCompareModal } from "@/components/canvas/canvas-version-compare-modal";
import type { CanvasNodeData } from "@/types/canvas";
import { focusCanvasVersionFromCompare, resolveCanvasProjectFolderInsertHandler } from "./canvas-project-library-routing";

type AssetPickerInsert = ComponentProps<typeof AssetPickerModal>["onInsert"];
type ProjectAssetDetail = ComponentProps<typeof CanvasProjectAssetModal>["detail"];
type ProjectAssetInsert = ComponentProps<typeof CanvasProjectAssetModal>["onInsert"];
type ProjectFolderInsert = NonNullable<ComponentProps<typeof CanvasProjectAssetModal>["onInsertFolder"]>;

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
    return <CanvasVersionCompareModal open={open} versions={versions} onClose={onClose} onSetPrimary={onSetPrimary} onFocus={(nodeId) => focusCanvasVersionFromCompare(nodeId, onClose, onFocus)} />;
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
            <AssetPickerModal open={assetPickerOpen} multiple={assetInsertScope === "canvas"} onInsert={onInsertLibraryAssets} onClose={onCloseAssetPicker} />
            <CanvasProjectAssetModal
                open={projectAssetOpen}
                detail={projectDetail}
                initialCategory={projectAssetInitialCategory}
                initialFolderId={projectAssetInitialFolderId}
                onClose={onCloseProjectAssets}
                onInsert={onInsertProjectAssets}
                onInsertFolder={resolveCanvasProjectFolderInsertHandler(projectAssetScope, onInsertProjectFolder)}
            />
        </>
    );
}
