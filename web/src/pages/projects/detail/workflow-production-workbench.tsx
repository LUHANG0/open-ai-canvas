import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, Segmented } from "antd";
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Clapperboard, Play, Plus, Save, Trash2 } from "lucide-react";

import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { modelCapabilityConfigFor, normalizeImageValue, normalizeVideoValue } from "@/lib/model-capabilities";
import { modelQuoteRequest } from "@/lib/model-pricing";
import { modelCompatibilityError, resolveCompatibleModel, type ModelRequirements } from "@/lib/model-selection";
import { formatVideoResolutionLabel } from "@/lib/video-generation-options";
import { submitBackendGenerationTask } from "@/services/api/generation-task";
import { quoteLogicalModel } from "@/services/api/logical-models";
import { type GenerationTask } from "@/services/api/task-center";
import { createUnitWorkflow, deleteProjectShot, linkShotAsset, saveProjectShot, unlinkShotAsset, updateWorkflowStep, type ProjectAsset, type ProjectDetail, type ProjectShot, type ShotAssetReference, type WorkflowStep } from "@/services/api/projects";
import { skillRuntime } from "@/services/skill-runtime";
import { configuredModelMatchesCapability, modelDisplayName, modelOptionName, resolveModelChannel, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useSkillRuntimeCatalog } from "@/components/skills/skill-runtime-picker";
import { StatusBadge } from "@/components/ui/pc";

import { artifactTypeForStage, currentRevision, type ShortDramaWorkflowStage } from "./workflow-shared";
import { buildShotAssetReferenceContext, ensureShotAssetMentionPrompt, resolveShotAssetMentionPrompt } from "./workflow-shot-references";
import { buildWorkflowArtifactPrompt, workflowArtifactSpecification } from "./workflow-generation-prompt";
import { WorkflowBatchPrevizButton, WorkflowBatchVideoButton } from "./workflow-batch-video-button";
import { AssetLibrary, BoundAssets, ShotAssetMentionTextarea } from "./workflow-production-assets";
import { EpisodeLibrary, ShotLibrary, ShotTimeline } from "./workflow-production-navigation";
import { WorkflowArtifactPreviewPanel } from "./workflow-production-preview";
import { WorkflowGenerationSettings } from "./workflow-production-settings";
import { formatTaskElapsed, productionStageCopy, revisionInput, shotEditorValuesKey, type ShotEditorValues } from "./workflow-production-types";
import { useWorkflowShotDraft } from "./use-workflow-shot-draft";

type Props = {
    activeStage: ShortDramaWorkflowStage;
    detail: ProjectDetail;
    projectId: string;
    unitId: string;
    workflowStep?: WorkflowStep;
    selectedShot?: ProjectShot;
    onSelectShot: (id: string) => void;
    onRefresh: () => Promise<void>;
    onAddShot: () => void;
    addingShot: boolean;
};

export default function WorkflowProductionWorkbench(props: Props) {
    const { activeStage, detail, projectId, unitId, workflowStep, selectedShot, onSelectShot, onRefresh, onAddShot, addingShot } = props;
    const { message, modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const [form] = Form.useForm<ShotEditorValues>();
    const watchedDuration = Form.useWatch("durationSeconds", form);
    const watchedTitle = Form.useWatch("title", form);
    const [leftTab, setLeftTab] = useState<"assets" | "episodes" | "shots">("assets");
    const [previewTab, setPreviewTab] = useState<"latest" | "history">("latest");
    const [previewArtifactId, setPreviewArtifactId] = useState("");
    const [submittingShotIds, setSubmittingShotIds] = useState<Set<string>>(() => new Set());
    const [taskClock, setTaskClock] = useState(() => Date.now());
    const activeShotIdRef = useRef(selectedShot?.id || "");
    activeShotIdRef.current = selectedShot?.id || "";
    const shots = useMemo(
        () =>
            (detail.shots || [])
                .filter((item) => item.unitId === unitId)
                .slice()
                .sort((left, right) => left.position - right.position),
        [detail.shots, unitId],
    );
    const shotIndex = selectedShot ? shots.findIndex((item) => item.id === selectedShot.id) : -1;
    const revision = currentRevision(detail, selectedShot);
    const artifactType = artifactTypeForStage(activeStage);
    const stageCopy = productionStageCopy[activeStage as "storyboard" | "previz" | "video"];
    const artifacts = useMemo(
        () =>
            selectedShot
                ? (detail.shotArtifacts || [])
                      .filter((item) => item.shotId === selectedShot.id && item.type === artifactType)
                      .slice()
                      .sort((left, right) => right.version - left.version)
                : [],
        [artifactType, detail.shotArtifacts, selectedShot],
    );
    const shotTask = useMemo<GenerationTask | undefined>(() => {
        return (detail.tasks || []).filter((task) => task.clientContext?.shotId === selectedShot?.id && task.clientContext?.artifactType === artifactType).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    }, [artifactType, detail.tasks, selectedShot?.id]);
    useEffect(() => {
        if (shotTask?.status !== "queued" && shotTask?.status !== "running") return;
        const timer = window.setInterval(() => setTaskClock(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, [shotTask?.status, shotTask?.id]);
    const shotTaskElapsed = shotTask ? formatTaskElapsed(Date.parse(shotTask.startedAt || shotTask.createdAt), taskClock) : "";
    const newestArtifact = artifacts.find((item) => item.selected) || artifacts[0];
    const previewArtifact = artifacts.find((item) => item.id === previewArtifactId) || newestArtifact;
    const productionSummary = useMemo(() => {
        const shotIds = new Set(shots.map((shot) => shot.id));
        const readyShotIds = new Set((detail.shotArtifacts || []).filter((artifact) => shotIds.has(artifact.shotId) && artifact.type === artifactType && artifact.selected && artifact.status === "ready").map((artifact) => artifact.shotId));
        const activeShotIds = new Set([
            ...(detail.tasks || [])
                .filter((task) => shotIds.has(task.clientContext?.shotId || "") && task.clientContext?.artifactType === artifactType && (task.status === "queued" || task.status === "running"))
                .flatMap((task) => (task.clientContext?.shotId ? [task.clientContext.shotId] : [])),
            ...submittingShotIds,
        ]);
        readyShotIds.forEach((shotId) => activeShotIds.delete(shotId));
        return {
            ready: readyShotIds.size,
            active: activeShotIds.size,
            pending: Math.max(0, shots.length - readyShotIds.size - activeShotIds.size),
        };
    }, [artifactType, detail.shotArtifacts, detail.tasks, shots, submittingShotIds]);
    const generationCapability = activeStage === "video" ? ("video" as const) : ("image" as const);
    const modelOptions = useMemo(() => selectableModelsByCapability(effectiveConfig, generationCapability), [effectiveConfig, generationCapability]);
    const projectDefaultModel = generationCapability === "video" ? detail.project.defaultVideoModel : detail.project.defaultImageModel;
    const globalDefaultModel = generationCapability === "video" ? effectiveConfig.videoModel : effectiveConfig.imageModel;
    const defaultModel = projectDefaultModel && configuredModelMatchesCapability(effectiveConfig, projectDefaultModel, generationCapability) ? projectDefaultModel : globalDefaultModel;
    const initialModel = defaultModel || modelOptions[0] || "";
    const [selectedModel, setSelectedModel] = useState(initialModel);
    const selectedModelRef = useRef(initialModel);
    const [aspectRatio, setAspectRatio] = useState(detail.project.aspectRatio || "16:9");
    const [resolution, setResolution] = useState(effectiveConfig.vquality || "720");
    const [imageQuality, setImageQuality] = useState(effectiveConfig.quality || "auto");
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
    const { skills: availableSkills, loading: skillsLoading } = useSkillRuntimeCatalog();
    const shotAssetReferenceContext = useMemo(() => buildShotAssetReferenceContext(detail, selectedShot?.id || ""), [detail, selectedShot?.id]);
    const referenceByVersionId = useMemo(() => {
        const references = (detail.shotReferences || []).filter((reference) => reference.shotId === selectedShot?.id && reference.role === "reference" && reference.status === "linked");
        return new Map(references.flatMap((reference) => [[reference.assetVersionId, reference] as const, ...(reference.asset?.primaryVersionId ? [[reference.asset.primaryVersionId, reference] as const] : [])]));
    }, [detail.shotReferences, selectedShot?.id]);
    const currentDurationSeconds = Number(watchedDuration || Math.max(0.5, (selectedShot?.durationMs || 3000) / 1000));
    const generationSeconds = String(Math.max(1, Math.round(currentDurationSeconds)));
    const generationReferenceAudios = generationCapability === "video" ? shotAssetReferenceContext.referenceAudios : [];
    const videoEditOperation = generationCapability === "video" && shotAssetReferenceContext.referenceImages.length ? "reference_to_video" : undefined;
    const modelRequirements = useMemo<ModelRequirements>(
        () => ({
            capability: generationCapability,
            input: { textCount: 1, imageCount: shotAssetReferenceContext.referenceImages.length, videoCount: 0, audioCount: generationReferenceAudios.length, characterCount: 0 },
            videoOperation: videoEditOperation,
            videoSeconds: generationCapability === "video" ? generationSeconds : undefined,
            imageSize: generationCapability === "image" ? aspectRatio : undefined,
            options: generationCapability === "video" ? { size: aspectRatio, vquality: resolution, videoSeconds: Number(generationSeconds) } : { size: aspectRatio, quality: imageQuality },
        }),
        [aspectRatio, generationCapability, generationReferenceAudios.length, generationSeconds, imageQuality, resolution, shotAssetReferenceContext.referenceImages.length, videoEditOperation],
    );
    const routedModel = resolveCompatibleModel(effectiveConfig, selectedModel, modelRequirements) || selectedModel;
    const activeProfile = useMemo(() => modelCapabilityConfigFor(effectiveConfig, routedModel), [effectiveConfig, routedModel]);
    const videoProfile = generationCapability === "video" ? activeProfile.video : undefined;
    const imageProfile = generationCapability === "image" ? activeProfile.image : undefined;
    const generationConfig = useMemo(
        () => ({
            ...effectiveConfig,
            model: routedModel,
            imageModel: generationCapability === "image" ? routedModel : effectiveConfig.imageModel,
            videoModel: generationCapability === "video" ? routedModel : effectiveConfig.videoModel,
            size: aspectRatio,
            quality: imageQuality,
            vquality: resolution,
            videoSeconds: generationSeconds,
        }),
        [aspectRatio, effectiveConfig, generationCapability, generationSeconds, imageQuality, resolution, routedModel],
    );
    const priceChannel = resolveModelChannel(generationConfig, routedModel);
    const configuredCredits = requestCreditCost({
        channelMode: priceChannel.scope === "system" ? "remote" : "local",
        modelCosts: priceChannel.modelCosts,
        model: modelOptionName(routedModel),
        count: 1,
        seconds: generationCapability === "video" ? generationSeconds : 1,
        capability: generationCapability,
        config: generationConfig,
        requirements: modelRequirements,
    });
    const quoteRequest = useMemo(() => modelQuoteRequest(generationConfig, routedModel, generationCapability, modelRequirements), [generationCapability, generationConfig, modelRequirements, routedModel]);
    const quoteRequestKey = JSON.stringify(quoteRequest || null);
    const [quotedCredits, setQuotedCredits] = useState<number | null>(null);
    const generationCredits = quotedCredits ?? configuredCredits;
    const formattedGenerationCredits = generationCredits?.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
    const modelSummary = routedModel ? modelDisplayName(effectiveConfig, routedModel) : "未选择模型";
    const durationSummary = `${Number(watchedDuration || Math.max(0.5, (selectedShot?.durationMs || 3000) / 1000))}s`;
    const resolutionSummary = generationCapability === "video" ? formatVideoResolutionLabel(resolution) : imageQuality.toUpperCase();

    useEffect(() => {
        selectedModelRef.current = initialModel;
        setSelectedModel(initialModel);
        if (!initialModel) return;
        const profile = modelCapabilityConfigFor(effectiveConfig, initialModel);
        if (generationCapability === "video" && profile.video) {
            const normalized = normalizeVideoValue(profile.video, {
                seconds: effectiveConfig.videoSeconds,
                ratio: detail.project.aspectRatio || effectiveConfig.size,
                resolution: effectiveConfig.vquality,
            });
            setAspectRatio(normalized.ratio);
            setResolution(normalized.resolution);
            form.setFieldValue("durationSeconds", Number(normalized.seconds));
        } else if (generationCapability === "image" && profile.image) {
            const normalized = normalizeImageValue(profile.image, { size: detail.project.aspectRatio || effectiveConfig.size, quality: effectiveConfig.quality, count: "1" });
            setAspectRatio(normalized.size);
            setImageQuality(normalized.quality);
        }
    }, [detail.project.aspectRatio, effectiveConfig, form, generationCapability, initialModel]);

    useEffect(() => {
        if (!creditsEnabled || !quoteRequest) {
            setQuotedCredits(null);
            return;
        }
        const controller = new AbortController();
        setQuotedCredits(null);
        quoteLogicalModel(quoteRequest.logicalModelID, quoteRequest.intent, controller.signal)
            .then(({ quote }) => setQuotedCredits(quote.amountMicrocredits / 1_000_000))
            .catch(() => {
                if (!controller.signal.aborted) setQuotedCredits(null);
            });
        return () => controller.abort();
        // quoteRequestKey captures the normalized request without retriggering on object identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [creditsEnabled, quoteRequestKey]);

    const serverValues = useMemo<ShotEditorValues>(() => {
        const shotDurationSeconds = Math.max(0.5, (revision?.durationMs || selectedShot?.durationMs || 3000) / 1000);
        const currentModel = selectedModelRef.current || initialModel;
        const normalizedDurationSeconds =
            generationCapability === "video" && currentModel ? Number(normalizeVideoValue(modelCapabilityConfigFor(effectiveConfig, currentModel).video!, { seconds: String(shotDurationSeconds) }).seconds) : shotDurationSeconds;
        const videoPrompt = ensureShotAssetMentionPrompt(revision?.videoPrompt || "", shotAssetReferenceContext.mentionReferences);
        return {
            title: selectedShot?.title || "",
            plotDescription: revision?.plotDescription || selectedShot?.description || "",
            action: revision?.action || "",
            dialogue: revision?.dialogue || "",
            shotSize: revision?.shotSize || "",
            cameraAngle: revision?.cameraAngle || "",
            cameraMovement: revision?.cameraMovement || "",
            durationSeconds: normalizedDurationSeconds,
            imagePrompt: revision?.imagePrompt || "",
            videoPrompt,
            negativePrompt: revision?.negativePrompt || "",
            continuityNotes: revision?.continuityNotes || "",
        };
        // 镜头与版本 ID 变更会带来全新服务端快照，其他字段只随该快照读取。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveConfig, form, generationCapability, initialModel, message, projectId, revision?.id, selectedShot?.id, shotAssetReferenceContext.mentionReferences]);
    const { editorDirty, markEditorChanged, reconcileSavedValues, clearSavedDraftIfUnchanged, discardCurrentDraft, removeDraft } = useWorkflowShotDraft({
        form,
        projectId,
        selectedShot,
        revision,
        serverValues,
        serverSnapshotKey: shotEditorValuesKey(serverValues),
        resetPreviewArtifactId: setPreviewArtifactId,
    });

    const changeGenerationModel = (nextModel: string) => {
        selectedModelRef.current = nextModel;
        setSelectedModel(nextModel);
        const profile = modelCapabilityConfigFor(effectiveConfig, nextModel);
        if (generationCapability === "video" && profile.video) {
            const normalized = normalizeVideoValue(profile.video, {
                seconds: String(form.getFieldValue("durationSeconds") || generationSeconds),
                ratio: aspectRatio,
                resolution,
            });
            setAspectRatio(normalized.ratio);
            setResolution(normalized.resolution);
            form.setFieldValue("durationSeconds", Number(normalized.seconds));
            return;
        }
        if (generationCapability === "image" && profile.image) {
            const normalized = normalizeImageValue(profile.image, { size: aspectRatio, quality: imageQuality, count: "1" });
            setAspectRatio(normalized.size);
            setImageQuality(normalized.quality);
        }
    };

    const saveShot = useMutation({
        mutationFn: async (values: ShotEditorValues) => {
            if (!selectedShot) throw new Error("请先选择镜头");
            return saveProjectShot(projectId, {
                id: selectedShot.id,
                unitId,
                title: values.title,
                description: values.plotDescription,
                position: selectedShot.position,
                durationMs: Math.round(values.durationSeconds * 1000),
                status: selectedShot.status,
                revision: revisionInput(values),
            });
        },
        onSuccess: async (_result, savedValues) => {
            const unchangedSinceSubmit = reconcileSavedValues(savedValues);
            await onRefresh();
            message.success(unchangedSinceSubmit ? "镜头脚本已保存为新版本" : "镜头脚本已保存，提交期间的新修改仍保留在本地草稿");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "镜头保存失败"),
    });

    const deleteShot = useMutation({
        mutationFn: async ({ shotId }: { shotId: string; nextShotId: string }) => deleteProjectShot(projectId, shotId),
        onSuccess: async (_result, { shotId, nextShotId }) => {
            removeDraft(shotId);
            onSelectShot(nextShotId);
            await onRefresh();
            message.success("镜头已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "镜头删除失败"),
    });

    const changeAssetBinding = useMutation({
        mutationFn: async ({ asset, reference }: { asset?: ProjectAsset; reference?: ShotAssetReference }) => {
            if (!selectedShot) throw new Error("请先选择镜头");
            if (reference) return unlinkShotAsset(projectId, selectedShot.id, reference.id);
            if (!asset?.primaryVersionId) throw new Error("该资产还没有可绑定版本");
            return linkShotAsset(projectId, selectedShot.id, { assetVersionId: asset.primaryVersionId, role: "reference" });
        },
        onSuccess: async (_result, variables) => {
            await onRefresh();
            message.success(variables.reference ? "已取消当前镜头的资产引用" : "资产已绑定到当前镜头");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "镜头资产更新失败"),
    });

    const ensureProductionStep = async () => {
        let productionStep = workflowStep;
        if (!productionStep) {
            const initialized = await createUnitWorkflow(projectId, unitId);
            productionStep = (initialized.workflow.steps || []).find((step) => step.stepKey === activeStage);
        }
        if (!productionStep) throw new Error("当前生成阶段不可用，请刷新页面后重试");
        if (productionStep.status === "failed") {
            const reopened = await updateWorkflowStep(projectId, productionStep.id, { status: "ready" });
            productionStep = reopened.step;
        }
        return productionStep;
    };

    const generateArtifact = async () => {
        if (!selectedShot || submittingShotIds.has(selectedShot.id)) return;
        const submittingShot = selectedShot;
        setSubmittingShotIds((current) => new Set(current).add(submittingShot.id));
        let shotSaved = false;
        try {
            const values = await form.validateFields();
            if (!routedModel) throw new Error(activeStage === "video" ? "请先配置视频模型" : "请先配置图片模型");
            if (routedModel.startsWith("local:dreamina-cli")) throw new Error("本机即梦任务暂不能登记到分镜产物，请选择后端模型渠道");
            const compatibilityError = modelCompatibilityError(effectiveConfig, routedModel, modelRequirements);
            if (compatibilityError) throw new Error(`当前模型配置不可用：${compatibilityError}`);
            const mode = generationCapability;
            const config = { ...generationConfig, videoSeconds: String(Math.max(1, Math.round(values.durationSeconds))) };
            if (!isAiConfigReady(config, routedModel)) throw new Error("当前模型渠道配置不完整，请先到设置中补齐");
            const basePrompt = buildWorkflowArtifactPrompt(activeStage, values);
            const resolvedPrompt = resolveShotAssetMentionPrompt(basePrompt, shotAssetReferenceContext, { dialogue: values.dialogue });
            const skillExecution = await skillRuntime.prepare({
                profile: "shortDrama",
                prompt: resolvedPrompt,
                skills: availableSkills,
                selectedSkillIds,
            });
            const productionStep = await ensureProductionStep();
            const saved = await saveProjectShot(projectId, {
                id: submittingShot.id,
                unitId,
                title: values.title,
                description: values.plotDescription,
                position: submittingShot.position,
                durationMs: Math.round(values.durationSeconds * 1000),
                status: submittingShot.status,
                revision: revisionInput(values),
            });
            shotSaved = true;
            if (activeShotIdRef.current === submittingShot.id) clearSavedDraftIfUnchanged(values);
            await submitBackendGenerationTask({
                projectId,
                mode,
                prompt: skillExecution.prompt,
                config,
                referenceImages: shotAssetReferenceContext.referenceImages,
                referenceAudios: generationReferenceAudios,
                metadata: {
                    ...skillExecution.metadata,
                    workflowStepId: productionStep.id,
                    domainProjectId: projectId,
                    unitId,
                    shotId: saved.shot.id,
                    shotRevisionId: saved.shot.currentRevisionId,
                    artifactType,
                    role: "output",
                    source: "short-drama-workflow",
                    ...(mode === "video" && shotAssetReferenceContext.referenceImages.length ? { videoEditOperation: "reference_to_video" } : {}),
                    resolvedCharacterVersions: shotAssetReferenceContext.resolvedCharacterVersions,
                    artifactMetadata: { model: routedModel, aspectRatio, ...workflowArtifactSpecification(activeStage, resolution, imageQuality), durationSeconds: values.durationSeconds, ...skillExecution.metadata },
                },
            });
            await onRefresh();
            message.success(`${productionStageCopy[activeStage as "storyboard" | "previz" | "video"].label}任务已提交`);
        } catch (error) {
            const detail = error instanceof Error ? error.message : "生成任务提交失败";
            message.error(shotSaved ? `镜头脚本已保存，但生成任务提交失败：${detail}` : detail);
        } finally {
            setSubmittingShotIds((current) => {
                const next = new Set(current);
                next.delete(submittingShot.id);
                return next;
            });
        }
    };

    const selectedShotSubmitting = submittingShotIds.has(selectedShot?.id || "");
    const BatchArtifactButton = activeStage === "video" ? WorkflowBatchVideoButton : activeStage === "previz" ? WorkflowBatchPrevizButton : null;

    if (!selectedShot) {
        return (
            <div className="workflow-empty-shot">
                <Empty description="当前章节还没有分镜">
                    <Button type="primary" icon={<Plus className="size-4" />} loading={addingShot} onClick={onAddShot}>
                        新增第一个分镜
                    </Button>
                </Empty>
            </div>
        );
    }

    const requestShotSelection = (nextShotId: string) => {
        if (nextShotId === selectedShot.id) return;
        if (!editorDirty) {
            onSelectShot(nextShotId);
            return;
        }
        modal.confirm({
            title: "当前镜头有未保存修改",
            content: "切换镜头会放弃这些修改。",
            okText: "放弃修改并切换",
            cancelText: "继续编辑",
            onOk: () => {
                discardCurrentDraft();
                onSelectShot(nextShotId);
            },
        });
    };

    const requestAddShot = () => {
        if (!editorDirty) {
            onAddShot();
            return;
        }
        modal.confirm({
            title: "当前镜头有未保存修改",
            content: "新增镜头会离开当前编辑内容。",
            okText: "放弃修改并新增",
            cancelText: "继续编辑",
            onOk: () => {
                discardCurrentDraft();
                onAddShot();
            },
        });
    };

    const requestDeleteShot = () => {
        const nextShot = shots[shotIndex + 1] || shots[shotIndex - 1];
        modal.confirm({
            title: `删除镜头“${watchedTitle || selectedShot.title || "未命名镜头"}”？`,
            content: editorDirty ? "该镜头的未保存修改、脚本版本、资产引用和生成产物都会被删除，且无法恢复。" : "该镜头的脚本版本、资产引用和生成产物都会被删除，且无法恢复。",
            okText: "删除镜头",
            okButtonProps: { danger: true },
            cancelText: "取消",
            centered: true,
            onOk: () => deleteShot.mutateAsync({ shotId: selectedShot.id, nextShotId: nextShot?.id || "" }),
        });
    };

    const selectRelativeShot = (offset: number) => {
        const next = shots[shotIndex + offset];
        if (next) requestShotSelection(next.id);
    };

    return (
        <div className="workflow-production-shell">
            <header className="workflow-production-statusbar" aria-label="当前制作进度">
                <div className="workflow-production-statusbar-title">
                    <span className="workflow-production-statusbar-icon">
                        <Clapperboard aria-hidden />
                    </span>
                    <span>
                        <small>{stageCopy.label}</small>
                        <strong>{detail.units.find((item) => item.id === unitId)?.title || "当前章节"}</strong>
                    </span>
                </div>
                <div className="workflow-production-statusbar-metrics" aria-live="polite">
                    <span>
                        <CheckCircle2 aria-hidden />
                        已就绪 <strong>{productionSummary.ready}</strong>
                    </span>
                    <span className={productionSummary.active ? "is-active" : ""}>
                        <Activity aria-hidden />
                        生成中 <strong>{productionSummary.active}</strong>
                    </span>
                    <span>
                        <CircleDashed aria-hidden />
                        待处理 <strong>{productionSummary.pending}</strong>
                    </span>
                </div>
                <div className="workflow-production-statusbar-current">
                    <span>当前镜头</span>
                    <strong>
                        SC.{String(shotIndex + 1).padStart(2, "0")} / {String(shots.length).padStart(2, "0")}
                    </strong>
                </div>
            </header>
            <div className="workflow-production-main">
                <aside className="workflow-library-panel">
                    <div className="workflow-library-heading">
                        <span>制作资源</span>
                        <small>绑定到当前镜头</small>
                    </div>
                    <Segmented
                        block
                        size="small"
                        value={leftTab}
                        onChange={(value) => setLeftTab(value as typeof leftTab)}
                        options={[
                            { value: "assets", label: "资产" },
                            { value: "episodes", label: "章节" },
                            { value: "shots", label: "镜头" },
                        ]}
                    />
                    <div className="workflow-library-scroll thin-scrollbar">
                        {leftTab === "assets" ? <AssetLibrary detail={detail} referenceByVersionId={referenceByVersionId} changing={changeAssetBinding.isPending} onToggle={(asset, reference) => changeAssetBinding.mutate({ asset, reference })} /> : null}
                        {leftTab === "episodes" ? <EpisodeLibrary detail={detail} activeUnitId={unitId} projectId={projectId} activeStage={activeStage} /> : null}
                        {leftTab === "shots" ? <ShotLibrary detail={detail} shots={shots} selectedShotId={selectedShot.id} onSelectShot={requestShotSelection} /> : null}
                    </div>
                </aside>

                <WorkflowArtifactPreviewPanel
                    activeStage={activeStage}
                    projectId={projectId}
                    unitId={unitId}
                    selectedShot={selectedShot}
                    shotTask={shotTask}
                    artifacts={artifacts}
                    newestArtifact={newestArtifact}
                    previewArtifact={previewArtifact}
                    previewTab={previewTab}
                    resolution={resolution}
                    imageQuality={imageQuality}
                    generating={selectedShotSubmitting || shotTask?.status === "queued" || shotTask?.status === "running"}
                    onPreviewTabChange={setPreviewTab}
                    onSelectArtifact={(artifact) => setPreviewArtifactId(artifact.id)}
                    onGenerate={() => void generateArtifact()}
                />

                <section className="workflow-shot-editor">
                    <header className="workflow-panel-header">
                        <div className="workflow-shot-heading">
                            <span className="workflow-shot-kicker">镜头检查器</span>
                            <span className="workflow-shot-heading-main">
                                <span className="workflow-shot-number">SC.{String(shotIndex + 1).padStart(2, "0")}</span>
                                <h2>{watchedTitle || selectedShot.title || "未命名镜头"}</h2>
                            </span>
                            <StatusBadge className="workflow-save-status" tone={saveShot.isPending ? "running" : editorDirty ? "warning" : revision ? "success" : "neutral"} live={saveShot.isPending}>
                                {saveShot.isPending ? "保存中" : editorDirty ? "有未保存修改" : revision ? "已保存" : "草稿"}
                            </StatusBadge>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="mr-1 text-[var(--fs-micro)] text-foreground/45">
                                {shotIndex + 1} / {shots.length}
                            </span>
                            <Button type="text" size="small" icon={<ChevronLeft className="size-4" />} disabled={shotIndex <= 0} onClick={() => selectRelativeShot(-1)} aria-label="上一个镜头" />
                            <Button type="text" size="small" icon={<ChevronRight className="size-4" />} disabled={shotIndex >= shots.length - 1} onClick={() => selectRelativeShot(1)} aria-label="下一个镜头" />
                        </div>
                    </header>
                    <Form form={form} layout="vertical" className="workflow-shot-form" onValuesChange={markEditorChanged} onFinish={(values) => saveShot.mutate(values)}>
                        <div className="workflow-shot-form-scroll thin-scrollbar">
                            <div className="workflow-form-section-heading">
                                <span>脚本与表演</span>
                                <small>先写清镜头里发生什么，再调整生成参数</small>
                            </div>
                            <Form.Item name="title" label="镜头名称" rules={[{ required: true, message: "请输入镜头名称" }]}>
                                <Input placeholder="用一句话概括这个镜头" />
                            </Form.Item>
                            <Form.Item name="videoPrompt" label="视频提示词" rules={[{ required: true, message: "请输入视频提示词" }]}>
                                <ShotAssetMentionTextarea references={shotAssetReferenceContext.mentionReferences} />
                            </Form.Item>
                            <BoundAssets detail={detail} shotId={selectedShot.id} changing={changeAssetBinding.isPending} onUnlink={(reference) => changeAssetBinding.mutate({ reference })} />
                            <div className="workflow-form-grid">
                                <Form.Item name="action" label="表演与动作">
                                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="按动作节拍描述人物表演、走位和物体运动" />
                                </Form.Item>
                                <Form.Item name="dialogue" label="对白 / 旁白">
                                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="填写对白、旁白或需要保留的声音信息" />
                                </Form.Item>
                            </div>
                            <WorkflowGenerationSettings
                                generationConfig={generationConfig}
                                generationCapability={generationCapability}
                                modelRequirements={modelRequirements}
                                selectedModel={selectedModel}
                                activeStage={activeStage}
                                availableSkills={availableSkills}
                                skillsLoading={skillsLoading}
                                selectedSkillIds={selectedSkillIds}
                                videoProfile={videoProfile}
                                imageProfile={imageProfile}
                                aspectRatio={aspectRatio}
                                resolution={resolution}
                                imageQuality={imageQuality}
                                durationSummary={durationSummary}
                                resolutionSummary={resolutionSummary}
                                modelSummary={modelSummary}
                                mentionReferences={shotAssetReferenceContext.mentionReferences}
                                onModelChange={changeGenerationModel}
                                onSkillIdsChange={setSelectedSkillIds}
                                onAspectRatioChange={setAspectRatio}
                                onResolutionChange={setResolution}
                                onImageQualityChange={setImageQuality}
                            />
                        </div>
                        <footer className="workflow-editor-actions">
                            <div className="workflow-editor-actions-meta">
                                <div className="workflow-generation-summary" aria-live="polite">
                                    <span className="workflow-generation-target">生成目标 · {stageCopy.label}</span>
                                    <span className="workflow-generation-cost">
                                        {creditsEnabled && formattedGenerationCredits ? (
                                            <>
                                                <CreditSymbol />
                                                <span>预计 {formattedGenerationCredits} 积分</span>
                                            </>
                                        ) : creditsEnabled && routedModel ? (
                                            <span>费用提交时确认</span>
                                        ) : null}
                                    </span>
                                </div>
                                <Button
                                    type="text"
                                    danger
                                    className="workflow-delete-shot-button"
                                    icon={<Trash2 className="size-4" />}
                                    loading={deleteShot.isPending}
                                    disabled={saveShot.isPending || selectedShotSubmitting || changeAssetBinding.isPending}
                                    onClick={requestDeleteShot}
                                >
                                    删除镜头
                                </Button>
                            </div>
                            <div className={`workflow-editor-actions-primary ${BatchArtifactButton ? "" : "is-two"}`}>
                                <Button htmlType="submit" icon={<Save className="size-4" />} loading={saveShot.isPending} disabled={!editorDirty || deleteShot.isPending}>
                                    保存脚本
                                </Button>
                                {BatchArtifactButton ? (
                                    <BatchArtifactButton
                                        detail={detail}
                                        projectId={projectId}
                                        unitId={unitId}
                                        workflowStep={workflowStep}
                                        editorDirty={editorDirty}
                                        routedModel={routedModel}
                                        aspectRatio={aspectRatio}
                                        resolution={resolution}
                                        imageQuality={imageQuality}
                                        effectiveConfig={effectiveConfig}
                                        generationConfig={generationConfig}
                                        availableSkills={availableSkills}
                                        selectedSkillIds={selectedSkillIds}
                                        submittingShotIds={submittingShotIds}
                                        disabled={deleteShot.isPending}
                                        onRefresh={onRefresh}
                                        onSubmittingChange={(shotIds, active) =>
                                            setSubmittingShotIds((current) => {
                                                const next = new Set(current);
                                                shotIds.forEach((shotId) => (active ? next.add(shotId) : next.delete(shotId)));
                                                return next;
                                            })
                                        }
                                    />
                                ) : null}
                                <Button
                                    type="primary"
                                    icon={<Play className="size-4" />}
                                    loading={selectedShotSubmitting || shotTask?.status === "queued" || shotTask?.status === "running"}
                                    disabled={deleteShot.isPending}
                                    onClick={() => void generateArtifact()}
                                >
                                    {selectedShotSubmitting
                                        ? `${stageCopy.action}（正在提交）`
                                        : shotTask?.status === "queued" || shotTask?.status === "running"
                                          ? `${stageCopy.action}（已运行${shotTaskElapsed}）`
                                          : shotTask?.status === "failed"
                                            ? `${stageCopy.action}（上次失败，可重试）`
                                            : shotTask?.status === "succeeded" && !newestArtifact
                                              ? `${stageCopy.action}（已完成，正在同步）`
                                              : newestArtifact
                                                ? `${stageCopy.action}（已生成）`
                                                : stageCopy.action}
                                </Button>
                            </div>
                        </footer>
                    </Form>
                </section>
            </div>

            <ShotTimeline activeStage={activeStage} detail={detail} shots={shots} selectedShotId={selectedShot.id} submittingShotIds={submittingShotIds} onSelectShot={requestShotSelection} onAddShot={requestAddShot} addingShot={addingShot} />
        </div>
    );
}
