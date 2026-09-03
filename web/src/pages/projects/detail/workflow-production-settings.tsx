import type { ReactNode } from "react";
import { Form, Input, InputNumber, Select } from "antd";
import { ChevronDown, SlidersHorizontal, WandSparkles } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { SkillRuntimePicker } from "@/components/skills/skill-runtime-picker";
import type { ImageCapabilityConfig, VideoCapabilityConfig } from "@/lib/model-capabilities";
import { videoDurationOptions } from "@/lib/model-capabilities";
import type { ModelRequirements } from "@/lib/model-selection";
import { formatVideoResolutionLabel } from "@/lib/video-generation-options";
import type { Skill } from "@/services/api/skills";
import type { AiConfig, ModelCapability } from "@/stores/use-config-store";

import { ShotAssetMentionTextarea } from "./workflow-production-assets";
import type { buildShotAssetReferenceContext } from "./workflow-shot-references";

type Props = {
    generationConfig: AiConfig;
    generationCapability: ModelCapability;
    modelRequirements: ModelRequirements;
    selectedModel: string;
    activeStage: string;
    availableSkills: Skill[];
    skillsLoading: boolean;
    selectedSkillIds: string[];
    videoProfile?: VideoCapabilityConfig;
    imageProfile?: ImageCapabilityConfig;
    aspectRatio: string;
    resolution: string;
    imageQuality: string;
    durationSummary: string;
    resolutionSummary: string;
    modelSummary: string;
    mentionReferences: ReturnType<typeof buildShotAssetReferenceContext>["mentionReferences"];
    onModelChange: (model: string) => void;
    onSkillIdsChange: (skillIds: string[]) => void;
    onAspectRatioChange: (value: string) => void;
    onResolutionChange: (value: string) => void;
    onImageQualityChange: (value: string) => void;
};

export function WorkflowGenerationSettings({ generationConfig, generationCapability, modelRequirements, selectedModel, activeStage, availableSkills, skillsLoading, selectedSkillIds, videoProfile, imageProfile, aspectRatio, resolution, imageQuality, durationSummary, resolutionSummary, modelSummary, mentionReferences, onModelChange, onSkillIdsChange, onAspectRatioChange, onResolutionChange, onImageQualityChange }: Props) {
    return (
        <>
            <WorkflowDisclosure
                icon={<SlidersHorizontal />}
                title="生成设置"
                description="生成规格与镜头语言"
                summary={<><span>{durationSummary}</span><span>{aspectRatio}</span><span>{resolutionSummary}</span><span className="is-model">{modelSummary}</span></>}
            >
                <div className="workflow-settings-section">
                    <div className="workflow-settings-section-title">生成规格</div>
                    <Form.Item label="生成模型">
                        <ModelPicker
                            config={generationConfig}
                            value={selectedModel}
                            capability={generationCapability}
                            requirements={modelRequirements}
                            onChange={onModelChange}
                            fullWidth
                            className="workflow-model-picker"
                            placeholder={activeStage === "video" ? "选择视频模型" : "选择图片模型"}
                            showSelectedPrice
                        />
                    </Form.Item>
                    <Form.Item label="技能库"><SkillRuntimePicker profile="shortDrama" skills={availableSkills} loading={skillsLoading} value={selectedSkillIds} onChange={onSkillIdsChange} /></Form.Item>
                    <div className="workflow-form-grid is-three">
                        <Form.Item name="durationSeconds" label="镜头时长（秒）">
                            {generationCapability === "video" && videoProfile?.duration.selection === "enum"
                                ? <Select options={videoDurationOptions(videoProfile).map((value) => ({ value, label: `${value} 秒` }))} />
                                : <InputNumber className="w-full" min={generationCapability === "video" ? videoProfile?.duration.min || 1 : 0.5} max={generationCapability === "video" ? videoProfile?.duration.max || 60 : 60} step={generationCapability === "video" ? videoProfile?.duration.step || 1 : 0.5} />}
                        </Form.Item>
                        <Form.Item label={generationCapability === "video" ? "画幅" : "尺寸 / 画幅"}>
                            <Select
                                showSearch
                                value={aspectRatio}
                                onChange={onAspectRatioChange}
                                options={(generationCapability === "video" ? videoProfile?.ratios || [] : imageProfile?.size.values.filter((value) => value !== "*") || []).map((value) => ({ value, label: value }))}
                            />
                        </Form.Item>
                        {generationCapability === "video" ? (
                            <Form.Item label="分辨率"><Select value={resolution} onChange={onResolutionChange} options={(videoProfile?.resolutions || []).map((value) => ({ value, label: formatVideoResolutionLabel(value) }))} /></Form.Item>
                        ) : imageProfile?.quality.supported ? (
                            <Form.Item label="生成画质"><Select value={imageQuality} onChange={onImageQualityChange} options={imageProfile.quality.values.map((value) => ({ value, label: value.toUpperCase() }))} /></Form.Item>
                        ) : <div />}
                    </div>
                </div>
                <div className="workflow-settings-section">
                    <div className="workflow-settings-section-title">镜头语言</div>
                    <div className="workflow-form-grid is-three">
                        <Form.Item name="shotSize" label="景别"><Select allowClear placeholder="自动" options={["特写", "近景", "中景", "全景", "远景"].map((value) => ({ value, label: value }))} /></Form.Item>
                        <Form.Item name="cameraAngle" label="机位角度"><Select allowClear placeholder="自动" options={["平视", "俯拍", "仰拍", "侧面", "过肩"].map((value) => ({ value, label: value }))} /></Form.Item>
                        <Form.Item name="cameraMovement" label="运镜方式"><Select allowClear placeholder="自动" options={["固定", "推镜", "拉镜", "摇镜", "移镜", "跟拍"].map((value) => ({ value, label: value }))} /></Form.Item>
                    </div>
                </div>
            </WorkflowDisclosure>
            <WorkflowDisclosure
                className="is-advanced"
                icon={<WandSparkles />}
                title="生成补充"
                description="仅在模型需要额外约束时填写"
                summary={<span>提示词 · 排除内容 · 接戏</span>}
            >
                <div className="workflow-form-grid">
                    <Form.Item name="plotDescription" label="镜头画面" rules={[{ required: true, message: "请输入镜头画面" }]}><ShotAssetMentionTextarea variant="scene" references={mentionReferences} /></Form.Item>
                    <Form.Item name="imagePrompt" label="画面提示词"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="留空时根据镜头画面自动生成" /></Form.Item>
                    <Form.Item name="negativePrompt" label="排除内容"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="填写不希望出现的元素、动作或画面问题" /></Form.Item>
                    <Form.Item name="continuityNotes" label="接戏备注"><Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="记录人物位置、朝向、服装、道具及前后镜延续关系" /></Form.Item>
                </div>
            </WorkflowDisclosure>
        </>
    );
}

function WorkflowDisclosure({ icon, title, description, summary, className = "", children }: { icon: ReactNode; title: string; description: string; summary: ReactNode; className?: string; children: ReactNode }) {
    return (
        <details className={`workflow-disclosure ${className}`}>
            <summary>
                <span className="workflow-disclosure-heading"><span className="workflow-disclosure-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span></span>
                <span className="workflow-disclosure-summary">{summary}<ChevronDown className="workflow-disclosure-chevron" /></span>
            </summary>
            <div className="workflow-disclosure-body"><div className="workflow-disclosure-content">{children}</div></div>
        </details>
    );
}
