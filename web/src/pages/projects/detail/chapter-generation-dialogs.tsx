import { Alert, InputNumber } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { SkillRuntimePicker } from "@/components/skills/skill-runtime-picker";
import { DialogFrame } from "@/components/ui/pc";
import { navigateToSettings } from "@/lib/settings-navigation";
import type { ProjectUnit } from "@/services/api/projects";
import type { Skill } from "@/services/api/skills";
import type { AiConfig } from "@/stores/use-config-store";

type ModelDialogProps = {
    open: boolean;
    selectedUnit?: ProjectUnit;
    effectiveConfig: AiConfig;
    selectedTextModel: string;
    onTextModelChange: (model: string) => void;
    onClose: () => void;
    onSubmit: () => void;
};

export function ChapterAssetExtractionDialog({ open, selectedUnit, effectiveConfig, selectedTextModel, onTextModelChange, onClose, onSubmit }: ModelDialogProps) {
    return (
        <DialogFrame
            className="pc-project-dialog sd-content-dialog"
            title="拆分章节资产"
            subtitle="识别角色、场景、服饰、道具和武器，结果统一进入待确认队列。"
            open={open}
            frameSize="sm"
            okText="开始拆分"
            cancelText="取消"
            okButtonProps={{ disabled: !selectedTextModel }}
            onCancel={onClose}
            onOk={onSubmit}
        >
            <div className="grid gap-4">
                <div className="sd-content-dialog-summary rounded-lg border border-border/70 px-3 py-3">
                    <div className="text-[var(--fs-tiny)] text-foreground/42">当前章节</div>
                    <div className="mt-1 truncate text-sm font-medium text-foreground/85">{selectedUnit?.title}</div>
                    <div className="mt-1 text-[var(--fs-tiny)] text-foreground/38">正文会交给本次选择的文本模型分析，只保留后续分镜和生成需要跨镜头一致的制作资产。</div>
                </div>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground/68">文本模型</span>
                    <ModelPicker
                        config={effectiveConfig}
                        capability="text"
                        value={selectedTextModel}
                        onChange={onTextModelChange}
                        fullWidth
                        placeholder="选择用于拆分资产的文本模型"
                        showSelectedPrice={false}
                        onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                    />
                </label>
            </div>
        </DialogFrame>
    );
}

export function ChapterStoryboardGenerationDialog({
    open,
    selectedUnit,
    effectiveConfig,
    selectedTextModel,
    onTextModelChange,
    onClose,
    onSubmit,
    storyboardImpact,
    availableSkills,
    skillsLoading,
    selectedSkillIds,
    onSkillIdsChange,
}: ModelDialogProps & { storyboardImpact: { shotCount: number }; availableSkills: Skill[]; skillsLoading: boolean; selectedSkillIds: string[]; onSkillIdsChange: (skillIds: string[]) => void }) {
    return (
        <DialogFrame
            className="pc-project-dialog sd-content-dialog"
            title="生成章节分镜"
            subtitle="生成成功后会写入分镜制作；已有镜头仅在确认后整体替换。"
            open={open}
            frameSize="md"
            okText={storyboardImpact.shotCount ? "重新生成分镜" : "生成分镜"}
            cancelText="取消"
            okButtonProps={{ disabled: !selectedTextModel }}
            onCancel={onClose}
            onOk={onSubmit}
        >
            <div className="grid gap-4">
                <div className="sd-content-dialog-summary rounded-lg border border-border/70 px-3 py-3">
                    <div className="text-[var(--fs-tiny)] text-foreground/42">当前章节</div>
                    <div className="mt-1 truncate text-sm font-medium text-foreground/85">{selectedUnit?.title}</div>
                    <div className="mt-1 text-[var(--fs-tiny)] text-foreground/38">正文将作为分镜依据，生成结果会直接写入“分镜制作”。</div>
                </div>
                {storyboardImpact.shotCount ? <Alert type="warning" showIcon message={`本章已有 ${storyboardImpact.shotCount} 个分镜`} description="继续后会先生成新分镜；生成成功后，再按确认内容整体替换旧镜头及其关联数据。" /> : null}
                <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground/68">文本模型</span>
                    <ModelPicker
                        config={effectiveConfig}
                        capability="text"
                        value={selectedTextModel}
                        onChange={onTextModelChange}
                        fullWidth
                        placeholder="选择用于生成分镜的文本模型"
                        showSelectedPrice={false}
                        onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                    />
                </label>
                <div>
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-foreground/68">分镜技能</span>
                        <SkillRuntimePicker profile="shortDrama" skills={availableSkills} loading={skillsLoading} value={selectedSkillIds} onChange={onSkillIdsChange} placeholder="选择本次章节分镜使用的技能" />
                    </label>
                    <p className="mt-2 text-[var(--fs-tiny)] leading-5 text-foreground/42">可不选，最多 4 个。所选技能会在本次生成时由统一 Skill Runtime 按需读取，并记录实际使用的版本和文件。</p>
                </div>
            </div>
        </DialogFrame>
    );
}

export function MoveChapterDialog({
    open,
    position,
    chapterCount,
    loading,
    onPositionChange,
    onClose,
    onSubmit,
}: {
    open: boolean;
    position: number | null;
    chapterCount: number;
    loading: boolean;
    onPositionChange: (position: number | null) => void;
    onClose: () => void;
    onSubmit: () => void;
}) {
    return (
        <DialogFrame
            className="pc-project-dialog sd-content-dialog"
            title="移动章节"
            subtitle="其他章节会按目标位置自动顺延。"
            open={open}
            frameSize="sm"
            okText="移动"
            cancelText="取消"
            okButtonProps={{ disabled: !position || position < 1 || position > chapterCount, loading }}
            onCancel={onClose}
            onOk={onSubmit}
        >
            <div className="text-xs leading-5 text-foreground/50">输入目标章节位置。适合上千章项目的长距离调整，移动后其他章节会自动顺延。</div>
            <label className="mt-3 flex items-center gap-2 text-sm">
                <span className="shrink-0">移动到第</span>
                <InputNumber min={1} max={chapterCount} precision={0} value={position} onChange={onPositionChange} className="min-w-0 flex-1" />
                <span className="shrink-0">章</span>
            </label>
        </DialogFrame>
    );
}
