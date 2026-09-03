import { useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { App, Button, Dropdown, Input, Popconfirm, Tooltip } from "antd";
import CharacterCount from "@tiptap/extension-character-count";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Check, BookOpenText, Clapperboard, Crosshair, FileUp, GripVertical, MoreHorizontal, MoveVertical, Plus, Save, Search, Trash2, Boxes, X } from "lucide-react";

import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router";

import { useSkillRuntimeCatalog } from "@/components/skills/skill-runtime-picker";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { normalizeCharacterName } from "@/lib/canvas/canvas-character-reference";
import { navigateToSettings } from "@/lib/settings-navigation";
import { projectSourceTextToPlainText } from "@/lib/project-source-text";
import { createProjectAssetCandidates, createProjectUnit, deleteProjectUnit, importProjectUnits, replaceProjectUnitShots, reorderProjectUnits, updateProjectUnit, type ProjectDetail, type ProjectUnit } from "@/services/api/projects";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { listGenerationTasks, queryGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { loadProjectEditorDraft, removeProjectEditorDraft, saveProjectEditorDraft } from "@/services/project-editor-draft";

import { formatCount, formatTime, statusLabel, type ProjectDetailViewProps } from "./shared";
import { chapterStoryboardAssets, chapterStoryboardCharacters, chapterStoryboardReplaceImpact, storyboardRowsToProjectShots } from "./chapter-storyboard-production";
import { chapterAssetsFromGenerationTask, chapterCharactersFromGenerationTask, chapterStoryboardFromGenerationTask, chapterTaskIdentity, extractChapterAssets, extractChapterCharacters, generateChapterStoryboard } from "./project-chapter-ai";
import { chapterAssetCandidateDetails, freshChapterAssetBreakdowns } from "./project-chapter-assets";
import { ChapterEditorToolbar } from "./chapter-editor-toolbar";
import { CreateChapterDialog, ImportNovelDialog, plainTextToHtml } from "./chapter-import-dialogs";
import { ChapterAssetExtractionDialog, ChapterStoryboardGenerationDialog, MoveChapterDialog } from "./chapter-generation-dialogs";
import { chapterOperationFromTask, chapterOperationKey, chapterTaskResultAlreadyApplied, formatOperationElapsed, readStoredScroll, type ChapterOperation, type ChapterOperationKind } from "./chapter-operation-state";
import "./short-drama-content.css";

const CHAPTER_ROW_HEIGHT = 62;
type ChapterEditorDraft = { title: string; html: string };

function formatChapterListCount(value: number) {
    if (value < 10_000) return formatCount(value);
    return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function ProjectChaptersView({ detail, refreshProject }: ProjectDetailViewProps) {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { chapterId = "" } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialSelectedId = detail.units.some((unit) => unit.id === chapterId) ? chapterId : detail.units[0]?.id || "";
    const [selectedId, setSelectedId] = useState(initialSelectedId);
    const [createOpen, setCreateOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(() => searchParams.get("import") === "1");
    const [searchQuery, setSearchQuery] = useState("");
    const [moveTargetId, setMoveTargetId] = useState("");
    const [movePosition, setMovePosition] = useState<number | null>(null);
    const [orderedIds, setOrderedIds] = useState(() => detail.units.map((unit) => unit.id));
    const [draggedId, setDraggedId] = useState("");
    const [draftTitle, setDraftTitle] = useState("");
    const [draftHtml, setDraftHtml] = useState("");
    const [dirty, setDirty] = useState(false);
    const [characterExtractOpen, setCharacterExtractOpen] = useState(false);
    const [storyboardOpen, setStoryboardOpen] = useState(false);
    const [chapterOperations, setChapterOperations] = useState<Record<string, ChapterOperation>>({});
    const [completedChapterOperations, setCompletedChapterOperations] = useState<Record<string, true>>({});
    const [operationNow, setOperationNow] = useState(() => Date.now());
    const [selectedTextModel, setSelectedTextModel] = useState("");
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
    const { skills: availableSkills, loading: skillsLoading } = useSkillRuntimeCatalog();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const listRef = useRef<HTMLDivElement>(null);
    const locallyOwnedTaskIdsRef = useRef(new Set<string>());
    const recoveredTaskIdsRef = useRef(new Set<string>());
    const recoveringTaskIdsRef = useRef(new Set<string>());
    const draftLoadVersionRef = useRef(0);
    const userEditedRef = useRef(false);
    const navigationConfirmOpenRef = useRef(false);
    const draftStorageWarningRef = useRef(false);
    const chapterDraftRef = useRef<ChapterEditorDraft>({ title: "", html: "" });
    chapterDraftRef.current = { title: draftTitle, html: draftHtml };
    const reportDraftStorageFailure = () => {
        if (draftStorageWarningRef.current) return;
        draftStorageWarningRef.current = true;
        message.warning("本机草稿保存失败，请尽快手动保存章节，离开或刷新前不要关闭页面");
    };
    const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLocaleLowerCase("zh-CN"));
    const closeImport = () => {
        setImportOpen(false);
        if (!searchParams.has("import")) return;
        const next = new URLSearchParams(searchParams);
        next.delete("import");
        setSearchParams(next, { replace: true });
    };
    const orderedUnits = useMemo(() => {
        const byId = new Map(detail.units.map((unit) => [unit.id, unit]));
        return orderedIds.map((id) => byId.get(id)).filter((unit): unit is ProjectUnit => Boolean(unit));
    }, [detail.units, orderedIds]);
    const selectedUnitSummary = detail.units.find((unit) => unit.id === selectedId) || orderedUnits[0];
    const chapterTasksQuery = useQuery({
        queryKey: ["project-chapter-generation-tasks", detail.project.id],
        queryFn: () => listGenerationTasks(100, { projectId: detail.project.id }),
        refetchInterval: (query) =>
            query.state.data?.some((task) => {
                const identity = chapterTaskIdentity(task);
                return Boolean(identity && (task.status === "queued" || task.status === "running"));
            })
                ? 2_000
                : false,
        refetchOnWindowFocus: true,
    });
    const selectedUnit = selectedUnitSummary;
    const chapterNumberById = useMemo(() => new Map(orderedUnits.map((unit, index) => [unit.id, index + 1])), [orderedUnits]);
    const canvasCountByUnitId = useMemo(() => new Map(Object.entries(detail.unitCanvasCounts || {}).map(([unitId, count]) => [unitId, Number(count)])), [detail.unitCanvasCounts]);
    const storyboardImpact = useMemo(() => chapterStoryboardReplaceImpact(detail, selectedUnit?.id || ""), [detail, selectedUnit?.id]);
    const serverChapterOperations = useMemo(() => {
        const operations = new Map<string, ChapterOperation>();
        for (const task of chapterTasksQuery.data || []) {
            if (task.status !== "queued" && task.status !== "running") continue;
            const identity = chapterTaskIdentity(task);
            if (!identity) continue;
            const key = chapterOperationKey(identity.chapterId, identity.kind);
            if (!operations.has(key)) operations.set(key, chapterOperationFromTask(task));
        }
        return operations;
    }, [chapterTasksQuery.data]);
    const serverCompletedOperations = useMemo(() => {
        const latest = new Map<string, GenerationTask>();
        for (const task of chapterTasksQuery.data || []) {
            const identity = chapterTaskIdentity(task);
            if (!identity) continue;
            const key = chapterOperationKey(identity.chapterId, identity.kind);
            if (!latest.has(key)) latest.set(key, task);
        }
        return new Set([...latest].filter(([, task]) => task.status === "succeeded").map(([key]) => key));
    }, [chapterTasksQuery.data]);
    const runningOperationCount = new Set([...Object.keys(chapterOperations), ...serverChapterOperations.keys()]).size;
    const assetOperation = selectedUnit
        ? chapterOperations[chapterOperationKey(selectedUnit.id, "assets")] ||
          serverChapterOperations.get(chapterOperationKey(selectedUnit.id, "assets")) ||
          chapterOperations[chapterOperationKey(selectedUnit.id, "characters")] ||
          serverChapterOperations.get(chapterOperationKey(selectedUnit.id, "characters"))
        : undefined;
    const storyboardOperation = selectedUnit ? chapterOperations[chapterOperationKey(selectedUnit.id, "storyboard")] || serverChapterOperations.get(chapterOperationKey(selectedUnit.id, "storyboard")) : undefined;
    const assetsGenerated = Boolean(
        selectedUnit &&
        (completedChapterOperations[chapterOperationKey(selectedUnit.id, "assets")] ||
            completedChapterOperations[chapterOperationKey(selectedUnit.id, "characters")] ||
            serverCompletedOperations.has(chapterOperationKey(selectedUnit.id, "assets")) ||
            serverCompletedOperations.has(chapterOperationKey(selectedUnit.id, "characters")) ||
            detail.assetCandidates.some((candidate) => candidate.unitId === selectedUnit.id)),
    );
    const storyboardGenerated = Boolean(
        selectedUnit && (completedChapterOperations[chapterOperationKey(selectedUnit.id, "storyboard")] || serverCompletedOperations.has(chapterOperationKey(selectedUnit.id, "storyboard")) || storyboardImpact.shotCount > 0),
    );
    const visibleUnits = useMemo(() => {
        if (!deferredSearchQuery) return orderedUnits;
        const numericQuery = /^\d+$/.test(deferredSearchQuery) ? deferredSearchQuery.replace(/^0+/, "") || "0" : "";
        return orderedUnits.filter((unit, index) => (numericQuery && String(index + 1).startsWith(numericQuery)) || unit.title.toLocaleLowerCase("zh-CN").includes(deferredSearchQuery));
    }, [deferredSearchQuery, orderedUnits]);
    const chapterVirtualizer = useVirtualizer({
        count: visibleUnits.length,
        getScrollElement: () => listRef.current,
        estimateSize: () => CHAPTER_ROW_HEIGHT,
        getItemKey: (index) => visibleUnits[index]?.id || index,
        initialOffset: () => readStoredScroll(`project-chapters:${detail.project.id}`),
        onChange: (instance, scrolling) => {
            if (!scrolling && instance.scrollOffset !== null) sessionStorage.setItem(`project-chapters:${detail.project.id}`, String(instance.scrollOffset));
        },
        overscan: 10,
    });

    useEffect(() => {
        setOrderedIds(
            detail.units
                .slice()
                .sort((left, right) => left.position - right.position)
                .map((unit) => unit.id),
        );
        if (!detail.units.some((unit) => unit.id === selectedId)) setSelectedId(detail.units[0]?.id || "");
    }, [detail.units, selectedId]);

    useEffect(() => {
        if (!chapterId || chapterId === selectedId || dirty || !detail.units.some((unit) => unit.id === chapterId)) return;
        setSelectedId(chapterId);
    }, [chapterId, detail.units, dirty, selectedId]);

    useEffect(() => {
        if (!chapterId || dirty || detail.units.some((unit) => unit.id === chapterId)) return;
        const firstId = orderedUnits[0]?.id;
        navigate(firstId ? `/projects/${detail.project.id}/chapters/${firstId}` : `/projects/${detail.project.id}/chapters`, { replace: true });
    }, [chapterId, detail.project.id, detail.units, dirty, navigate, orderedUnits]);

    useEffect(() => {
        if (selectedId) sessionStorage.setItem(`project-active-chapter:${detail.project.id}`, selectedId);
    }, [detail.project.id, selectedId]);

    useEffect(() => {
        if (!runningOperationCount) return;
        setOperationNow(Date.now());
        const timer = window.setInterval(() => setOperationNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, [runningOperationCount]);

    const saveMutation = useMutation({
        mutationFn: (draft: ChapterEditorDraft) =>
            selectedUnit
                ? updateProjectUnit(detail.project.id, selectedUnit.id, {
                      title: draft.title.trim(),
                      sourceText: draft.html,
                      status: projectSourceTextToPlainText(draft.html) ? "ready" : "draft",
                  })
                : Promise.reject(new Error("请选择章节")),
        onSuccess: ({ unit }, savedDraft) => {
            queryClient.setQueryData(["project-unit", detail.project.id, unit.id], { unit });
            queryClient.setQueryData<{ units: ProjectDetail["units"]; canvasCounts: Record<string, number> }>(["project", detail.project.id, "units"], (current) =>
                current
                    ? {
                          ...current,
                          units: current.units.map((item) =>
                              item.id === unit.id
                                  ? {
                                        ...item,
                                        title: unit.title,
                                        wordCount: unit.wordCount,
                                        status: unit.status,
                                        updatedAt: unit.updatedAt,
                                    }
                                  : item,
                          ),
                      }
                    : current,
            );
            const currentDraft = chapterDraftRef.current;
            const unchangedSinceSubmit = currentDraft.title === savedDraft.title && currentDraft.html === savedDraft.html;
            if (unchangedSinceSubmit) {
                userEditedRef.current = false;
                setDirty(false);
                void removeProjectEditorDraft("chapter", detail.project.id, unit.id).catch(reportDraftStorageFailure);
            } else {
                void saveProjectEditorDraft({
                    kind: "chapter",
                    projectId: detail.project.id,
                    entityId: unit.id,
                    sourceUpdatedAt: unit.updatedAt,
                    payload: currentDraft,
                }).catch(reportDraftStorageFailure);
            }
            refreshProject();
            message.success(unchangedSinceSubmit ? "章节已保存" : "章节已保存，提交期间的新修改仍保留在本地草稿");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "章节保存失败"),
    });
    const navigationBlocker = useBlocker(dirty);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!dirty) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [dirty]);

    useEffect(() => {
        if (navigationBlocker.state !== "blocked" || navigationConfirmOpenRef.current) return;
        navigationConfirmOpenRef.current = true;
        modal.confirm({
            title: "离开未保存的章节？",
            content: "当前修改已暂存在本机，返回本章时会自动恢复；服务端内容只有点击保存后才会更新。",
            okText: "保留草稿并离开",
            cancelText: "继续编辑",
            onOk: () => {
                navigationConfirmOpenRef.current = false;
                navigationBlocker.proceed();
            },
            onCancel: () => {
                navigationConfirmOpenRef.current = false;
                navigationBlocker.reset();
            },
        });
    }, [modal, navigationBlocker]);
    const createMutation = useMutation({
        mutationFn: (values: { title: string; sourceText?: string }) => createProjectUnit(detail.project.id, { kind: "chapter", title: values.title, sourceText: plainTextToHtml(values.sourceText || ""), position: detail.units.length }),
        onSuccess: ({ unit }) => {
            setCreateOpen(false);
            setSelectedId(unit.id);
            refreshProject();
            navigate(`/projects/${detail.project.id}/chapters/${unit.id}`);
            message.success("章节已创建");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "章节创建失败"),
    });
    const importMutation = useMutation({
        mutationFn: (chapters: Array<{ title: string; plainText: string }>) =>
            importProjectUnits(
                detail.project.id,
                chapters.map((chapter) => ({ kind: "chapter", title: chapter.title, sourceText: plainTextToHtml(chapter.plainText) })),
            ),
        onSuccess: ({ units }) => {
            closeImport();
            if (units[0]) {
                setSelectedId(units[0].id);
                navigate(`/projects/${detail.project.id}/chapters/${units[0].id}`);
            }
            refreshProject();
            message.success(`已导入 ${units.length} 章`);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "小说导入失败"),
    });
    const reorderMutation = useMutation({
        mutationFn: (unitIds: string[]) => reorderProjectUnits(detail.project.id, unitIds),
        onSuccess: () => {
            refreshProject();
            message.success("章节顺序已更新");
        },
        onError: (error) => {
            refreshProject();
            message.error(error instanceof Error ? error.message : "章节排序失败");
        },
    });
    const deleteMutation = useMutation({
        mutationFn: (unitId: string) => deleteProjectUnit(detail.project.id, unitId),
        onSuccess: (_, unitId) => {
            const index = orderedIds.indexOf(unitId);
            const remaining = orderedIds.filter((id) => id !== unitId);
            setOrderedIds(remaining);
            if (selectedId === unitId) {
                const nextId = remaining[Math.min(index, remaining.length - 1)] || "";
                setSelectedId(nextId);
                navigate(nextId ? `/projects/${detail.project.id}/chapters/${nextId}` : `/projects/${detail.project.id}/chapters`, { replace: true });
            }
            refreshProject();
            message.success("章节已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "章节删除失败"),
    });

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            TextStyle,
            Color.configure({ types: ["textStyle"] }),
            Highlight.configure({ multicolor: true }),
            CharacterCount,
            Placeholder.configure({ placeholder: "从这一章开始写下故事……" }),
        ],
        content: selectedUnit?.sourceText || "",
        editorProps: { attributes: { class: "project-chapter-editor focus:outline-none" } },
        onUpdate: ({ editor: nextEditor }) => {
            userEditedRef.current = true;
            setDraftHtml(nextEditor.getHTML());
            setDirty(true);
        },
    });

    useEffect(() => {
        if (!selectedUnitSummary) return;
        draftLoadVersionRef.current += 1;
        userEditedRef.current = false;
        setDraftTitle(selectedUnitSummary.title);
        setDraftHtml("");
        setDirty(false);
    }, [selectedUnitSummary?.id]);

    useEffect(() => {
        const loadedUnit = selectedUnit;
        if (!loadedUnit || !editor) return;
        const loadVersion = ++draftLoadVersionRef.current;
        userEditedRef.current = false;
        setDraftTitle(loadedUnit.title);
        setDraftHtml(loadedUnit.sourceText || "");
        setDirty(false);
        editor.commands.setContent(loadedUnit.sourceText || "", { emitUpdate: false });
        void loadProjectEditorDraft<ChapterEditorDraft>("chapter", detail.project.id, loadedUnit.id)
            .then((draft) => {
                if (!draft || draftLoadVersionRef.current !== loadVersion || userEditedRef.current) return;
                const title = draft.payload?.title;
                const html = draft.payload?.html;
                if (typeof title !== "string" || typeof html !== "string") return;
                if (title === loadedUnit.title && html === (loadedUnit.sourceText || "")) {
                    void removeProjectEditorDraft("chapter", detail.project.id, loadedUnit.id).catch(reportDraftStorageFailure);
                    return;
                }
                setDraftTitle(title);
                setDraftHtml(html);
                editor.commands.setContent(html, { emitUpdate: false });
                setDirty(true);
                message.info(draft.sourceUpdatedAt === loadedUnit.updatedAt ? "已恢复本机未保存的章节草稿" : "已恢复本机章节草稿；服务端内容已变化，请核对后再保存");
            })
            .catch(reportDraftStorageFailure);
        // 只在切换章节时装载服务端内容，避免项目刷新覆盖当前未保存正文。
    }, [detail.project.id, editor, message, selectedUnit?.id]);

    useEffect(() => {
        if (!dirty || !selectedUnit) return;
        const timer = window.setTimeout(() => {
            void saveProjectEditorDraft({
                kind: "chapter",
                projectId: detail.project.id,
                entityId: selectedUnit.id,
                sourceUpdatedAt: selectedUnit.updatedAt,
                payload: chapterDraftRef.current,
            }).catch(reportDraftStorageFailure);
        }, 400);
        return () => window.clearTimeout(timer);
    }, [detail.project.id, dirty, draftHtml, draftTitle, selectedUnit]);

    const wordCount = useMemo(() => editor?.storage.characterCount?.characters?.() || projectSourceTextToPlainText(draftHtml).length || 0, [draftHtml, editor]);
    const chapterCanvasCount = (unitId: string) => canvasCountByUnitId.get(unitId) || 0;
    const chapterAnalysisInput = (textModel: string) => {
        const unit = selectedUnit;
        if (!unit) throw new Error("章节正文尚未加载完成");
        if (detail.project.status === "archived") throw new Error("项目已归档，请先在项目设置中恢复");
        if (dirty) throw new Error("请先保存当前章节，再运行 AI 分析");
        const sourceText = editor?.getText().trim() || projectSourceTextToPlainText(unit.sourceText);
        if (!sourceText) throw new Error("当前章节没有可分析的正文");
        const config = { ...effectiveConfig, model: textModel, textModel };
        if (!textModel || !isAiConfigReady(config, textModel)) {
            navigateToSettings({ continueCreation: true });
            return null;
        }
        return {
            projectId: detail.project.id,
            projectName: detail.project.name,
            chapterId: unit.id,
            chapterTitle: unit.title,
            sourceText,
            projectStyle: resolveProjectCanvasStyle(detail.project.stylePresetId, detail.project.styleProfileJson)?.prompt || "",
            config,
        };
    };
    const beginChapterOperation = (unitId: string, kind: ChapterOperationKind) => {
        const key = chapterOperationKey(unitId, kind);
        const startedAt = Date.now();
        setOperationNow(startedAt);
        setChapterOperations((current) => ({ ...current, [key]: { startedAt } }));
    };
    const updateChapterOperation = (unitId: string, kind: ChapterOperationKind, task: GenerationTask) => {
        const key = chapterOperationKey(unitId, kind);
        const taskStartedAt = Date.parse(task.startedAt || task.createdAt);
        locallyOwnedTaskIdsRef.current.add(task.id);
        setChapterOperations((current) => ({
            ...current,
            [key]: {
                startedAt: Number.isFinite(taskStartedAt) ? taskStartedAt : current[key]?.startedAt || Date.now(),
                taskId: task.id,
            },
        }));
    };
    const finishChapterOperation = (unitId: string, kind: ChapterOperationKind) => {
        const key = chapterOperationKey(unitId, kind);
        setChapterOperations((current) => {
            if (!current[key]) return current;
            const next = { ...current };
            delete next[key];
            return next;
        });
    };
    const markChapterOperationCompleted = (unitId: string, kind: ChapterOperationKind) => {
        setCompletedChapterOperations((current) => ({ ...current, [chapterOperationKey(unitId, kind)]: true }));
    };
    const storeExtractedCharacters = async (unitId: string, characters: Awaited<ReturnType<typeof extractChapterCharacters>>) => {
        // 已确认角色允许再次提取并作为候选归并，只有尚待处理的同名候选需要去重。
        const knownNames = new Set(detail.assetCandidates.filter((candidate) => candidate.category === "character" && candidate.status === "pending_confirmation").map((candidate) => normalizeCharacterName(candidate.name)));
        const fresh = characters.filter((character) => ![character.name, ...character.aliases].map(normalizeCharacterName).some((name) => knownNames.has(name)));
        if (fresh.length) {
            await createProjectAssetCandidates(
                detail.project.id,
                fresh.map((character) => ({ unitId, name: character.name, category: "character", details: { ...character } })),
            );
        }
        markChapterOperationCompleted(unitId, "characters");
        refreshProject();
        return fresh.length;
    };
    const storeExtractedAssets = async (unitId: string, assets: Awaited<ReturnType<typeof extractChapterAssets>>) => {
        const fresh = freshChapterAssetBreakdowns(assets, detail.assetCandidates);
        if (fresh.length) {
            await createProjectAssetCandidates(
                detail.project.id,
                fresh.map((asset) => ({
                    unitId,
                    name: asset.name,
                    category: asset.category,
                    details: chapterAssetCandidateDetails(asset),
                })),
            );
        }
        markChapterOperationCompleted(unitId, "assets");
        refreshProject();
        return fresh.length;
    };
    const storeGeneratedStoryboard = async (unitId: string, rows: ReturnType<typeof chapterStoryboardFromGenerationTask>["rows"]) => {
        const shots = storyboardRowsToProjectShots(rows, detail);
        await replaceProjectUnitShots(
            detail.project.id,
            unitId,
            shots,
            detail.shots.filter((shot) => shot.unitId === unitId).map((shot) => shot.id),
        );
        await Promise.all([queryClient.invalidateQueries({ queryKey: ["project", detail.project.id] }), queryClient.invalidateQueries({ queryKey: ["projects"] })]);
        markChapterOperationCompleted(unitId, "storyboard");
        return shots.length;
    };
    const extractAssets = async () => {
        let operationUnitId = "";
        try {
            const input = chapterAnalysisInput(selectedTextModel);
            if (!input) return;
            operationUnitId = input.chapterId;
            setCharacterExtractOpen(false);
            beginChapterOperation(operationUnitId, "assets");
            message.info("资产拆分任务已开始，可继续编辑或切换章节");
            const assets = await extractChapterAssets(input, { onTaskUpdate: (task) => updateChapterOperation(operationUnitId, "assets", task) });
            const freshCount = await storeExtractedAssets(operationUnitId, assets);
            if (!freshCount) {
                message.info("本章识别出的资产已存在于待确认列表中");
                return;
            }
            message.success(`已拆分 ${freshCount} 项资产，请到“角色与资产”确认`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产拆分失败");
        } finally {
            if (operationUnitId) finishChapterOperation(operationUnitId, "assets");
        }
    };
    const createStoryboard = async () => {
        const unit = selectedUnit;
        if (!unit) return message.warning("章节正文尚未加载完成");
        if (dirty) return message.warning("请先保存当前章节，再生成分镜");
        if (detail.project.status === "archived") return message.warning("项目已归档，请先在项目设置中恢复");
        const sourceText = editor?.getText().trim() || projectSourceTextToPlainText(unit.sourceText);
        if (!sourceText) return message.warning("当前章节没有可用于分镜的正文");
        const projectStyle = resolveProjectCanvasStyle(detail.project.stylePresetId, detail.project.styleProfileJson);
        if (!projectStyle?.prompt.trim()) return message.warning("请先在项目设置中选择项目画风，再生成分镜");
        const textModel = selectedTextModel;
        const config = { ...effectiveConfig, model: textModel, textModel };
        if (!isAiConfigReady(config, textModel)) {
            navigateToSettings({ continueCreation: true });
            return;
        }
        if (storyboardImpact.shotCount && !(await confirmStoryboardReplacement(storyboardImpact))) return;
        setStoryboardOpen(false);
        beginChapterOperation(unit.id, "storyboard");
        message.info("分镜生成任务已开始，可继续编辑或切换章节");
        try {
            const result = await generateChapterStoryboard(
                {
                    projectId: detail.project.id,
                    chapterId: unit.id,
                    chapterTitle: unit.title,
                    sourceText,
                    projectStyle: {
                        presetId: projectStyle.id,
                        title: projectStyle.title,
                        prompt: projectStyle.prompt,
                        profileJson: detail.project.styleProfileJson,
                    },
                    characters: chapterStoryboardCharacters(detail, unit.id),
                    assets: chapterStoryboardAssets(detail),
                    config,
                    skills: availableSkills,
                    selectedSkillIds,
                },
                { onTaskUpdate: (task) => updateChapterOperation(unit.id, "storyboard", task) },
            );
            const shotCount = await storeGeneratedStoryboard(unit.id, result.rows);
            message.success(result.skillCount ? `已生成 ${shotCount} 个分镜，并应用 ${result.skillCount} 个技能` : `已生成 ${shotCount} 个分镜`);
            navigate(`/projects/${detail.project.id}/workflow/${unit.id}/storyboard`);
        } catch (error) {
            refreshProject();
            message.error(error instanceof Error ? `章节分镜生成失败：${error.message}` : "章节分镜生成失败");
        } finally {
            finishChapterOperation(unit.id, "storyboard");
        }
    };
    const confirmStoryboardReplacement = (impact: ReturnType<typeof chapterStoryboardReplaceImpact>) =>
        new Promise<boolean>((resolve) => {
            modal.confirm({
                title: `替换本章已有的 ${impact.shotCount} 个分镜？`,
                content: (
                    <div className="space-y-2 text-sm leading-6 text-foreground/62">
                        <p>新分镜生成成功后，系统才会整体替换本章数据；如果生成失败，现有分镜不会受到影响。</p>
                        <p>
                            替换会移除 {impact.shotCount} 个镜头、{impact.revisionCount} 个脚本版本、{impact.referenceCount} 个资产引用、{impact.artifactCount} 个生成产物{impact.candidateCount ? `及 ${impact.candidateCount} 个相关候选资产` : ""}
                            ，此操作无法撤销。
                        </p>
                    </div>
                ),
                okText: "生成成功后替换",
                okButtonProps: { danger: true },
                cancelText: "保留现有分镜",
                centered: true,
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });

    useEffect(() => {
        const latestByOperation = new Map<string, { task: GenerationTask; chapterId: string; kind: ChapterOperationKind }>();
        for (const task of chapterTasksQuery.data || []) {
            const identity = chapterTaskIdentity(task);
            if (!identity) continue;
            const key = chapterOperationKey(identity.chapterId, identity.kind);
            if (!latestByOperation.has(key)) latestByOperation.set(key, { task, ...identity });
        }
        for (const { task, chapterId: taskChapterId, kind } of latestByOperation.values()) {
            if (taskChapterId !== selectedUnit?.id) continue;
            if (task.status !== "succeeded" || locallyOwnedTaskIdsRef.current.has(task.id) || recoveredTaskIdsRef.current.has(task.id) || recoveringTaskIdsRef.current.has(task.id)) continue;
            if (chapterTaskResultAlreadyApplied(task, taskChapterId, kind, detail)) {
                recoveredTaskIdsRef.current.add(task.id);
                markChapterOperationCompleted(taskChapterId, kind);
                continue;
            }
            recoveringTaskIdsRef.current.add(task.id);
            void queryGenerationTask(task.id)
                .then(async (completedTask) => {
                    if (kind === "assets") {
                        await storeExtractedAssets(taskChapterId, chapterAssetsFromGenerationTask(completedTask));
                        message.success("已恢复刷新前完成的资产拆分结果");
                    } else if (kind === "characters") {
                        await storeExtractedCharacters(taskChapterId, chapterCharactersFromGenerationTask(completedTask));
                        message.success("已恢复刷新前完成的角色提取结果");
                    } else {
                        await storeGeneratedStoryboard(taskChapterId, chapterStoryboardFromGenerationTask(completedTask).rows);
                        message.success("已恢复刷新前完成的章节分镜");
                    }
                    recoveredTaskIdsRef.current.add(task.id);
                })
                .catch((error) => {
                    message.error(error instanceof Error ? `任务结果恢复失败：${error.message}` : "任务结果恢复失败");
                })
                .finally(() => recoveringTaskIdsRef.current.delete(task.id));
        }
    }, [chapterTasksQuery.data, detail, selectedUnit?.id]);

    const selectChapter = (unitId: string) => {
        if (unitId === selectedId) return;
        if (dirty) {
            message.warning("请先保存当前章节，再切换章节");
            return;
        }
        setSelectedId(unitId);
        sessionStorage.setItem(`project-active-chapter:${detail.project.id}`, unitId);
        navigate(`/projects/${detail.project.id}/chapters/${unitId}`);
    };
    const moveChapter = (targetId: string) => {
        if (!draggedId || draggedId === targetId || reorderMutation.isPending) return;
        const next = orderedIds.filter((id) => id !== draggedId);
        next.splice(next.indexOf(targetId), 0, draggedId);
        setOrderedIds(next);
        setDraggedId("");
        reorderMutation.mutate(next);
    };
    const moveChapterToPosition = () => {
        if (!moveTargetId || !movePosition || reorderMutation.isPending) return;
        const next = orderedIds.filter((id) => id !== moveTargetId);
        const targetIndex = Math.min(Math.max(movePosition - 1, 0), next.length);
        next.splice(targetIndex, 0, moveTargetId);
        setOrderedIds(next);
        setMoveTargetId("");
        setMovePosition(null);
        reorderMutation.mutate(next);
        window.setTimeout(() => {
            const index = next.indexOf(moveTargetId);
            const visibleIndex = visibleUnits.findIndex((unit) => unit.id === moveTargetId);
            if (!deferredSearchQuery && index >= 0) chapterVirtualizer.scrollToIndex(index, { align: "center" });
            else if (visibleIndex >= 0) chapterVirtualizer.scrollToIndex(visibleIndex, { align: "center" });
        }, 0);
    };
    const revealSelectedChapter = () => {
        if (!selectedId) return;
        setSearchQuery("");
        window.setTimeout(() => {
            const index = orderedIds.indexOf(selectedId);
            if (index >= 0) chapterVirtualizer.scrollToIndex(index, { align: "center" });
        }, 0);
    };
    const handleListDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (!draggedId || deferredSearchQuery) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        const edge = 48;
        if (event.clientY < bounds.top + edge) event.currentTarget.scrollBy({ top: -24 });
        else if (event.clientY > bounds.bottom - edge) event.currentTarget.scrollBy({ top: 24 });
    };

    return (
        <div className="pc-project-chapters sd-content-chapters grid h-full min-h-0 min-w-0 w-full grid-rows-[minmax(180px,34vh)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[304px_minmax(0,1fr)] lg:grid-rows-1">
            <aside className="pc-project-chapters-rail sd-content-chapter-rail flex min-h-0 min-w-0 w-full flex-col border-b border-border/70 lg:border-b-0 lg:border-r">
                <div className="sd-content-rail-heading shrink-0 border-b border-border/70 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="sd-content-eyebrow">内容大纲</div>
                            <h2 className="mt-1 text-sm font-semibold text-foreground">章节管理</h2>
                            <p className="mt-1 text-[var(--fs-tiny)] text-foreground/42">共 {detail.units.length.toLocaleString("zh-CN")} 章 · 支持拖拽排序</p>
                        </div>
                        <div className="flex items-center gap-0.5">
                            {selectedId ? (
                                <Tooltip title="回到当前章节">
                                    <Button type="text" size="small" icon={<Crosshair className="size-3.5" />} aria-label="回到当前章节" onClick={revealSelectedChapter} />
                                </Tooltip>
                            ) : null}
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button className="sd-content-rail-action" icon={<FileUp className="size-3.5" />} onClick={() => setImportOpen(true)}>
                            导入文稿
                        </Button>
                        <Button type="primary" className="sd-content-rail-action" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                            新建章节
                        </Button>
                    </div>
                </div>
                <div className="sd-content-rail-filter shrink-0 border-b border-border/60 p-3">
                    <label className="sd-content-search flex h-9 items-center gap-2 rounded-md border border-border/75 bg-background px-2.5 focus-within:border-[var(--workspace-accent)] focus-within:ring-2 focus-within:ring-[var(--workspace-accent-soft)]">
                        <Search className="size-3.5 shrink-0 text-foreground/32" />
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && visibleUnits[0]) selectChapter(visibleUnits[0].id);
                            }}
                            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-foreground/28"
                            placeholder="搜索标题或章节序号"
                            aria-label="搜索章节"
                        />
                        {searchQuery ? (
                            <button type="button" onClick={() => setSearchQuery("")} className="grid size-5 shrink-0 place-items-center rounded text-foreground/32 hover:bg-surface-hover" aria-label="清空章节搜索">
                                <X className="size-3" />
                            </button>
                        ) : null}
                    </label>
                    {deferredSearchQuery ? <div className="mt-1 px-0.5 text-[var(--fs-micro)] tabular-nums text-foreground/35">找到 {visibleUnits.length.toLocaleString("zh-CN")} 章 · 搜索时使用“移动到”调整顺序</div> : null}
                </div>
                {orderedUnits.length ? (
                    <div ref={listRef} onDragOver={handleListDragOver} className="thin-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
                        {visibleUnits.length ? (
                            <div className="relative w-full" aria-label="章节列表" style={{ height: chapterVirtualizer.getTotalSize() }}>
                                {chapterVirtualizer.getVirtualItems().map((virtualItem) => {
                                    const unit = visibleUnits[virtualItem.index];
                                    if (!unit) return null;
                                    const chapterNumber = chapterNumberById.get(unit.id) || virtualItem.index + 1;
                                    const displayedWordCount = dirty && selectedUnit?.id === unit.id ? wordCount : unit.wordCount || 0;
                                    const chapterMeta = `${statusLabel(unit.status)} · ${formatCount(displayedWordCount)} 字 · ${chapterCanvasCount(unit.id)} 画布`;
                                    return (
                                        <div key={unit.id} className="absolute left-0 top-0 w-full" style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start}px)` }}>
                                            <div
                                                draggable={!dirty && !reorderMutation.isPending && !deferredSearchQuery}
                                                onDragStart={(event) => {
                                                    setDraggedId(unit.id);
                                                    event.dataTransfer.effectAllowed = "move";
                                                }}
                                                onDragOver={(event) => {
                                                    if (deferredSearchQuery) return;
                                                    event.preventDefault();
                                                    event.dataTransfer.dropEffect = "move";
                                                }}
                                                onDrop={() => moveChapter(unit.id)}
                                                onDragEnd={() => setDraggedId("")}
                                                className={`sd-content-chapter-row group relative flex h-[58px] items-start rounded-lg border px-0.5 ${unit.id === selectedUnit?.id ? "is-active border-border/90 bg-surface-active" : "border-transparent hover:border-border/60 hover:bg-surface-hover"} ${draggedId === unit.id ? "opacity-45" : ""}`}
                                            >
                                                <button
                                                    type="button"
                                                    disabled={Boolean(deferredSearchQuery)}
                                                    className="mt-3.5 grid size-6 shrink-0 cursor-grab place-items-center text-foreground/22 active:cursor-grabbing disabled:cursor-default disabled:opacity-35"
                                                    aria-label={`拖动第 ${chapterNumber} 章排序`}
                                                >
                                                    <GripVertical className="size-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => selectChapter(unit.id)}
                                                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-14 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--workspace-accent)]"
                                                >
                                                    <span
                                                        className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-md px-1 text-[var(--fs-tiny)] font-semibold tabular-nums ${unit.id === selectedUnit?.id ? "bg-[var(--workspace-accent-soft)] text-[var(--workspace-accent)]" : "bg-foreground/[.035] text-foreground/35"}`}
                                                    >
                                                        {String(chapterNumber).padStart(Math.max(2, String(orderedUnits.length).length), "0")}
                                                    </span>
                                                    <span className="min-w-0 flex-1 overflow-hidden">
                                                        <span className={`block truncate text-[var(--fs-body)] ${unit.id === selectedUnit?.id ? "font-semibold text-foreground" : "font-medium text-foreground/68"}`}>{unit.title}</span>
                                                        <span title={chapterMeta} className="mt-1 block truncate whitespace-nowrap text-[var(--fs-tiny)] tabular-nums text-foreground/38">
                                                            {statusLabel(unit.status)} · {formatChapterListCount(displayedWordCount)} 字 · {chapterCanvasCount(unit.id)} 画布
                                                        </span>
                                                    </span>
                                                </button>
                                                <Dropdown
                                                    trigger={["click"]}
                                                    placement="bottomRight"
                                                    menu={{
                                                        items: [{ key: "move", icon: <MoveVertical className="size-3.5" />, label: "移动到…" }],
                                                        onClick: () => {
                                                            setMoveTargetId(unit.id);
                                                            setMovePosition(chapterNumber);
                                                        },
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        className="absolute right-7 top-1/2 z-[1] grid size-6 -translate-y-1/2 place-items-center rounded text-foreground/28 opacity-0 hover:bg-surface-hover hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                                                        aria-label={`${unit.title}更多操作`}
                                                    >
                                                        <MoreHorizontal className="size-3.5" />
                                                    </button>
                                                </Dropdown>
                                                <Popconfirm
                                                    title="删除此章节？"
                                                    description="章节内容及关联制作记录将被删除，已关联的画布不会删除。"
                                                    okText="删除"
                                                    cancelText="取消"
                                                    okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
                                                    onConfirm={() => deleteMutation.mutate(unit.id)}
                                                >
                                                    <button
                                                        type="button"
                                                        className="absolute right-1 top-1/2 z-[1] grid size-6 -translate-y-1/2 place-items-center rounded text-foreground/28 opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
                                                        aria-label={`删除${unit.title}`}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                </Popconfirm>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="px-3 py-8 text-center text-xs text-foreground/40">没有匹配的章节</div>
                        )}
                    </div>
                ) : (
                    <WorkspaceState
                        icon="projects"
                        compact
                        className="flex-1 px-4"
                        title="开始搭建内容"
                        description="新建第一章，或从 TXT / Markdown 文稿批量导入。"
                        action={
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button size="small" icon={<FileUp className="size-3.5" />} onClick={() => setImportOpen(true)}>
                                    导入文稿
                                </Button>
                                <Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                                    新建章节
                                </Button>
                            </div>
                        }
                    />
                )}
            </aside>

            <section className="pc-project-chapter-stage sd-content-chapter-stage min-h-0 min-w-0 w-full p-3 sm:p-4">
                {selectedUnit ? (
                    <div className="sd-content-editor-shell flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/80 bg-background">
                        <header className="sd-content-editor-header flex shrink-0 flex-wrap items-start gap-4 border-b border-border/70 px-5 py-4">
                            <div className="min-w-0 flex-1">
                                <div className="sd-content-eyebrow mb-1.5 flex items-center gap-1.5">
                                    <BookOpenText className="size-3.5" />第 {String(orderedUnits.findIndex((unit) => unit.id === selectedUnit.id) + 1).padStart(2, "0")} 章
                                </div>
                                <Input
                                    variant="borderless"
                                    value={draftTitle}
                                    disabled={!selectedUnit}
                                    onChange={(event) => {
                                        userEditedRef.current = true;
                                        setDraftTitle(event.target.value);
                                        setDirty(true);
                                    }}
                                    className="!h-auto !px-0 !py-0 !text-xl !font-semibold !leading-tight disabled:!cursor-wait disabled:!text-foreground"
                                    placeholder="章节标题"
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[var(--fs-tiny)] text-foreground/42" aria-live="polite">
                                    <span className={`sd-content-save-state ${dirty ? "is-dirty" : "is-saved"}`}>{dirty ? "有未保存修改" : "已保存"}</span>
                                    <span>{dirty ? "本机草稿已记录" : `更新于 ${formatTime(selectedUnit.updatedAt)}`}</span>
                                    <span>·</span>
                                    <span>{formatCount(wordCount)} 字</span>
                                    <span>·</span>
                                    <span>{chapterCanvasCount(selectedUnit.id)} 个画布</span>
                                </div>
                            </div>
                            <div className="sd-content-editor-actions flex shrink-0 flex-wrap items-center justify-end gap-2">
                                <Button
                                    size="small"
                                    icon={<Boxes className="size-3.5" />}
                                    disabled={!selectedUnit || dirty || Boolean(assetOperation)}
                                    loading={Boolean(assetOperation)}
                                    onClick={() => {
                                        setSelectedTextModel(effectiveConfig.textModel || effectiveConfig.model || effectiveConfig.textModels[0] || "");
                                        setCharacterExtractOpen(true);
                                    }}
                                    aria-label={assetOperation ? `拆分资产，已运行 ${formatOperationElapsed(assetOperation.startedAt, operationNow)}` : "拆分资产"}
                                >
                                    {assetOperation ? `拆分资产（已运行${formatOperationElapsed(assetOperation.startedAt, operationNow)}）` : assetsGenerated ? "拆分资产（已生成）" : "拆分资产"}
                                </Button>
                                <Button
                                    size="small"
                                    type={dirty ? "default" : "primary"}
                                    icon={<Clapperboard className="size-3.5" />}
                                    disabled={!selectedUnit || dirty || Boolean(storyboardOperation)}
                                    loading={Boolean(storyboardOperation)}
                                    onClick={() => {
                                        setSelectedTextModel(effectiveConfig.textModel || effectiveConfig.model || effectiveConfig.textModels[0] || "");
                                        setSelectedSkillIds([]);
                                        setStoryboardOpen(true);
                                    }}
                                    aria-label={storyboardOperation ? `生成到分镜制作，已运行 ${formatOperationElapsed(storyboardOperation.startedAt, operationNow)}` : "生成到分镜制作"}
                                >
                                    {storyboardOperation ? `生成到分镜制作（已运行${formatOperationElapsed(storyboardOperation.startedAt, operationNow)}）` : storyboardGenerated ? "生成到分镜制作（已生成）" : "生成到分镜制作"}
                                </Button>
                                <Button
                                    size="small"
                                    type={dirty ? "primary" : "default"}
                                    icon={dirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />}
                                    disabled={!selectedUnit || !dirty || !draftTitle.trim() || saveMutation.isPending}
                                    loading={saveMutation.isPending}
                                    onClick={() => saveMutation.mutate(chapterDraftRef.current)}
                                >
                                    {dirty ? "保存" : "已保存"}
                                </Button>
                            </div>
                        </header>
                        <ChapterEditorToolbar editor={editor} />
                        <div className="project-chapter-editor-scroll thin-scrollbar min-h-0 flex-1 overflow-y-auto bg-foreground/[.012]">
                            <div className="project-chapter-editor-wrap min-h-full">
                                <EditorContent editor={editor} />
                            </div>
                        </div>
                    </div>
                ) : (
                    <WorkspaceState icon="projects" compact className="h-full" title="请选择章节" description="从左侧章节列表选择一章开始编辑。" />
                )}
            </section>
            <CreateChapterDialog open={createOpen} onClose={() => setCreateOpen(false)} loading={createMutation.isPending} onSubmit={(values) => createMutation.mutate(values)} />
            <ImportNovelDialog open={importOpen} loading={importMutation.isPending} onClose={closeImport} onImport={(chapters) => importMutation.mutate(chapters)} />
            <ChapterAssetExtractionDialog
                open={characterExtractOpen}
                selectedUnit={selectedUnit}
                effectiveConfig={effectiveConfig}
                selectedTextModel={selectedTextModel}
                onTextModelChange={setSelectedTextModel}
                onClose={() => setCharacterExtractOpen(false)}
                onSubmit={() => void extractAssets()}
            />
            <ChapterStoryboardGenerationDialog
                open={storyboardOpen}
                selectedUnit={selectedUnit}
                effectiveConfig={effectiveConfig}
                selectedTextModel={selectedTextModel}
                onTextModelChange={setSelectedTextModel}
                onClose={() => setStoryboardOpen(false)}
                onSubmit={() => void createStoryboard()}
                storyboardImpact={storyboardImpact}
                availableSkills={availableSkills}
                skillsLoading={skillsLoading}
                selectedSkillIds={selectedSkillIds}
                onSkillIdsChange={setSelectedSkillIds}
            />
            <MoveChapterDialog
                open={Boolean(moveTargetId)}
                position={movePosition}
                chapterCount={orderedUnits.length}
                loading={reorderMutation.isPending}
                onPositionChange={setMovePosition}
                onClose={() => {
                    setMoveTargetId("");
                    setMovePosition(null);
                }}
                onSubmit={moveChapterToPosition}
            />
        </div>
    );
}
