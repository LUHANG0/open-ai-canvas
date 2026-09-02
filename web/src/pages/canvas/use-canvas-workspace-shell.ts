import { useCallback, useEffect, useState } from "react";
import { persistCanvasMediaPerformanceMode, readCanvasMediaPerformanceMode } from "@/lib/canvas/canvas-performance-mode";
import { persistCanvasWorkspaceMode, readCanvasWorkspaceMode } from "@/lib/canvas/canvas-project-domain";
import { getPanelWidthBounds } from "./canvas-assistant-panel-column";

export function initialCanvasAssistantWidth(viewportWidth: number) {
    if (viewportWidth < 768) return 300;
    if (viewportWidth < 1024) return 360;
    if (viewportWidth < 1440) return 440;
    return 520;
}

export function clampCanvasAssistantWidth(width: number, bounds: { min: number; max: number }) {
    return Math.min(bounds.max, Math.max(bounds.min, width));
}

type UseCanvasWorkspacePreferencesOptions = {
    preloadAssistant: () => void | Promise<unknown>;
};

export function useCanvasWorkspacePreferences({ preloadAssistant }: UseCanvasWorkspacePreferencesOptions) {
    const [workspaceMode, setWorkspaceMode] = useState(readCanvasWorkspaceMode);
    const [mediaPerformanceMode, setMediaPerformanceMode] = useState(readCanvasMediaPerformanceMode);
    const [assistantWidth, setAssistantWidth] = useState(() => initialCanvasAssistantWidth(typeof window !== "undefined" ? window.innerWidth : 1280));
    const [focusDockRevealed, setFocusDockRevealed] = useState(false);

    useEffect(() => {
        persistCanvasWorkspaceMode(workspaceMode);
    }, [workspaceMode]);

    useEffect(() => {
        persistCanvasMediaPerformanceMode(mediaPerformanceMode);
    }, [mediaPerformanceMode]);

    useEffect(() => {
        const clamp = () => setAssistantWidth((current) => clampCanvasAssistantWidth(current, getPanelWidthBounds()));
        window.addEventListener("resize", clamp);
        return () => window.removeEventListener("resize", clamp);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void preloadAssistant();
        }, 600);
        return () => window.clearTimeout(timer);
    }, [preloadAssistant]);

    return { assistantWidth, focusDockRevealed, mediaPerformanceMode, setAssistantWidth, setFocusDockRevealed, setMediaPerformanceMode, setWorkspaceMode, workspaceMode };
}

type UseCanvasTitleEditingOptions = {
    currentTitle: string | undefined;
    renameCurrentProject: (title: string) => void;
};

export function useCanvasTitleEditing({ currentTitle, renameCurrentProject }: UseCanvasTitleEditingOptions) {
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentTitle || "未命名画布");
        setTitleEditing(true);
    }, [currentTitle]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameCurrentProject(nextTitle);
        setTitleEditing(false);
    }, [renameCurrentProject, titleDraft]);

    const cancelTitleEditing = useCallback(() => setTitleEditing(false), []);

    return { cancelTitleEditing, finishTitleEditing, setTitleDraft, startTitleEditing, titleDraft, titleEditing };
}
