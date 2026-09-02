import { useMemo, useRef, useState } from "react";
import { App, Button } from "antd";
import { ListVideo } from "lucide-react";

import { modelCompatibilityError, type ModelRequirements } from "@/lib/model-selection";
import { submitBackendGenerationTask } from "@/services/api/generation-task";
import { createUnitWorkflow, updateWorkflowStep, type ProjectDetail, type WorkflowStep } from "@/services/api/projects";
import type { Skill } from "@/services/api/skills";
import { skillRuntime } from "@/services/skill-runtime";
import { type AiConfig, useConfigStore } from "@/stores/use-config-store";

import { buildWorkflowArtifactPrompt, workflowArtifactSpecification } from "./workflow-generation-prompt";
import { planWorkflowBatchGeneration, savedShotEditorValues, settleWorkflowBatch } from "./workflow-batch-generation";
import { buildShotAssetReferenceContext, ensureShotAssetMentionPrompt, resolveShotAssetMentionPrompt } from "./workflow-shot-references";

type Props = {
    detail: ProjectDetail;
    projectId: string;
    unitId: string;
    workflowStep?: WorkflowStep;
    editorDirty: boolean;
    routedModel: string;
    aspectRatio: string;
    resolution: string;
    imageQuality: string;
    effectiveConfig: AiConfig;
    generationConfig: AiConfig;
    availableSkills: Skill[];
    selectedSkillIds: string[];
    submittingShotIds: ReadonlySet<string>;
    disabled?: boolean;
    onSubmittingChange: (shotIds: string[], active: boolean) => void;
    onRefresh: () => Promise<void>;
};

export function WorkflowBatchVideoButton(props: Props) {
    const {
        detail, projectId, unitId, workflowStep, editorDirty, routedModel, aspectRatio, resolution, imageQuality,
        effectiveConfig, generationConfig, availableSkills, selectedSkillIds, submittingShotIds, disabled,
        onSubmittingChange, onRefresh,
    } = props;
    const { message, modal } = App.useApp();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [submitting, setSubmitting] = useState(false);
    const dialogOpenRef = useRef(false);
    const plan = useMemo(() => planWorkflowBatchGeneration(detail, unitId, "video", submittingShotIds), [detail, submittingShotIds, unitId]);

    const ensureProductionStep = async () => {
        let productionStep = workflowStep;
        if (!productionStep) {
            const initialized = await createUnitWorkflow(projectId, unitId);
            productionStep = (initialized.workflow.steps || []).find((step) => step.stepKey === "video");
        }
        if (!productionStep) throw new Error("视频生成阶段不可用，请刷新页面后重试");
        if (productionStep.status === "failed") {
            const reopened = await updateWorkflowStep(projectId, productionStep.id, { status: "ready" });
            productionStep = reopened.step;
        }
        return productionStep;
    };

    const requestBatchGeneration = () => {
        if (dialogOpenRef.current || submitting) return;
        if (editorDirty) {
            message.warning("请先保存当前镜头，再批量生成缺失视频");
            return;
        }
        if (!routedModel) {
            message.error("请先配置视频模型");
            return;
        }
        if (routedModel.startsWith("local:dreamina-cli")) {
            message.error("本机即梦任务暂不能登记到分镜产物，请选择后端模型渠道");
            return;
        }
        try {
            const prepared = plan.candidates.map((candidate) => {
                const context = buildShotAssetReferenceContext(detail, candidate.shot.id);
                const values = savedShotEditorValues(candidate.shot, candidate.revision);
                values.videoPrompt = ensureShotAssetMentionPrompt(values.videoPrompt || "", context.mentionReferences);
                if (!values.videoPrompt.trim()) throw new Error(`镜头“${candidate.shot.title}”还没有视频提示词`);
                const durationSeconds = String(Math.max(1, Math.round(values.durationSeconds)));
                const videoOperation = context.referenceImages.length ? "reference_to_video" : undefined;
                const requirements: ModelRequirements = {
                    capability: "video",
                    input: { textCount: 1, imageCount: context.referenceImages.length, videoCount: 0, audioCount: context.referenceAudios.length, characterCount: 0 },
                    videoOperation,
                    videoSeconds: durationSeconds,
                    options: { size: aspectRatio, vquality: resolution, videoSeconds: Number(durationSeconds) },
                };
                const compatibilityError = modelCompatibilityError(effectiveConfig, routedModel, requirements);
                if (compatibilityError) throw new Error(`镜头“${candidate.shot.title}”与当前模型不兼容：${compatibilityError}`);
                const config = { ...generationConfig, videoSeconds: durationSeconds };
                if (!isAiConfigReady(config, routedModel)) throw new Error("当前模型渠道配置不完整，请先到设置中补齐");
                const basePrompt = buildWorkflowArtifactPrompt("video", values);
                const prompt = resolveShotAssetMentionPrompt(basePrompt, context, { dialogue: values.dialogue });
                return { candidate, context, values, config, prompt, videoOperation };
            });
            if (!prepared.length) return;
            dialogOpenRef.current = true;
            modal.confirm({
                title: `批量生成 ${prepared.length} 个缺失镜头视频？`,
                content: <div className="space-y-2 text-sm"><p>将使用当前视频模型、画幅和清晰度，为每个镜头建立独立后台任务，并按各镜头实际规格计费。</p>{plan.unavailableCount ? <p className="text-foreground/55">另有 {plan.unavailableCount} 个镜头没有已保存脚本版本，本次会跳过。</p> : null}</div>,
                okText: `提交 ${prepared.length} 个任务`,
                cancelText: "取消",
                centered: true,
                afterClose: () => { dialogOpenRef.current = false; },
                onOk: async () => {
                    const shotIds = prepared.map((item) => item.candidate.shot.id);
                    setSubmitting(true);
                    onSubmittingChange(shotIds, true);
                    try {
                        const productionStep = await ensureProductionStep();
                        const results = await settleWorkflowBatch(prepared, async (item, batchIndex) => {
                            const skillExecution = await skillRuntime.prepare({ profile: "shortDrama", prompt: item.prompt, skills: availableSkills, selectedSkillIds });
                            return submitBackendGenerationTask({
                                projectId,
                                mode: "video",
                                prompt: skillExecution.prompt,
                                config: item.config,
                                referenceImages: item.context.referenceImages,
                                referenceAudios: item.context.referenceAudios,
                                metadata: {
                                    ...skillExecution.metadata,
                                    workflowStepId: productionStep.id,
                                    domainProjectId: projectId,
                                    unitId,
                                    shotId: item.candidate.shot.id,
                                    shotRevisionId: item.candidate.revision.id,
                                    artifactType: "video",
                                    role: "output",
                                    source: "short-drama-workflow",
                                    batchIndex,
                                    batchCount: prepared.length,
                                    ...(item.videoOperation ? { videoEditOperation: item.videoOperation } : {}),
                                    resolvedCharacterVersions: item.context.resolvedCharacterVersions,
                                    artifactMetadata: { model: routedModel, aspectRatio, ...workflowArtifactSpecification("video", resolution, imageQuality), durationSeconds: item.values.durationSeconds, ...skillExecution.metadata },
                                },
                            });
                        }, 3);
                        let refreshFailed = false;
                        try {
                            await onRefresh();
                        } catch {
                            refreshFailed = true;
                        }
                        const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
                        const submittedCount = results.length - failed.length;
                        if (!failed.length && !refreshFailed) message.success(`已提交 ${submittedCount} 个镜头视频任务`);
                        else if (!failed.length) message.warning(`已提交 ${submittedCount} 个任务，但列表刷新失败，请稍后刷新页面查看`);
                        else {
                            const firstError = failed[0].reason instanceof Error ? failed[0].reason.message : "任务提交失败";
                            message.warning(`已提交 ${submittedCount} 个任务，${failed.length} 个未提交：${firstError}`);
                        }
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "批量任务提交失败");
                    } finally {
                        setSubmitting(false);
                        onSubmittingChange(shotIds, false);
                    }
                },
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量生成预检失败");
        }
    };

    const title = plan.candidates.length
        ? `只提交缺少已选中视频且当前没有运行任务的 ${plan.candidates.length} 个镜头`
        : plan.unavailableCount
            ? "缺失视频的镜头还没有已保存脚本版本"
            : "当前没有需要批量生成的视频镜头";
    const label = `批量生成缺失视频${plan.candidates.length ? `（${plan.candidates.length}）` : ""}`;
    return <Button className="workflow-batch-video-button" icon={<ListVideo className="size-4" />} loading={submitting} disabled={disabled || plan.candidates.length === 0} title={title} aria-label={label} onClick={requestBatchGeneration}><span className="workflow-batch-video-button__label">{label}</span></Button>;
}
