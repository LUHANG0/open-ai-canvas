import { useGenerationReadiness } from "@/hooks/use-generation-readiness";
import { GenerationStatusNotice } from "@/components/generation-status";
import { submitTaskIntent } from "@/lib/task-submission-intent";
import { canReplaceWorkbenchPrompt, planWorkbenchPresetSwitch } from "@/lib/workbench-preset-switch";
import { createClientUUID } from "@/lib/client-id";
import { App, Button, Input, InputNumber, Progress, Spin, Switch, Tooltip } from "antd";
import { Check, Camera, ChevronDown, Clapperboard, FileImage, ImagePlus, Images, Mic, Palette, Search, ShoppingBag, Sparkles, Upload, UserRound, Video, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ImageSizePicker } from "@/components/image-size-picker";
import { MediaPreview } from "@/components/media-preview";
import { ModelPicker } from "@/components/model-picker";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { Select } from "@/components/ui/base/select";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { AppModal } from "@/components/ui/product/app-modal";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { normalizeCanvasNodeMentionTokens, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { imageResolutionUsesQuality } from "@/lib/image-size-presets";
import { modelCapabilityConfigFor, normalizeImageValue, normalizeVideoValue } from "@/lib/model-capabilities";
import { creationVideoConfig } from "@/pages/create/creation-generation-config";
import { imageQualityLabel } from "@/lib/image-quality";
import { prepareBackendGenerationTask } from "@/services/api/generation-task";
import { createGenerationTask, cancelGenerationTask, queryGenerationTask, retryGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { capabilitySupportedModes, createWorkbenchTask, listWorkbenchTasks, listWorkbenchTools, normalizeWorkbenchGuide, resolveWorkbenchResourceURL, type WorkbenchKind, type WorkbenchPromptPreset, type WorkbenchTool } from "@/services/api/workbench";
import { getResource, resourceStorageKey, uploadResourceFile } from "@/services/api/resources";
import { useCreationPreferencesStore } from "@/stores/use-creation-preferences-store";
import { logicalModelIDForConfig, modelDisplayName, modelOptionName, resolveModelChannel, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import { workbenchCategoryLabel, workbenchCategories } from "./workbench-catalog";
import { missingWorkbenchInput, workbenchPromptRequired, workbenchVideoOperation } from "./workbench-input";
import { WorkbenchResults } from "./workbench-results";
import { WorkbenchViewer } from "./workbench-viewer";
import { workbenchTaskOutputs, workbenchDownloadName, type WorkbenchOutput } from "./workbench-outputs";
import { planWorkbenchReferences } from "./workbench-reference-policy";
import type { PickedWorkbenchReference } from "./workbench-reference-library";
import { downloadBrowserMedia } from "@/services/browser-download";
import { getActiveUserScope } from "@/lib/user-scope";
import "./workbench.css";
import "./workbench-experience.css";
import "./workbench-count-picker.css";

const WorkbenchReferenceLibrary = lazy(() => import("./workbench-reference-library").then((module) => ({ default: module.WorkbenchReferenceLibrary })));

export type WorkbenchReference = {
    id: string;
    name: string;
    kind: "image" | "video" | "audio";
    resourceId?: string;
    previewUrl: string;
    progress: number;
    uploading: boolean;
    error?: string;
    role: "reference" | "first_frame" | "last_frame";
    slotKey?: string;
};

export function filterWorkbenchTools(tools: WorkbenchTool[], category: string, query: string) {
    const normalized = query.trim().toLocaleLowerCase();
    return tools.filter(
        (tool) =>
            (category === "all" || (category === "recommended" ? tool.recommended || tool.categoryId === category : tool.categoryId === category)) &&
            (!normalized || `${tool.name} ${tool.subtitle} ${tool.description} ${workbenchCategoryLabel(tool.categoryId)} ${(tool.searchKeywords || []).join(" ")}`.toLocaleLowerCase().includes(normalized)),
    );
}

function parseInput(inputJson?: string) {
    if (!inputJson) return null;
    try {
        const parsed: unknown = JSON.parse(inputJson);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, any>) : null;
    } catch {
        return null;
    }
}

type WorkbenchTaskReferenceSnapshot = {
    resourceId: string;
    kind: WorkbenchReference["kind"];
    role?: WorkbenchReference["role"];
    slotKey?: string;
};

type WorkbenchTaskSnapshot = {
    kind: WorkbenchKind;
    toolId?: string;
    presetId?: string;
    parameters: Record<string, unknown>;
    references: WorkbenchTaskReferenceSnapshot[];
};

export function workbenchTaskSnapshot(task: GenerationTask): WorkbenchTaskSnapshot | null {
    const input = parseInput(task.inputJson);
    if (!input) return null;
    const metadata = input.metadata && typeof input.metadata === "object" ? (input.metadata as Record<string, any>) : {};
    const metadataSnapshot = metadata.workbench && typeof metadata.workbench === "object" ? (metadata.workbench as Record<string, any>) : {};
    const snapshot = input.workbench && typeof input.workbench === "object" ? (input.workbench as Record<string, any>) : metadataSnapshot;
    const kind = snapshot.kind || metadata.workbenchKind;
    if (kind !== "image" && kind !== "video") return null;
    const rawReferences = Array.isArray(snapshot.references) ? snapshot.references : [];
    const references = rawReferences.flatMap((value: unknown): WorkbenchTaskReferenceSnapshot[] => {
        if (!value || typeof value !== "object") return [];
        const reference = value as Record<string, unknown>;
        const resourceId = typeof reference.resourceId === "string" ? reference.resourceId.trim() : "";
        const referenceKind = reference.kind;
        if (!resourceId || (referenceKind !== "image" && referenceKind !== "video" && referenceKind !== "audio")) return [];
        const role = reference.role === "first_frame" || reference.role === "last_frame" || reference.role === "reference" ? reference.role : undefined;
        const slotKey = typeof reference.slotKey === "string" ? reference.slotKey : undefined;
        return [{ resourceId, kind: referenceKind, ...(role ? { role } : {}), ...(slotKey ? { slotKey } : {}) }];
    });
    const rawParameters = snapshot.parameters && typeof snapshot.parameters === "object" ? snapshot.parameters : {};
    return {
        kind,
        ...(typeof snapshot.toolId === "string" ? { toolId: snapshot.toolId } : typeof metadata.workbenchToolId === "string" ? { toolId: metadata.workbenchToolId } : {}),
        ...(typeof snapshot.presetId === "string" ? { presetId: snapshot.presetId } : typeof metadata.workbenchPresetId === "string" ? { presetId: metadata.workbenchPresetId } : {}),
        parameters: rawParameters as Record<string, unknown>,
        references,
    };
}

function revokeReferencePreview(reference: WorkbenchReference) {
    if (reference.previewUrl.startsWith("blob:")) URL.revokeObjectURL(reference.previewUrl);
}

// 当后台工具副标题看起来像模型 ID（前后端配置错误遗留），回退到工具描述或留空，避免泄露原始模型标识。
function isModelIdLike(value: string | undefined) {
    if (!value) return true;
    const normalized = value.trim();
    if (!normalized) return true;
    if (/^[a-z0-9][a-z0-9._-]{1,40}$/i.test(normalized) && /[._-]/.test(normalized)) return true;
    return false;
}

function toolVisual(tool: WorkbenchTool, kind: WorkbenchKind) {
    const text = `${tool.name} ${tool.subtitle || ""} ${tool.description || ""} ${(tool.searchKeywords || []).join(" ")}`.toLocaleLowerCase();
    if (text.includes("模特") || text.includes("人物") || text.includes("上身") || text.includes("穿搭")) return { icon: <UserRound />, tone: "people", label: "模特与人物" };
    if (text.includes("视频") || kind === "video") return { icon: <Clapperboard />, tone: "video", label: "镜头与视频" };
    if (text.includes("场景") || text.includes("氛围") || text.includes("背景")) return { icon: <Images />, tone: "scene", label: "场景与氛围" };
    if (text.includes("风格") || text.includes("海报") || text.includes("视觉")) return { icon: <Palette />, tone: "style", label: "风格与视觉" };
    if (text.includes("主图") || text.includes("商品") || text.includes("电商") || text.includes("白底")) return { icon: <ShoppingBag />, tone: "product", label: "商品出品" };
    return { icon: kind === "image" ? <Camera /> : <Sparkles />, tone: "creative", label: "创意生成" };
}

export function WorkbenchPage({ kind }: { kind: WorkbenchKind }) {
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const navigate = useNavigate();
    const videoWorkbenchEnabled = useUserStore((state) => state.features.videoWorkbenchEnabled);
    const userId = useUserStore((state) => state.user?.id);
    const [assetPicker, setAssetPicker] = useState<{ slotKey?: string; revision: number } | null>(null);
    const [taskDetails, setTaskDetails] = useState<Record<string, GenerationTask>>({});
    const [taskDetailErrors, setTaskDetailErrors] = useState<Record<string, string>>({});
    const detailEpoch = useRef(0);
    const composerUserRef = useRef(userId);
    const taskDetailsRef = useRef<Record<string, GenerationTask>>({});
    const detailFlights = useRef(new Map<string, Promise<GenerationTask | undefined>>());
    const [tasksError, setTasksError] = useState("");
    const [detailError, setDetailError] = useState("");
    const [outputKey, setOutputKey] = useState<string>();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [searchParams, setSearchParams] = useSearchParams();
    const [tools, setTools] = useState<WorkbenchTool[]>([]);
    const [directoryLoading, setDirectoryLoading] = useState(true);
    const [directoryError, setDirectoryError] = useState("");
    const [toolLibraryOpen, setToolLibraryOpen] = useState(false);
    const [toolSearch, setToolSearch] = useState("");
    const [toolCategory, setToolCategory] = useState("all");
    const [tool, setTool] = useState<WorkbenchTool | null>(null);
    const [prompt, setPrompt] = useState("");
    const [references, setReferencesState] = useState<WorkbenchReference[]>([]);
    const referencesRef = useRef<WorkbenchReference[]>([]);
    const setReferences = (update: WorkbenchReference[] | ((current: WorkbenchReference[]) => WorkbenchReference[])) => {
        const next = typeof update === "function" ? update(referencesRef.current) : update;
        referencesRef.current = next;
        setReferencesState(next);
    };
    useEffect(() => () => referencesRef.current.forEach(revokeReferencePreview), []);
    const [activeTask, setActiveTask] = useState<GenerationTask | null>(null);
    const workbenchRevisionRef = useRef(0);
    const [tasks, setTasks] = useState<GenerationTask[]>([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [detailTask, setDetailTask] = useState<GenerationTask | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const detailRequestRef = useRef(0);
    const [preset, setPreset] = useState<WorkbenchPromptPreset | null>(null);
    const [presetPending, setPresetPending] = useState<WorkbenchPromptPreset | null>(null);
    const [busy, setBusy] = useState(false);
    const submissionBusyRef = useRef<symbol | null>(null);
    const [taskBusyId, setTaskBusyId] = useState("");
    const [mobileTab, setMobileTab] = useState("generate");
    const [query, setQuery] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploadSlotKey, setUploadSlotKey] = useState<string | undefined>();
    const preferencesHydrated = useCreationPreferencesStore((state) => state.hydrated);
    const rememberImageSettings = useCreationPreferencesStore((state) => state.rememberImageSettings);
    const rememberVideoSettings = useCreationPreferencesStore((state) => state.rememberVideoSettings);
    const [settingsReady, setSettingsReady] = useState(false);
    const [ratio, setRatio] = useState(kind === "image" ? "1:1" : "16:9");
    const [quality, setQuality] = useState("auto");
    const [imageResolution, setImageResolution] = useState("auto");
    const [count, setCount] = useState("1");
    const [seconds, setSeconds] = useState("6");
    const [videoQuality, setVideoQuality] = useState("720");
    const capability = kind;
    const configuredModel = kind === "image" ? config.imageModel || config.model : config.videoModel || config.model;
    // 与创作页同一份可选目录。系统渠道模型通常没有 logicalModelId，不能据此滤成空列表。
    const models = useMemo(() => selectableModelsByCapability(config, capability), [capability, config]);
    const selectedModel = models.includes(configuredModel) ? configuredModel : models[0] || "";
    const currentModelRef = useRef(selectedModel);
    currentModelRef.current = selectedModel;
    const profile = useMemo(() => modelCapabilityConfigFor(config, selectedModel), [config, selectedModel]);
    const imageProfile = profile.image;
    const videoProfile = profile.video;
    const filteredTools = useMemo(() => filterWorkbenchTools(tools, toolCategory, toolSearch), [toolCategory, toolSearch, tools]);
    const quickTools = useMemo(() => {
        const preferred = tools.filter((item) => item.recommended);
        return (preferred.length ? preferred : tools).slice(0, 4);
    }, [tools]);
    const promptRequired = workbenchPromptRequired(tool);
    const missingInput = missingWorkbenchInput(tool, references);
    const selectedCount = Number(count) || 1;
    const promptReferences = useMemo<CanvasResourceReference[]>(
        () =>
            references.map((reference) => ({
                id: reference.id,
                nodeId: reference.id,
                kind: reference.kind,
                label: reference.name,
                title: reference.name,
                previewUrl: reference.previewUrl,
                ...(reference.resourceId ? { storageKey: resourceStorageKey(reference.resourceId) } : {}),
                active: true,
            })),
        [references],
    );
    const composerConfig = useMemo(
        () => (kind === "video" && selectedModel ? creationVideoConfig(config, selectedModel, { ratio, seconds, videoQuality }) : { ...config, model: selectedModel, imageModel: selectedModel, size: ratio, quality, imageResolution, count }),
        [config, count, imageResolution, kind, quality, ratio, seconds, selectedModel, videoQuality],
    );

    useEffect(() => {
        const controller = new AbortController();
        setDirectoryLoading(true);
        setDirectoryError("");
        listWorkbenchTools(kind, controller.signal, false)
            .then((directory) => {
                setTools(directory.tools.filter((item) => item.kind === kind && item.enabled !== false && (!capabilitySupportedModes(item).length || capabilitySupportedModes(item).includes(kind))).sort((a, b) => a.sortOrder - b.sortOrder));
            })
            .catch((error) => {
                if (!controller.signal.aborted) setDirectoryError(error instanceof Error ? error.message : "工具目录加载失败");
            })
            .finally(() => {
                if (!controller.signal.aborted) setDirectoryLoading(false);
            });
        return () => controller.abort();
    }, [kind]);

    useEffect(() => {
        const toolId = searchParams.get("tool");
        if (!toolId || !tools.length) return;
        const next = tools.find((item) => item.id === toolId);
        // 页内选择和任务恢复会先更新 tool 再改地址，这里只处理从外部链接切换过来的工具。
        if (!next || next.id === tool?.id) return;
        setTool(next);
        switchToolPrompt(next, searchParams.get("preset"));
        // 只随地址和目录变化触发；tool 变化不能触发，否则任务恢复在改地址前会被旧地址拉回。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, tools]);

    useEffect(() => {
        if (!preferencesHydrated || settingsReady || !imageProfile || !videoProfile) return;
        const saved = useCreationPreferencesStore.getState().preferences;
        if (kind === "image") {
            const normalized = normalizeImageValue(imageProfile, {
                size: saved.image?.ratio || imageProfile.size.default,
                quality: saved.image?.quality || imageProfile.quality.default,
                imageResolution: saved.image?.imageResolution || imageProfile.resolution.default,
                count: saved.image?.count || "1",
            });
            setRatio(normalized.size);
            setQuality(normalized.quality);
            setImageResolution(normalized.imageResolution || imageProfile.resolution.default || "auto");
            setCount(normalized.count);
        } else {
            const normalized = normalizeVideoValue(videoProfile, {
                seconds: saved.video?.seconds || String(videoProfile.duration.default),
                ratio: saved.video?.ratio || videoProfile.defaultRatio,
                resolution: saved.video?.videoQuality || videoProfile.defaultResolution,
            });
            setSeconds(normalized.seconds);
            setRatio(normalized.ratio);
            setVideoQuality(normalized.resolution.replace(/p$/i, ""));
        }
        setSettingsReady(true);
    }, [imageProfile, kind, preferencesHydrated, selectedModel, settingsReady, videoProfile]);

    useEffect(() => {
        if (!settingsReady || kind !== "image" || !imageProfile) return;
        const saved = useCreationPreferencesStore.getState().preferences.image;
        const normalized = normalizeImageValue(imageProfile, {
            size: saved?.ratio || imageProfile.size.default,
            quality: saved?.quality || imageProfile.quality.default,
            imageResolution: saved?.imageResolution || imageProfile.resolution.default,
            count: saved?.count || count,
        });
        setRatio(normalized.size);
        setQuality(normalized.quality);
        setImageResolution(normalized.imageResolution || imageProfile.resolution.default || "auto");
        setCount(normalized.count);
    }, [imageProfile, kind, selectedModel, settingsReady]);

    useEffect(() => {
        if (!settingsReady || kind !== "video" || !videoProfile) return;
        const saved = useCreationPreferencesStore.getState().preferences.video;
        const normalized = normalizeVideoValue(videoProfile, {
            seconds: saved?.seconds || String(videoProfile.duration.default),
            ratio: saved?.ratio || videoProfile.defaultRatio,
            resolution: saved?.videoQuality || videoProfile.defaultResolution,
        });
        setSeconds(normalized.seconds);
        setRatio(normalized.ratio);
        setVideoQuality(normalized.resolution.replace(/p$/i, ""));
    }, [kind, selectedModel, settingsReady, videoProfile]);

    const quoteRequirements = useMemo(
        () => ({
            capability,
            input: {
                textCount: prompt.trim() ? 1 : 0,
                imageCount: references.filter((reference) => reference.kind === "image").length,
                referenceImageCount: references.filter((reference) => reference.kind === "image" && reference.role !== "first_frame" && reference.role !== "last_frame").length,
                videoCount: references.filter((reference) => reference.kind === "video").length,
                audioCount: references.filter((reference) => reference.kind === "audio").length,
                characterCount: 0,
            },
            ...(kind === "image"
                ? { imageSize: ratio, options: { size: ratio, quality, ...(imageProfile?.resolution.supported ? { imageResolution } : {}), count: selectedCount } }
                : { videoSeconds: seconds, options: { size: ratio, videoSeconds: Number(seconds), vquality: videoQuality } }),
        }),
        [capability, imageProfile, imageResolution, kind, prompt, quality, ratio, references, seconds, selectedCount, videoQuality],
    );

    const generationStatus = useGenerationReadiness(composerConfig, selectedModel, capability, quoteRequirements, kind === "image" ? selectedCount : 1, kind === "video" ? seconds : 1);

    useEffect(() => {
        detailEpoch.current++;
        workbenchRevisionRef.current++;
        if (composerUserRef.current !== userId) {
            submissionBusyRef.current = null;
            setBusy(false);
            referencesRef.current.forEach(revokeReferencePreview);
            setReferences([]);
            setPrompt("");
            setTool(null);
            setPreset(null);
            setPresetPending(null);
            setQuery("");
            setMobileTab("generate");
            setToolLibraryOpen(false);
        }
        composerUserRef.current = userId;
        setTasks([]);
        setActiveTask(null);
        setTasksLoading(true);
        setTasksError("");
        taskDetailsRef.current = {};
        detailFlights.current.clear();
        setTaskDetails({});
        setTaskDetailErrors({});
        setDetailTask(null);
        setAssetPicker(null);
        setDetailLoading(false);
        detailRequestRef.current++;
        return () => {
            detailEpoch.current++;
        };
    }, [userId]);

    const loadTasks = useCallback(async () => {
        const scope = getActiveUserScope();
        const epoch = detailEpoch.current;
        try {
            const result = await listWorkbenchTasks(kind, 100);
            if (scope !== getActiveUserScope() || epoch !== detailEpoch.current) return [];
            setTasks(result);
            setTasksError("");
            return result;
        } catch (error) {
            if (scope !== getActiveUserScope() || epoch !== detailEpoch.current) return [];
            setTasksError(error instanceof Error ? error.message : "任务列表加载失败，已有记录已保留");
            return [];
        } finally {
            if (scope === getActiveUserScope() && epoch === detailEpoch.current) setTasksLoading(false);
        }
    }, [kind, userId]);

    useEffect(() => {
        let stopped = false;
        let timer = 0;
        const poll = async () => {
            const revision = workbenchRevisionRef.current;
            const result = await loadTasks();
            if (stopped) return;
            if (activeTask && revision === workbenchRevisionRef.current) {
                const latest = result.find((item) => item.id === activeTask.id);
                if (latest) {
                    setActiveTask(latest);
                    if (latest.status === "succeeded" || latest.status === "failed" || latest.status === "cancelled") setMobileTab("result");
                }
            }
            timer = window.setTimeout(() => void poll(), result.some((task) => task.status === "queued" || task.status === "running") ? 5000 : 30000);
        };
        void poll();
        const onVisible = () => {
            if (!document.hidden) {
                window.clearTimeout(timer);
                void poll();
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [activeTask?.id, loadTasks]);

    const resetWorkbench = () => {
        workbenchRevisionRef.current += 1;
        references.forEach(revokeReferencePreview);
        setReferences([]);
        setUploadSlotKey(undefined);
        setTool(null);
        setPreset(null);
        setPresetPending(null);
        setPrompt("");
        setActiveTask(null);
        detailRequestRef.current += 1;
        setDetailLoading(false);
        setDetailTask(null);
        setMobileTab("generate");
        setCount("1");
        setRatio(kind === "image" ? imageProfile?.size.default || "1:1" : videoProfile?.defaultRatio || "16:9");
        setQuality(imageProfile?.quality.default || "auto");
        setImageResolution(imageProfile?.resolution.default || "auto");
        setSeconds(String(videoProfile?.duration.default || 6));
        setVideoQuality((videoProfile?.defaultResolution || "720p").replace(/p$/i, ""));
        const params = new URLSearchParams(searchParams);
        params.delete("tool");
        params.delete("preset");
        setSearchParams(params, { replace: true });
        message.success("工作台已重置");
    };

    // 提示词为空，或仍是当前预设的原文（用户没改过），切换时可以直接替换；改过的内容先确认再动。
    const promptReplaceable = () => canReplaceWorkbenchPrompt(prompt, preset);

    // 切换工具后提示词必须跟着新工具走：未改动的模板直接换成新工具的预设（新工具没有预设则清空），
    // 用户改过的内容弹出"替换 / 追加 / 返回"确认，不能静默保留上一个工具的模板。
    const switchToolPrompt = (next: WorkbenchTool | null, preferredPresetId?: string | null) => {
        const decision = planWorkbenchPresetSwitch(prompt, preset, next?.presets || [], preferredPresetId);
        setPrompt(decision.prompt);
        setPreset(decision.preset);
        setPresetPending(decision.pending);
    };

    const chooseTool = (next: WorkbenchTool | null) => {
        workbenchRevisionRef.current++;
        setAssetPicker(null);
        references.forEach(revokeReferencePreview);
        setReferences([]);
        setUploadSlotKey(undefined);
        setTool(next);
        setToolLibraryOpen(false);
        const params = new URLSearchParams(searchParams);
        if (next) params.set("tool", next.id);
        else params.delete("tool");
        params.delete("preset");
        setSearchParams(params, { replace: true });
        switchToolPrompt(next);
    };

    const choosePreset = (next: WorkbenchPromptPreset) => {
        if (promptReplaceable()) {
            setPrompt(next.promptTemplate);
            setPreset(next);
            return;
        }
        setPresetPending(next);
    };

    const applyPreset = (mode: "replace" | "append") => {
        if (!presetPending) return;
        setPrompt((current) => (mode === "append" ? `${current.trimEnd()}\n${presetPending.promptTemplate}` : presetPending.promptTemplate));
        setPreset(presetPending);
        setPresetPending(null);
    };

    const updateImageSettings = (size: string, nextQuality?: string, nextResolution?: string) => {
        setRatio(size);
        rememberImageSettings({ ratio: size });
        if (nextQuality) {
            setQuality(nextQuality);
            rememberImageSettings({ quality: nextQuality });
        }
        if (nextResolution) {
            setImageResolution(nextResolution);
            rememberImageSettings({ imageResolution: nextResolution });
        }
    };

    const addFiles = async (files: FileList | File[], targetSlotKey = uploadSlotKey) => {
        const list = Array.from(files);
        const slot = tool?.inputContract?.slots.find((item) => item.key === targetSlotKey);
        const allowedTypes = slot?.mediaTypes || (kind === "image" ? ["image"] : ["image", "video", "audio"]);
        const accepted = list.filter((file) => allowedTypes.some((type) => file.type.startsWith(`${type}/`)));
        if (accepted.length !== list.length) message.warning(`该输入槽位仅支持${allowedTypes.map((type) => (type === "image" ? "图片" : type === "video" ? "视频" : "音频")).join("、")}`);
        const currentCount = references.filter((reference) => reference.slotKey === targetSlotKey).length;
        const maxCount = slot?.maxCount || (kind === "image" ? imageProfile?.references.maxImages || 0 : (videoProfile?.references.maxImages || 0) + (videoProfile?.references.maxVideos || 0) + (videoProfile?.references.maxAudios || 0));
        const picked = accepted.slice(0, Math.max(0, maxCount - currentCount));
        if (picked.length < accepted.length) message.warning("部分素材超过当前输入槽位数量上限，未添加");
        const pending: WorkbenchReference[] = picked.map((file) => ({
            id: createClientUUID(),
            name: file.name,
            kind: (file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "audio") as WorkbenchReference["kind"],
            previewUrl: URL.createObjectURL(file),
            progress: 0,
            uploading: true,
            role: "reference" as const,
            ...(targetSlotKey ? { slotKey: targetSlotKey } : {}),
        }));
        setReferences((current) => [...current, ...pending]);
        await Promise.all(
            pending.map(async (reference, index) => {
                const file = picked[index];
                try {
                    const resource = await uploadResourceFile(file, reference.kind, { fileName: file.name }, (uploaded, total) => {
                        setReferences((current) => current.map((item) => (item.id === reference.id ? { ...item, progress: total ? (uploaded / total) * 100 : 0 } : item)));
                    });
                    setReferences((current) => current.map((item) => (item.id === reference.id ? { ...item, resourceId: resource.id, uploading: false, progress: 100 } : item)));
                } catch (error) {
                    setReferences((current) => current.map((item) => (item.id === reference.id ? { ...item, uploading: false, error: error instanceof Error ? error.message : "上传失败" } : item)));
                }
            }),
        );
    };

    const removeReference = (reference: WorkbenchReference) => {
        revokeReferencePreview(reference);
        setReferences((current) => current.filter((item) => item.id !== reference.id));
    };

    const submit = async () => {
        if (submissionBusyRef.current) return;
        const scope = getActiveUserScope();
        const revision = workbenchRevisionRef.current;
        const submittedPrompt = normalizeCanvasNodeMentionTokens(prompt.trim(), promptReferences);
        if (tool?.inputContract?.promptRequired && !submittedPrompt) {
            message.warning("当前工具需要填写提示词");
            return;
        }
        if (!tool && !submittedPrompt) {
            message.warning("请填写提示词");
            return;
        }
        const missing = missingWorkbenchInput(tool, references);
        if (missing) {
            message.warning(`请补齐“${missing.name || "输入素材"}”`);
            return;
        }
        const logicalModelId = logicalModelIDForConfig({ ...composerConfig, model: selectedModel });
        const channel = resolveModelChannel(config, selectedModel);
        if (!selectedModel || !models.includes(selectedModel)) {
            message.error(`请选择可用的${kind === "image" ? "图片" : "视频"}模型`);
            return;
        }
        if (!generationStatus.canSubmit) {
            message.error(generationStatus.reason || generationStatus.fee.label);
            return;
        }
        if (references.some((reference) => reference.uploading || reference.error || !reference.resourceId)) {
            message.warning("请等待参考素材上传完成或移除失败素材");
            return;
        }
        if (submittedPrompt.length > (kind === "image" ? imageProfile?.references.promptMaxChars || 32000 : videoProfile?.references.promptMaxChars || 8000)) {
            message.error("提示词超过当前模型支持的长度");
            return;
        }
        const submissionToken = Symbol();
        submissionBusyRef.current = submissionToken;
        setBusy(true);
        try {
            const imageRequest = kind === "image" && imageProfile ? normalizeImageValue(imageProfile, { size: ratio, quality, imageResolution, imageParameters: config.imageParameters, count, transparentBackground: config.transparentBackground }) : null;
            const videoRequest = kind === "video" && videoProfile ? normalizeVideoValue(videoProfile, { seconds, ratio, resolution: videoQuality }) : null;
            const parameters = imageRequest
                ? { size: imageRequest.size, quality: imageRequest.quality, imageResolution: imageRequest.imageResolution, count: Number(imageRequest.count) }
                : {
                      seconds: Number(videoRequest?.seconds || seconds),
                      ratio: videoRequest?.ratio || ratio,
                      resolution: videoRequest?.resolution || videoQuality,
                      generateAudio: composerConfig.videoGenerateAudio === "true",
                      watermark: composerConfig.videoWatermark === "true",
                  };
            const generationConfig = {
                ...composerConfig,
                model: selectedModel,
                ...(imageRequest ? { imageModel: selectedModel, size: imageRequest.size, quality: imageRequest.quality, imageResolution: imageRequest.imageResolution, count: imageRequest.count } : {}),
                ...(videoRequest ? { videoModel: selectedModel, size: videoRequest.ratio, videoSeconds: videoRequest.seconds, vquality: videoRequest.resolution.replace(/p$/i, "") } : {}),
            };
            const readyReferences = references.filter((reference) => reference.resourceId);
            const videoOperation = kind === "video" ? workbenchVideoOperation(readyReferences) : undefined;
            const referenceSnapshot = readyReferences.map((reference) => ({ resourceId: reference.resourceId!, kind: reference.kind, role: reference.role, ...(reference.slotKey ? { slotKey: reference.slotKey } : {}) }));
            const submissionFingerprint = { kind, prompt: submittedPrompt, model: selectedModel, logicalModelId, channelId: channel?.id, toolId: tool?.id, presetId: preset?.id, parameters, references: referenceSnapshot };
            const createdTask =
                logicalModelId || channel?.scope === "system"
                    ? await submitTaskIntent(scope, kind, {
                          kind,
                          ...(tool ? { toolId: tool.id } : {}),
                          ...(tool && preset ? { presetId: preset.id } : {}),
                          prompt: submittedPrompt,
                          model: modelOptionName(selectedModel),
                          ...(logicalModelId ? { logicalModelId } : { channelId: channel.id }),
                          parameters,
                          references: readyReferences.map((reference) => ({ resourceId: reference.resourceId!, kind: reference.kind, role: reference.role, ...(reference.slotKey ? { slotKey: reference.slotKey } : {}) })),
                      }, createWorkbenchTask, () => scope === getActiveUserScope(), submissionFingerprint)
                    : await prepareBackendGenerationTask({
                          mode: kind,
                          prompt: submittedPrompt,
                          config: generationConfig,
                          referenceImages: readyReferences
                              .filter((reference) => reference.kind === "image")
                              .map((reference) => ({
                                  id: reference.id,
                                  name: reference.name,
                                  type: "image/*",
                                  dataUrl: "",
                                  storageKey: resourceStorageKey(reference.resourceId!),
                                  role: reference.role,
                                  ...(reference.slotKey ? { slotKey: reference.slotKey } : {}),
                              })),
                          referenceVideos: readyReferences
                              .filter((reference) => reference.kind === "video")
                              .map((reference) => ({
                                  id: reference.id,
                                  name: reference.name,
                                  type: "video/*",
                                  url: "",
                                  storageKey: resourceStorageKey(reference.resourceId!),
                                  role: reference.role,
                                  ...(reference.slotKey ? { slotKey: reference.slotKey } : {}),
                              })),
                          referenceAudios: readyReferences
                              .filter((reference) => reference.kind === "audio")
                              .map((reference) => ({
                                  id: reference.id,
                                  name: reference.name,
                                  type: "audio/*",
                                  url: "",
                                  storageKey: resourceStorageKey(reference.resourceId!),
                                  role: reference.role,
                                  ...(reference.slotKey ? { slotKey: reference.slotKey } : {}),
                              })),
                          metadata: {
                              source: "workbench",
                              workbenchKind: kind,
                              ...(videoOperation ? { videoEditOperation: videoOperation } : {}),
                              ...Object.fromEntries(
                                  readyReferences
                                      .filter((reference) => reference.role === "first_frame" || reference.role === "last_frame")
                                      .map((reference) => [reference.role === "first_frame" ? "videoStartFrameNodeId" : "videoEndFrameNodeId", reference.id]),
                              ),
                              ...(tool ? { workbenchToolId: tool.id, workbenchToolName: tool.name } : {}),
                              ...(tool && preset ? { workbenchPresetId: preset.id } : {}),
                              workbench: { kind, ...(tool ? { toolId: tool.id } : {}), ...(tool && preset ? { presetId: preset.id } : {}), parameters, references: referenceSnapshot },
                          },
                      }).then((taskInput) => submitTaskIntent(scope, kind, { ...taskInput, ...(videoOperation ? { operation: videoOperation } : {}) }, createGenerationTask, () => scope === getActiveUserScope(), submissionFingerprint));
            let task: GenerationTask;
            try {
                task = await queryGenerationTask(createdTask.id);
            } catch {
                if (scope !== getActiveUserScope()) return;
                message.warning("任务已提交，记录暂未读回，请刷新作品列表查看进度");
                void loadTasks();
                return;
            }
            if (scope !== getActiveUserScope()) return;
            setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
            if (revision === workbenchRevisionRef.current) {
                setActiveTask(task);
                setMobileTab("result");
            }
            message.success("生成任务已提交");
        } catch (error) {
            if (scope === getActiveUserScope()) message.error(error instanceof Error ? error.message : "任务提交失败");
        } finally {
            if (submissionBusyRef.current === submissionToken) {
                submissionBusyRef.current = null;
                setBusy(false);
            }
        }
    };

    const cancelTask = async (task: GenerationTask) => {
        setTaskBusyId(task.id);
        try {
            const next = await cancelGenerationTask(task.id);
            setTasks((current) => current.map((item) => (item.id === task.id ? next : item)));
            if (activeTask?.id === task.id) setActiveTask(next);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "取消任务失败");
        } finally {
            setTaskBusyId("");
        }
    };

    const restoreTaskToComposer = async (task: GenerationTask, notify = true) => {
        const snapshot = workbenchTaskSnapshot(task);
        if (!snapshot || snapshot.kind !== kind) {
            if (notify) message.warning("该任务没有可恢复的工作台参数");
            return false;
        }
        const scope = getActiveUserScope();
        const revision = ++workbenchRevisionRef.current;
        setAssetPicker(null);
        const restoredTool = snapshot.toolId ? tools.find((item) => item.id === snapshot.toolId) || null : null;
        const restoredPreset = restoredTool && snapshot.presetId ? restoredTool.presets.find((item) => item.id === snapshot.presetId) || null : null;
        const parameters = snapshot.parameters;
        if (kind === "image") {
            const restoredRatio = typeof parameters.size === "string" ? parameters.size : ratio;
            const restoredQuality = typeof parameters.quality === "string" ? parameters.quality : quality;
            const restoredResolution = typeof parameters.imageResolution === "string" ? parameters.imageResolution : imageResolution;
            const restoredCount = parameters.count != null ? String(parameters.count) : count;
            setRatio(restoredRatio);
            setQuality(restoredQuality);
            setImageResolution(restoredResolution);
            setCount(restoredCount);
            rememberImageSettings({ ratio: restoredRatio, quality: restoredQuality, imageResolution: restoredResolution, count: restoredCount });
        } else {
            const restoredSeconds = parameters.seconds != null ? String(parameters.seconds) : seconds;
            const restoredRatio = typeof parameters.ratio === "string" ? parameters.ratio : ratio;
            const restoredQuality = typeof parameters.resolution === "string" ? parameters.resolution.replace(/p$/i, "") : videoQuality;
            setSeconds(restoredSeconds);
            setRatio(restoredRatio);
            setVideoQuality(restoredQuality);
            rememberVideoSettings({ seconds: restoredSeconds, ratio: restoredRatio, videoQuality: restoredQuality });
            if (typeof parameters.generateAudio === "boolean") updateConfig("videoGenerateAudio", String(parameters.generateAudio));
            if (typeof parameters.watermark === "boolean") updateConfig("videoWatermark", String(parameters.watermark));
        }
        const restoredModel = task.model ? models.find((item) => item === task.model || modelOptionName(item) === task.model) : undefined;
        if (restoredModel) {
            updateConfig(kind === "image" ? "imageModel" : "videoModel", restoredModel);
            updateConfig("model", restoredModel);
        }
        setTool(restoredTool);
        setPreset(restoredPreset);
        setPrompt(task.prompt || "");
        setUploadSlotKey(undefined);
        referencesRef.current.forEach(revokeReferencePreview);
        setReferences([]);
        const restoredReferences = await Promise.all(
            snapshot.references.map(async (reference, index): Promise<WorkbenchReference> => ({
                id: createClientUUID(),
                name: `${reference.kind === "image" ? "图片" : reference.kind === "video" ? "视频" : "音频"} ${index + 1}`,
                kind: reference.kind,
                resourceId: reference.resourceId,
                previewUrl: (await resolveWorkbenchResourceURL(reference.resourceId, "original")) || "",
                progress: 100,
                uploading: false,
                role: reference.role || "reference",
                ...(reference.slotKey ? { slotKey: reference.slotKey } : {}),
            })),
        );
        if (scope !== getActiveUserScope() || revision !== workbenchRevisionRef.current) return false;
        setReferences(restoredReferences);
        const params = new URLSearchParams(searchParams);
        if (restoredTool) params.set("tool", restoredTool.id);
        else params.delete("tool");
        if (restoredPreset) params.set("preset", restoredPreset.id);
        else params.delete("preset");
        setSearchParams(params, { replace: true });
        setActiveTask(task);
        setMobileTab("generate");
        setDetailTask(null);
        if (notify) message.success("任务配置已载入编辑器");
        return true;
    };

    const retryTask = async (task: GenerationTask) => {
        setTaskBusyId(task.id);
        try {
            let restoreSource = task;
            if (!restoreSource.inputJson) {
                try {
                    restoreSource = await queryGenerationTask(task.id);
                } catch {
                    // The retry response also contains the safe restore snapshot.
                }
            }
            const restored = await restoreTaskToComposer(restoreSource, false);
            const next = await retryGenerationTask(task.id);
            if (!restored) await restoreTaskToComposer(next, false);
            setTasks((current) => [next, ...current.filter((item) => item.id !== next.id)]);
            setActiveTask(next);
            message.success("任务已重新提交");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "重试任务失败");
        } finally {
            setTaskBusyId("");
        }
    };

    const readTaskDetail = useCallback((task: GenerationTask, force = false): Promise<GenerationTask | undefined> => {
        const cached = taskDetailsRef.current[task.id];
        if (!force && cached?.updatedAt === task.updatedAt) return Promise.resolve(cached);
        const running = detailFlights.current.get(task.id);
        if (running) return running;
        const scope = getActiveUserScope();
        const epoch = detailEpoch.current;
        const request = queryGenerationTask(task.id)
            .then((detail) => {
                if (scope !== getActiveUserScope() || epoch !== detailEpoch.current) return undefined;
                taskDetailsRef.current[task.id] = detail;
                setTaskDetails((current) => ({ ...current, [detail.id]: detail }));
                setTaskDetailErrors((current) => {
                    const next = { ...current };
                    delete next[task.id];
                    return next;
                });
                return detail;
            })
            .catch((reason) => {
                if (scope === getActiveUserScope() && epoch === detailEpoch.current) setTaskDetailErrors((current) => ({ ...current, [task.id]: reason instanceof Error ? reason.message : "详细记录暂不可用，已有预览已保留" }));
                return undefined;
            })
            .finally(() => {
                if (detailFlights.current.get(task.id) === request) detailFlights.current.delete(task.id);
            });
        detailFlights.current.set(task.id, request);
        return request;
    }, []);

    const openDetail = async (task: GenerationTask, output?: WorkbenchOutput) => {
        const requestId = ++detailRequestRef.current;
        const scope = getActiveUserScope();
        setDetailTask(task);
        setOutputKey(output?.key);
        setDetailLoading(true);
        setDetailError("");
        const detail = await readTaskDetail(task, true);
        if (requestId !== detailRequestRef.current || scope !== getActiveUserScope()) return;
        if (detail) setDetailTask(detail);
        else setDetailError("详细记录暂不可用，请重新读取；已有预览已保留");
        setDetailLoading(false);
    };

    useEffect(() => {
        setAssetPicker(null);
    }, [selectedModel]);

    const referenceLimits = {
        image: kind === "image" ? imageProfile?.references.maxImages || 0 : videoProfile?.references.maxImages || 0,
        video: kind === "video" ? videoProfile?.references.maxVideos || 0 : 0,
        audio: kind === "video" ? videoProfile?.references.maxAudios || 0 : 0,
    };
    const pickerSlot = tool?.inputContract?.slots.find((slot) => slot.key === assetPicker?.slotKey);
    const pickerAccept = (pickerSlot?.mediaTypes || (kind === "image" ? ["image"] : ["image", "video", "audio"])) as Array<WorkbenchReference["kind"]>;
    const pickerCapacity = pickerAccept.reduce((sum, media) => sum + Math.max(0, referenceLimits[media] - references.filter((item) => item.kind === media).length), 0);
    const pickerRemaining = pickerSlot ? Math.min(pickerCapacity, Math.max(0, pickerSlot.maxCount - references.filter((item) => item.slotKey === pickerSlot.key).length)) : pickerCapacity;
    const addLibraryReferences = async (items: PickedWorkbenchReference[], targetSlotKey = assetPicker?.slotKey) => {
        const scope = getActiveUserScope();
        const revision = workbenchRevisionRef.current;
        if (assetPicker && assetPicker.revision !== revision) throw new Error("创作模板已变化，请重新选择素材");
        const modelSnapshot = currentModelRef.current;
        const referenceSnapshot = referencesRef.current;
        const planned = planWorkbenchReferences(referenceSnapshot, items, tool?.inputContract?.slots || [], referenceLimits, targetSlotKey);
        const resolved = await Promise.all(
            planned.map(async (item): Promise<WorkbenchReference> => {
                const resource = await getResource(item.resourceId);
                if (resource.kind !== item.kind || resource.status !== "ready") throw new Error("素材尚未就绪或类型已变化，请刷新素材库");
                const previewUrl = await resolveWorkbenchResourceURL(item.resourceId, item.kind === "image" ? "thumbnail" : "original");
                if (!previewUrl) throw new Error("无法读取所选素材，请重试");
                const role = item.slotKey === "first_frame" || item.slotKey === "last_frame" ? item.slotKey : "reference";
                return { ...item, id: createClientUUID(), role, previewUrl, progress: 100, uploading: false };
            }),
        );
        if (scope !== getActiveUserScope() || revision !== workbenchRevisionRef.current || referenceSnapshot !== referencesRef.current || modelSnapshot !== currentModelRef.current) throw new Error("账号或创作模板已变化，请重新选择素材");
        planWorkbenchReferences(referencesRef.current, items, tool?.inputContract?.slots || [], referenceLimits, targetSlotKey);
        setReferences((current) => [...current, ...resolved]);
    };
    const downloadOutput = (output: WorkbenchOutput) => {
        void downloadBrowserMedia({ url: output.url, storageKey: output.resourceId ? resourceStorageKey(output.resourceId) : output.storageKey, fileName: workbenchDownloadName(output, kind === "image" ? "创作图片" : "创作视频", output.index + 1) }).catch(
            (reason) => message.error(reason instanceof Error ? reason.message : "下载失败"),
        );
    };
    const reuseRecord = async (task: GenerationTask) => {
        const detail = task.inputJson ? task : await readTaskDetail(task, true);
        if (detail) await restoreTaskToComposer(detail);
        else message.warning("参数尚未读取，请重试");
    };
    const useOutputAsReference = async (output: WorkbenchOutput) => {
        if (!output.resourceId) return;
        try {
            await addLibraryReferences([{ resourceId: output.resourceId, kind: "image", name: "生成参考图" }]);
            setDetailTask(null);
            setMobileTab("generate");
        } catch (reason) {
            message.warning(reason instanceof Error ? reason.message : "参考图未能加入");
        }
    };

    const taskModelLabel = (task: GenerationTask) => {
        const rawModel = task.model?.trim() || "";
        if (!rawModel) return kind === "image" ? "图片生成" : "视频生成";
        const configuredModel = models.find((item) => item === rawModel || modelOptionName(item) === rawModel);
        const display = configuredModel ? modelDisplayName(config, configuredModel) : rawModel;
        return isModelIdLike(display) ? "生成模型" : display;
    };

    const settingsPanel =
        kind === "image" && imageProfile ? (
            <div className="workbench-settings-content">
                <ImageSizePicker profile={imageProfile} size={ratio} quality={quality} imageResolution={imageResolution} onChange={updateImageSettings} />
                {imageProfile.quality.supported && !imageResolutionUsesQuality(imageProfile) ? (
                    <label className="workbench-setting-row">
                        <span>图片质量</span>
                        <Select
                            aria-label="图片质量"
                            value={quality}
                            onChange={(value) => {
                                setQuality(value);
                                rememberImageSettings({ quality: value });
                            }}
                            options={imageProfile.quality.values.map((value) => ({ value, label: imageQualityLabel(value) }))}
                        />
                    </label>
                ) : null}
                <CountPicker
                    value={count}
                    max={imageProfile.maxOutputs}
                    onChange={(value) => {
                        setCount(value);
                        rememberImageSettings({ count: value });
                    }}
                />
            </div>
        ) : videoProfile ? (
            <div className="workbench-settings-content">
                <ParameterChips
                    label="视频时长"
                    value={seconds}
                    options={(videoProfile.duration.selection === "enum"
                        ? videoProfile.duration.values || []
                        : Array.from(
                              { length: Math.floor(((videoProfile.duration.max || 15) - (videoProfile.duration.min || 1)) / (videoProfile.duration.step || 1)) + 1 },
                              (_, index) => (videoProfile.duration.min || 1) + index * (videoProfile.duration.step || 1),
                          )
                    ).map((value) => ({ value: String(value), label: `${value} 秒` }))}
                    onChange={(value) => {
                        setSeconds(value);
                        rememberVideoSettings({ seconds: value });
                    }}
                />
                <ParameterChips
                    label="画面比例"
                    value={ratio}
                    options={videoProfile.ratios.map((value) => ({ value, label: value === "adaptive" ? "自适应" : value }))}
                    onChange={(value) => {
                        setRatio(value);
                        rememberVideoSettings({ ratio: value });
                    }}
                />
                <ParameterChips
                    label="清晰度"
                    value={videoQuality}
                    options={videoProfile.resolutions.map((value) => ({ value: value.replace(/p$/i, ""), label: value }))}
                    onChange={(value) => {
                        setVideoQuality(value);
                        rememberVideoSettings({ videoQuality: value });
                    }}
                />
                {videoProfile.generateAudio.supported || videoProfile.watermark.supported ? (
                    <div className="workbench-switch-row">
                        {videoProfile.generateAudio.supported ? (
                            <label>
                                <span>生成音频</span>
                                <Switch aria-label="生成音频" checked={config.videoGenerateAudio === "true"} onChange={(value) => updateConfig("videoGenerateAudio", String(value))} />
                            </label>
                        ) : null}
                        {videoProfile.watermark.supported ? (
                            <label>
                                <span>添加水印</span>
                                <Switch aria-label="添加水印" checked={config.videoWatermark === "true"} onChange={(value) => updateConfig("videoWatermark", String(value))} />
                            </label>
                        ) : null}
                    </div>
                ) : null}
            </div>
        ) : (
            <p className="workbench-list-empty">选择模型后，这里会显示该模型真正支持的参数。</p>
        );
    const toolLibrary = (
        <div className="workbench-tool-library" id="workbench-tool-library">
            <div className="workbench-tool-library-heading">
                <div>
                    <span>选一个场景，或直接写提示词</span>
                </div>
                {tool ? (
                    <button type="button" className="workbench-direct-create" onClick={() => chooseTool(null)}>
                        清除选择
                    </button>
                ) : null}
            </div>
            <Input aria-label="搜索创作工具" prefix={<Search className="size-4" />} value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder="搜索工具" allowClear />
            <div className="workbench-tool-categories app-control-group" role="group" aria-label="工具分类">
                {[{ value: "all", label: "全部" }, ...workbenchCategories].map((category) => (
                    <button type="button" key={category.value} data-slot="control-item" aria-pressed={toolCategory === category.value} onClick={() => setToolCategory(category.value)}>
                        <span data-slot="control-label">{category.label}</span>
                    </button>
                ))}
            </div>
            {directoryLoading ? (
                <div className="workbench-picker-state" role="status">
                    <Spin size="small" />
                    <span>正在加载创作工具</span>
                </div>
            ) : directoryError ? (
                <div className="workbench-tool-library-error" role="alert">
                    <span>{directoryError}</span>
                    <Button
                        size="small"
                        onClick={() => {
                            setDirectoryError("");
                            setDirectoryLoading(true);
                            listWorkbenchTools(kind)
                                .then((directory) =>
                                    setTools(
                                        directory.tools.filter((item) => item.kind === kind && item.enabled !== false && (!capabilitySupportedModes(item).length || capabilitySupportedModes(item).includes(kind))).sort((a, b) => a.sortOrder - b.sortOrder),
                                    ),
                                )
                                .catch((error) => setDirectoryError(error instanceof Error ? error.message : "工具目录加载失败"))
                                .finally(() => setDirectoryLoading(false));
                        }}
                    >
                        重试
                    </Button>
                </div>
            ) : (
                <div className="workbench-tool-grid">
                    {filteredTools.map((item) => (
                        <ToolCard
                            key={item.id}
                            tool={item}
                            selected={item.id === tool?.id}
                            onClick={() => {
                                chooseTool(item);
                                setToolLibraryOpen(false);
                            }}
                        />
                    ))}
                    {!filteredTools.length ? (
                        <div className="workbench-picker-state" role="status">
                            没有找到匹配的创作工具
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );

    return (
        <WorkspacePage fluid scroll={false} className="workbench-page is-gallery-layout">
            <div className="workbench-shell" data-kind={kind}>
                <section className={`workbench-columns ${mobileTab !== "generate" ? "is-mobile-secondary" : ""}`}>
                    <div className="workbench-mobile-tabs">
                        <SegmentedControl
                            ariaLabel="工具台视图"
                            value={mobileTab}
                            onChange={(value) => setMobileTab(String(value))}
                            options={[
                                { label: "创作", value: "generate" },
                                { label: "作品", value: "result" },
                            ]}
                        />
                    </div>

                    <section className={`workbench-input-column ${mobileTab === "generate" ? "is-mobile-active" : ""}`} aria-label="生成参数">
                        <div className="workbench-composer">
                            <div className="workbench-tool-bar">
                                <Button className="workbench-reset" type="text" aria-label="重置创作参数" onClick={resetWorkbench}>
                                    重置
                                </Button>
                                <span className="workbench-kind-label">{kind === "image" ? "图片生成" : "视频生成"}</span>
                                <button type="button" className="workbench-tool-choice" aria-expanded={toolLibraryOpen} aria-haspopup="dialog" aria-controls="workbench-tool-library" onClick={() => setToolLibraryOpen((open) => !open)}>
                                    <span className="workbench-tool-choice-mark">{tool?.iconUrl ? <img src={tool.iconUrl} alt="" /> : kind === "image" ? <FileImage /> : <Video />}</span>
                                    <span className="workbench-tool-choice-copy">
                                        <small>{tool ? (isModelIdLike(tool.subtitle) ? tool.description || "创作工具" : tool.subtitle || tool.description || "创作工具") : "直接创作"}</small>
                                        <strong>{tool?.name || "选择创作模板"}</strong>
                                    </span>
                                    <ChevronDown className={toolLibraryOpen ? "is-open" : ""} />
                                </button>
                            </div>
                            <AppModal
                                destroyOnHidden={false}
                                title="选择创作模板"
                                open={toolLibraryOpen}
                                onCancel={() => setToolLibraryOpen(false)}
                                footer={null}
                                width="min(1120px, calc(100vw - 32px))"
                                className="workbench-picker-modal"
                                rootClassName="workbench-overlay"
                            >
                                {toolLibrary}
                            </AppModal>
                            <div className="workbench-studio">
                                {!tool && tools.length ? (
                                    <details className="workbench-quick-templates">
                                        <summary>常用创作模板</summary>
                                        <section className="workbench-goal-picker" aria-label="快速选择创作模板">
                                            <div className="workbench-goal-heading">
                                                <div>
                                                    <div>
                                                        <strong>你现在要做什么？</strong>
                                                        <span>选择角色、场景或画面模板，也可以直接自由创作</span>
                                                    </div>
                                                </div>
                                                <button type="button" onClick={() => setToolLibraryOpen(true)}>
                                                    查看更多 <ChevronDown />
                                                </button>
                                            </div>
                                            <div className="workbench-goal-grid">
                                                {quickTools.map((item) => (
                                                    <QuickGoalCard key={item.id} tool={item} kind={kind} onClick={() => chooseTool(item)} />
                                                ))}
                                            </div>
                                        </section>
                                    </details>
                                ) : null}

                                {kind === "video" && searchParams.get("reference") ? (
                                    <div className="workbench-inline-note" role="status">
                                        <span>有一张图片可以用于这个镜头，添加后再调整描述和首尾帧用途。</span>
                                        <Button
                                            onClick={() => {
                                                const id = searchParams.get("reference")!;
                                                void addLibraryReferences([{ resourceId: id, kind: "image", name: "图片生成结果" }])
                                                    .then(() => {
                                                        const next = new URLSearchParams(searchParams);
                                                        next.delete("reference");
                                                        setSearchParams(next, { replace: true });
                                                    })
                                                    .catch((reason) => message.warning(reason instanceof Error ? reason.message : "参考图未能加入"));
                                            }}
                                        >
                                            加入参考图
                                        </Button>
                                        <Button
                                            type="text"
                                            onClick={() => {
                                                const next = new URLSearchParams(searchParams);
                                                next.delete("reference");
                                                setSearchParams(next, { replace: true });
                                            }}
                                        >
                                            忽略
                                        </Button>
                                    </div>
                                ) : null}
                                <details className="workbench-template-guide">
                                    <summary>使用说明与效果参考</summary>{" "}
                                    <div className="workbench-guide-stage">
                                        <div className="workbench-section-heading">
                                            <div>
                                                <h2>{tool?.name || "工具说明"}</h2>
                                                <span>创作指南与效果预览</span>
                                            </div>
                                        </div>
                                        {tool ? (
                                            <>
                                                <p className="workbench-guide-description">{tool.description || tool.subtitle}</p>
                                                {normalizeWorkbenchGuide(tool.guide) ? (
                                                    <div className="workbench-guide-copy">
                                                        {normalizeWorkbenchGuide(tool.guide)
                                                            .split("\n")
                                                            .filter(Boolean)
                                                            .map((line, index) => (
                                                                <p key={`${index}:${line}`}>{line}</p>
                                                            ))}
                                                    </div>
                                                ) : (
                                                    <div className="workbench-guide-empty">选择适合的模型和参考素材，写下你希望呈现的画面细节。</div>
                                                )}
                                                {tool.inputHint ? <p className="workbench-guide-input-hint">{tool.inputHint}</p> : null}
                                                {tool.inputContract?.slots.length ? (
                                                    <div className="workbench-guide-contract">
                                                        <strong>输入素材</strong>
                                                        {tool.inputContract.slots.map((slot) => (
                                                            <span key={slot.key}>
                                                                {slot.name} · {slot.required ? "必填" : "可选"} · 最多 {slot.maxCount} 个
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                {tool.resultExample?.imageUrls?.length || tool.resultExample?.videoUrl ? (
                                                    <div className="workbench-example-strip">
                                                        <span>{tool.resultExample.title || "效果参考"}</span>
                                                        {tool.resultExample.imageUrls?.slice(0, 3).map((url) => (
                                                            <span className="workbench-example-thumb" key={url}>
                                                                <img src={url} alt="工具效果参考" />
                                                            </span>
                                                        ))}
                                                        {tool.resultExample.videoUrl ? (
                                                            <span className="workbench-example-thumb">
                                                                <video src={tool.resultExample.videoUrl} muted />
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : (
                                            <div className="workbench-guide-empty">选定工具后，这里会展示创作说明和示例效果。</div>
                                        )}
                                    </div>
                                </details>
                                <div className="workbench-block-label">
                                    <div>
                                        <strong>描述你想要的成品</strong>
                                        <span>写清主体、动作、场景、光线和需要保留的细节</span>
                                    </div>
                                </div>
                                {tool?.presets.length ? (
                                    <div className="workbench-preset-row" role="group" aria-label="工具提示词模板">
                                        {tool.presets.map((item) => (
                                            <button
                                                type="button"
                                                key={item.id}
                                                className={`workbench-preset-chip ${preset?.id === item.id ? "is-active" : ""}`}
                                                aria-pressed={preset?.id === item.id}
                                                title={item.summary || item.name}
                                                onClick={() => choosePreset(item)}
                                            >
                                                {item.name}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="workbench-prompt-surface">
                                    <CanvasResourceMentionTextarea
                                        aria-label="生成提示词，可输入 @ 引用参考素材"
                                        className="workbench-prompt-input workbench-prompt-rich-editor"
                                        containerClassName="workbench-prompt-mention-container"
                                        value={prompt}
                                        references={promptReferences}
                                        onChange={setPrompt}
                                        onSubmit={() => void submit()}
                                        sendOnEnter={false}
                                        style={{ color: "var(--wb-text)" }}
                                        placeholder={kind === "image" ? "写下要生成的画面：主体、场景、构图、光线、风格" : "写下镜头里发生什么：主体、运动、光线、节奏、转场"}
                                        maxLength={kind === "image" ? imageProfile?.references.promptMaxChars || 32000 : videoProfile?.references.promptMaxChars || 8000}
                                    />
                                    <div className="workbench-prompt-meta">
                                        <span>
                                            {prompt.length} / {kind === "image" ? imageProfile?.references.promptMaxChars || 32000 : videoProfile?.references.promptMaxChars || 8000}
                                        </span>
                                        <span>⌘ / Ctrl + Enter</span>
                                    </div>
                                </div>
                                <div className="workbench-composer-toolbar">
                                    <span className="workbench-ref-count">
                                        参考素材 {references.length} /{" "}
                                        {kind === "image" ? imageProfile?.references.maxImages || 0 : (videoProfile?.references.maxImages || 0) + (videoProfile?.references.maxVideos || 0) + (videoProfile?.references.maxAudios || 0)}
                                    </span>
                                    <div className="workbench-toolbar-actions">
                                        <Button size="small" onClick={() => setAssetPicker({ revision: workbenchRevisionRef.current })} disabled={!pickerCapacity}>
                                            从素材库选择
                                        </Button>
                                        <Tooltip title="添加参考素材">
                                            <button type="button" aria-label="添加参考素材" onClick={() => fileRef.current?.click()}>
                                                <Upload />
                                            </button>
                                        </Tooltip>
                                        <Tooltip title="清空参考素材">
                                            <button type="button" aria-label="清空参考素材" onClick={() => references.forEach(removeReference)} disabled={!references.length}>
                                                <X />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                                {tool?.inputContract?.slots.length ? (
                                    <div className="workbench-reference-slots">
                                        {tool.inputContract.slots.map((slot) => {
                                            const slotReferences = references.filter((reference) => reference.slotKey === slot.key);
                                            const slotCapacity = Math.min(
                                                slot.maxCount - slotReferences.length,
                                                slot.mediaTypes.reduce((sum, media) => sum + Math.max(0, referenceLimits[media] - references.filter((item) => item.kind === media).length), 0),
                                            );
                                            const mediaLabel = slot.mediaTypes.map((type) => (type === "image" ? "图片" : type === "video" ? "视频" : "音频")).join(" / ");
                                            const openSlotPicker = () => {
                                                setUploadSlotKey(slot.key);
                                                fileRef.current?.click();
                                            };
                                            return (
                                                <section className="workbench-reference-slot" key={slot.key}>
                                                    <div className="workbench-reference-slot-heading">
                                                        <div className="workbench-reference-slot-copy">
                                                            <div className="workbench-reference-slot-title">
                                                                <strong>{slot.name || "参考素材"}</strong>
                                                                <span className={`workbench-reference-slot-requirement${slot.required ? " is-required" : ""}`}>{slot.required ? "必填" : "可选"}</span>
                                                            </div>
                                                            <Button size="small" onClick={() => setAssetPicker({ slotKey: slot.key, revision: workbenchRevisionRef.current })} disabled={slotCapacity <= 0}>
                                                                从素材库选择
                                                            </Button>
                                                            <div className="workbench-reference-slot-meta">
                                                                <span>
                                                                    {slot.minCount}-{slot.maxCount} 个
                                                                </span>
                                                                <span>{mediaLabel}</span>
                                                            </div>
                                                        </div>
                                                        {slotReferences.length ? (
                                                            <button type="button" className="workbench-slot-upload" onClick={openSlotPicker} aria-label={`为${slot.name}添加素材`} disabled={slotReferences.length >= slot.maxCount}>
                                                                <ImagePlus /> <span>添加</span>
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <div className="workbench-reference-grid">
                                                        {slotReferences.map((reference) => (
                                                            <ReferenceCard
                                                                key={reference.id}
                                                                reference={reference}
                                                                kind={kind}
                                                                onRemove={removeReference}
                                                                onRoleChange={(role) => setReferences((current) => current.map((item) => (item.id === reference.id ? { ...item, role } : item)))}
                                                            />
                                                        ))}
                                                        {!slotReferences.length ? (
                                                            <button type="button" className="workbench-reference-slot-empty" onClick={openSlotPicker} disabled={slotReferences.length >= slot.maxCount}>
                                                                <span className="workbench-reference-slot-empty-icon">
                                                                    <ImagePlus />
                                                                </span>
                                                                <span className="workbench-reference-slot-empty-copy">
                                                                    <strong>上传{slot.name || "参考"}素材</strong>
                                                                    <small>从设备中选择文件</small>
                                                                </span>
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="workbench-reference-grid">
                                        {references.map((reference) => (
                                            <ReferenceCard
                                                key={reference.id}
                                                reference={reference}
                                                kind={kind}
                                                onRemove={removeReference}
                                                onRoleChange={(role) => setReferences((current) => current.map((item) => (item.id === reference.id ? { ...item, role } : item)))}
                                            />
                                        ))}
                                        {!references.length || (kind === "video" && references.length < 5) ? (
                                            <button
                                                type="button"
                                                className="workbench-reference-add"
                                                onClick={() => {
                                                    setUploadSlotKey(undefined);
                                                    fileRef.current?.click();
                                                }}
                                            >
                                                <ImagePlus />
                                                <span>添加{kind === "image" ? "参考图" : "参考素材"}</span>
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    className="sr-only"
                                    accept={
                                        uploadSlotKey
                                            ? tool?.inputContract?.slots
                                                  .find((slot) => slot.key === uploadSlotKey)
                                                  ?.mediaTypes.map((type) => `${type}/*`)
                                                  .join(",")
                                            : kind === "image"
                                              ? "image/*"
                                              : "image/*,video/*,audio/*"
                                    }
                                    multiple
                                    onChange={(event) => {
                                        if (event.target.files) void addFiles(event.target.files, uploadSlotKey);
                                        event.currentTarget.value = "";
                                    }}
                                />
                                <section className="workbench-parameters" aria-label="生成参数">
                                    <header>
                                        <strong>{kind === "image" ? "图片参数" : "视频参数"}</strong>
                                        <span>{kind === "image" ? "尺寸、分辨率、质量和数量" : "时长、画幅、清晰度和音频"}</span>
                                    </header>
                                    {selectedModel ? settingsPanel : <p className="workbench-list-empty">先选择模型，再调整尺寸、数量或时长。</p>}
                                </section>
                            </div>
                            <div className="workbench-composer-dock" aria-label="生成设置">
                                {models.length ? (
                                    <ModelPicker
                                        config={config}
                                        value={selectedModel}
                                        capability={capability}
                                        requirements={{
                                            capability,
                                            input: {
                                                textCount: prompt.trim() ? 1 : 0,
                                                imageCount: references.filter((reference) => reference.kind === "image").length,
                                                referenceImageCount: references.filter((reference) => reference.kind === "image" && reference.role !== "first_frame" && reference.role !== "last_frame").length,
                                                videoCount: references.filter((reference) => reference.kind === "video").length,
                                                audioCount: references.filter((reference) => reference.kind === "audio").length,
                                                characterCount: 0,
                                            },
                                            ...(kind === "image"
                                                ? { imageSize: ratio, options: { size: ratio, quality, ...(imageProfile?.resolution.supported ? { imageResolution } : {}), count: selectedCount } }
                                                : { videoSeconds: seconds, options: { size: ratio, videoSeconds: Number(seconds), vquality: videoQuality } }),
                                        }}
                                        variant="creation"
                                        fullWidth
                                        className="creation-model-picker workbench-model-picker"
                                        showSelectedPrice={false}
                                        showOptionPrices
                                        onChange={(value) => {
                                            workbenchRevisionRef.current++;
                                            setAssetPicker(null);
                                            if (kind === "image") updateConfig("imageModel", value);
                                            else updateConfig("videoModel", value);
                                            updateConfig("model", value);
                                        }}
                                        placeholder={`选择${kind === "image" ? "图片" : "视频"}模型`}
                                    />
                                ) : (
                                    <div className="workbench-model-empty" role="status">
                                        <span>暂无可用的{kind === "image" ? "图片" : "视频"}模型</span>
                                        <a href="/settings?section=models" target="_blank" rel="noreferrer" aria-label="在新窗口打开模型设置">
                                            模型设置
                                        </a>
                                    </div>
                                )}
                                <div className="workbench-submit-estimate" aria-live="polite">
                                    <GenerationStatusNotice status={generationStatus} className="workbench-submit-estimate-label" />
                                    {selectedModel ? <span className="workbench-submit-estimate-model">使用 {modelDisplayName(config, selectedModel)}</span> : null}
                                </div>
                                <Button
                                    className="workbench-submit"
                                    type="primary"
                                    loading={busy}
                                    aria-busy={busy}
                                    disabled={!generationStatus.canSubmit || (promptRequired && !prompt.trim()) || Boolean(missingInput) || !selectedModel || references.some((reference) => reference.uploading || Boolean(reference.error))}
                                    onClick={() => void submit()}
                                >
                                    <Sparkles aria-hidden="true" />
                                    <span>{kind === "image" ? "生成图片" : "生成视频"}</span>
                                </Button>
                            </div>
                        </div>
                    </section>

                    <WorkbenchResults
                        tasks={tasks}
                        details={taskDetails}
                        detailErrors={taskDetailErrors}
                        kind={kind}
                        loading={tasksLoading}
                        error={tasksError}
                        query={query}
                        onQueryChange={setQuery}
                        onRefresh={() => void loadTasks()}
                        modelLabel={taskModelLabel}
                        busyId={taskBusyId}
                        actions={{
                            open: (task, output) => void openDetail(task, output),
                            loadDetail: async (task, force) => {
                                await readTaskDetail(task, force);
                            },
                            cancel: (task) => void cancelTask(task),
                            retry: (task) => void retryTask(task),
                            reuse: (task) => void reuseRecord(task),
                            download: downloadOutput,
                        }}
                    />
                </section>
            </div>

            <Suspense fallback={null}>
                {assetPicker ? (
                    <WorkbenchReferenceLibrary
                        open
                        accept={pickerAccept.filter((media) => referenceLimits[media] > references.filter((item) => item.kind === media).length)}
                        remaining={pickerRemaining}
                        slotName={pickerSlot?.name}
                        onClose={() => setAssetPicker(null)}
                        onPick={addLibraryReferences}
                    />
                ) : null}
            </Suspense>
            <WorkbenchViewer
                task={detailTask}
                kind={kind}
                loading={detailLoading}
                error={detailError}
                outputKey={outputKey}
                modelLabel={detailTask ? taskModelLabel(detailTask) : ""}
                parameters={detailTask ? workbenchTaskSnapshot(detailTask)?.parameters : undefined}
                busy={taskBusyId === detailTask?.id}
                onNavigate={(output) => setOutputKey(output.key)}
                onClose={() => {
                    detailRequestRef.current++;
                    setDetailTask(null);
                    setDetailLoading(false);
                }}
                onReload={() => {
                    if (detailTask)
                        void openDetail(
                            detailTask,
                            workbenchTaskOutputs(detailTask, kind).find((output) => output.key === outputKey),
                        );
                }}
                onDownload={downloadOutput}
                onReference={(output) => void useOutputAsReference(output)}
                onVideo={videoWorkbenchEnabled ? (output) => navigate(`/toolbox/video?reference=${encodeURIComponent(output.resourceId!)}`) : undefined}
                onReuse={() => {
                    if (detailTask) void reuseRecord(detailTask);
                }}
                onRetry={() => {
                    if (detailTask) void retryTask(detailTask);
                }}
            />

            <AppModal
                destroyOnHidden={false}
                title="提示词已有内容"
                rootClassName="workbench-overlay"
                open={Boolean(presetPending)}
                onCancel={() => setPresetPending(null)}
                footer={[
                    <Button key="cancel" onClick={() => setPresetPending(null)}>
                        返回
                    </Button>,
                    <Button key="append" onClick={() => applyPreset("append")}>
                        追加
                    </Button>,
                    <Button key="replace" type="primary" onClick={() => applyPreset("replace")}>
                        替换
                    </Button>,
                ]}
            >
                {presetPending ? <p>将应用“{presetPending.name}”提示词。你可以替换当前内容，也可以追加到末尾。</p> : null}
            </AppModal>
        </WorkspacePage>
    );
}

function CountPicker({ value, max, onChange }: { value: string; max: number; onChange: (value: string) => void }) {
    const limit = Math.min(10, Math.max(1, max || 1));
    const current = Math.min(limit, Math.max(1, Math.floor(Number(value) || 1)));
    return (
        <div className="workbench-count-picker">
            <span>生成数量</span>
            <div role="group" aria-label="生成数量">
                {Array.from({ length: limit }, (_, index) => index + 1).map((item) => (
                    <button key={item} type="button" aria-label={`生成 ${item} 张图片`} aria-pressed={current === item} className={current === item ? "is-active" : ""} onClick={() => onChange(String(item))}>
                        {item}
                    </button>
                ))}
                <InputNumber min={1} max={limit} precision={0} value={current} aria-label="输入生成数量" onChange={(next) => onChange(String(Math.min(limit, Math.max(1, Number(next) || 1))))} />
            </div>
        </div>
    );
}

function ParameterChips({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
    if (options.length > 7) {
        return (
            <label className="workbench-setting-row">
                <span>{label}</span>
                <Select aria-label={label} value={value} onChange={onChange} options={options} />
            </label>
        );
    }
    return (
        <div className="workbench-chip-field">
            <span>{label}</span>
            <div role="group" aria-label={label}>
                {options.map((option) => (
                    <button key={option.value} type="button" aria-pressed={value === option.value} className={value === option.value ? "is-active" : ""} onClick={() => onChange(option.value)}>
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function QuickGoalCard({ tool, kind, onClick }: { tool: WorkbenchTool; kind: WorkbenchKind; onClick: () => void }) {
    const visual = toolVisual(tool, kind);
    return (
        <button type="button" className={`workbench-goal-card is-${visual.tone}`} title={`${tool.name} · ${tool.subtitle || visual.label}`} onClick={onClick}>
            <span className="workbench-goal-icon">{tool.coverUrl || tool.iconUrl ? <img src={tool.coverUrl || tool.iconUrl} alt="" /> : visual.icon}</span>
            <span className="workbench-goal-copy">
                <strong>{tool.name}</strong>
                <small>{tool.subtitle || visual.label}</small>
            </span>
            <span className="workbench-goal-arrow">→</span>
        </button>
    );
}

function ToolCard({ tool, selected, onClick }: { tool: WorkbenchTool; selected: boolean; onClick: () => void }) {
    const visual = toolVisual(tool, tool.kind);
    const subtitle = isModelIdLike(tool.subtitle) ? tool.description || "" : tool.subtitle || tool.description;
    return (
        <button type="button" className={`workbench-tool-card ${selected ? "is-selected" : ""} is-${visual.tone}`} aria-pressed={selected} title={`${tool.name}${subtitle ? ` · ${subtitle}` : ""}`} onClick={onClick}>
            <div className="group/spotlight relative isolate workbench-tool-card-spotlight">
                <div className="workbench-tool-card-surface relative z-[1]">
                    <span className="workbench-tool-card-image">{tool.coverUrl || tool.iconUrl ? <img src={tool.coverUrl || tool.iconUrl} alt="" /> : visual.icon}</span>
                    <span className="workbench-tool-card-copy">
                        <strong>{tool.name}</strong>
                        <small>{subtitle}</small>
                    </span>
                    {selected ? (
                        <span className="workbench-tool-check">
                            <Check />
                        </span>
                    ) : null}
                </div>
            </div>
        </button>
    );
}

function ReferenceCard({ reference, kind, onRemove, onRoleChange }: { reference: WorkbenchReference; kind: WorkbenchKind; onRemove: (reference: WorkbenchReference) => void; onRoleChange: (role: WorkbenchReference["role"]) => void }) {
    return (
        <div className="workbench-reference">
            {reference.kind === "video" ? (
                <video src={reference.previewUrl} muted />
            ) : reference.kind === "audio" ? (
                <span className="workbench-audio-reference">
                    <Mic />
                </span>
            ) : (
                <img src={reference.previewUrl} alt={reference.name} />
            )}
            {reference.uploading ? <Progress type="circle" percent={Math.round(reference.progress)} size={34} /> : null}
            {reference.error ? (
                <span className="workbench-reference-error" title={reference.error}>
                    上传失败
                </span>
            ) : null}
            <button type="button" aria-label={`移除${reference.name}`} onClick={() => onRemove(reference)}>
                <X />
            </button>
            {kind === "video" && reference.kind === "image" && !reference.slotKey ? (
                <Select
                    size="small"
                    aria-label={`${reference.name} 的图片用途`}
                    value={reference.role}
                    onChange={onRoleChange}
                    options={[
                        { label: "参考图", value: "reference" },
                        { label: "首帧", value: "first_frame" },
                        { label: "尾帧", value: "last_frame" },
                    ]}
                />
            ) : null}
        </div>
    );
}

export default function ImageWorkbenchPage() {
    return <WorkbenchPage kind="image" />;
}

export function VideoWorkbenchPage() {
    return <WorkbenchPage kind="video" />;
}
