import { useState } from "react";

import type { Position } from "@/types/canvas";

export type CanvasDirectorTemplateRequest = { position?: Position };

export function useCanvasProjectDialogState() {
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [tapNowImportOpen, setTapNowImportOpen] = useState(false);
    const [nodeSearchOpen, setNodeSearchOpen] = useState(false);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    const [directorTemplateRequest, setDirectorTemplateRequest] = useState<CanvasDirectorTemplateRequest | null>(null);
    const [libTVImportOpen, setLibTVImportOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    return {
        clearConfirmOpen,
        directorTemplateRequest,
        libTVImportOpen,
        nodeSearchOpen,
        setClearConfirmOpen,
        setDirectorTemplateRequest,
        setLibTVImportOpen,
        setNodeSearchOpen,
        setShareModalOpen,
        setShortcutsOpen,
        setStylePickerOpen,
        setTapNowImportOpen,
        shareModalOpen,
        shortcutsOpen,
        stylePickerOpen,
        tapNowImportOpen,
    };
}
