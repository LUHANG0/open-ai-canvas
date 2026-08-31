import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { removeCreationAttachment } from "../src/pages/create/creation-assets";

function compactSource(source: string) {
    return source.replace(/\s+/g, " ").trim();
}

describe("creation library button", () => {
    test("本机上传和素材库入口长期显示在参考素材区域，底栏不重复", () => {
        const source = readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8");
        const dockStart = source.indexOf('<footer className="creation-chat-dock">');
        const dockEnd = source.indexOf("</footer>", dockStart);

        expect(dockStart).toBeGreaterThanOrEqual(0);
        expect(dockEnd).toBeGreaterThan(dockStart);
        const dockSource = compactSource(source.slice(dockStart, dockEnd));

        expect(dockSource).toContain("<ModePicker mode={props.mode}");
        expect(dockSource).not.toContain('aria-label="从本机上传附件"');
        expect(dockSource).not.toContain('aria-label="打开素材库选择参考内容"');
        expect(dockSource).not.toContain("VoiceRecordingButton");
        expect(source).toContain('className="creation-entry-button creation-reference-action is-upload"');
        expect(source).toContain('className="creation-entry-button creation-reference-action is-library"');
        expect(source).toContain('aria-label="打开素材库上传或选择素材"');
        expect(source).toContain("const showReferenceEntry = !props.attachments.length");
        expect(source).not.toContain("referencesSupported && !props.attachments.length");
        expect(source).toContain('className="creation-reference-add-button"');
        expect(source).toContain("onClick={props.onOpenLibrary}");
    });

    test("素材库上传只入库，不静默勾选或加入当前创作", () => {
        const source = readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8");
        const pickerSource = readFileSync(resolve(import.meta.dir, "../src/components/assets/asset-library-picker-modal.tsx"), "utf8");
        const uploadStart = source.indexOf("const uploadLibraryAssets = async");
        const uploadEnd = source.indexOf("const handleFileChange", uploadStart);

        expect(uploadStart).toBeGreaterThanOrEqual(0);
        expect(uploadEnd).toBeGreaterThan(uploadStart);
        expect(source.slice(uploadStart, uploadEnd)).not.toContain("setAttachments");
        expect(source).toContain("onUpload: uploadLibraryAssets");
        expect(source).not.toContain("onUpload={() => fileInputRef.current?.click()}");
        expect(source).toContain("先保存到素材库，确认后再加入本次创作");
        expect(source).toContain("autoSelectUploaded: false");
        expect(pickerSource).toContain("upload?.autoSelectUploaded !== false");
        expect(pickerSource).toContain("保存完成后请手动选择");
        expect(source).not.toContain("并自动选中");
        expect(source).toContain("个素材已保存到素材库");
    });

    test("previews prompt reference images without removing them", () => {
        const createSource = readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8");
        const canvasSource = readFileSync(resolve(import.meta.dir, "../src/components/canvas/canvas-node-prompt-panel.tsx"), "utf8");

        expect(createSource).toContain('className="creation-user-message-attachments"');
        expect(createSource).toContain('setPreviewType(kind === "video" ? "video" : "image")');
        expect(createSource).toContain("<CreationMediaPreviewModal url={previewUrl} type={previewType}");
        expect(canvasSource).toContain("canPreview ? setImagePreview(reference) : onInsert(reference)");
        expect(canvasSource).toContain("<AntImage");
        expect(canvasSource).toContain("onClick={() => onInsert(reference)}");
    });

    test("参考内容轨道始终展开并支持 Reorder 排序", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));
        const styles = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");
        const workspaceStyles = readFileSync(resolve(import.meta.dir, "../src/pages/create/creation-workspace.css"), "utf8");

        expect(source).toContain('import { Reorder } from "motion/react"');
        expect(source).toContain("<Reorder.Group");
        expect(source).toContain('axis="x"');
        expect(source).toContain("values={visibleAttachments}");
        expect(source).toContain("onReorder={reorderVisibleAttachments}");
        expect(source).toContain('className="creation-reference-card-remove" onPointerDownCapture={(event) => event.stopPropagation()}');
        expect(source).toContain("<Reorder.Item");
        expect(source).toContain('layout="position"');
        expect(source).not.toContain("setReferencePanelExpanded");
        expect(source).toContain('props.attachments.length ? " has-references" : ""');
        expect(source).toContain('className="creation-reference-panel is-expanded"');
        expect(source).toContain("className={`creation-reference-track is-expanded");
        expect(source).not.toContain("creation-reference-collapsed");
        expect(source).not.toContain('aria-label="收起素材面板"');
        expect(workspaceStyles).toContain("width: 44px");
        expect(workspaceStyles).toContain("height: 44px");
        expect(workspaceStyles).toContain("grid-template-columns: minmax(0, 1fr) max-content");
        expect(workspaceStyles).toContain("grid-column: 1 / -1");
        expect(workspaceStyles).toContain("min-height: 119px");
        expect(workspaceStyles).toContain("--creation-composer-writing-height: 176px");
        expect(workspaceStyles).toContain("min-height: var(--creation-composer-writing-height)");
        expect(workspaceStyles).toContain("max-height: var(--creation-composer-writing-height)");
        expect(workspaceStyles).toContain("height: 56px");
        expect(workspaceStyles).toContain("background-color: var(--creation-surface)");
        expect(workspaceStyles).not.toContain("0 0 0 3px var(--creation-accent-soft)");
        expect(workspaceStyles).toContain("display: flow-root");
        expect(workspaceStyles).not.toContain("float: left");
        expect(workspaceStyles).toContain("overflow: visible !important");
        expect(workspaceStyles).toContain("min-height: 150px");
        expect(workspaceStyles).toContain("max-height: 66px");
        expect(source).toContain("清空全部素材");
        expect(source).toContain('role="group"');
        expect(source).toContain("aria-pressed={referenceFilter === filter.id}");
        expect(source).toContain('{ id: "file", label: "文件", count: referenceCounts.file }');
        expect(source).toContain("canDragReferences");
        expect(source).toContain("creation-reference-track-wrapper");
        expect(source).toContain("creation-reference-stack-card");
        expect(source).toContain("creation-reference-add-button");
        expect(source).toContain("addReferenceLabel");
        expect(source).toContain("aria-busy={interactionBusy}");
        expect(source).toContain('className="creation-reference-add-button" onClick={props.onOpenLibrary} disabled={interactionBusy}');
        expect(source).toContain("creation-reference-track-button");
        expect(source).toContain("imageReferenceAtPoint");
        expect(source).toContain("setDropTargetReferenceId");
        expect(source).toContain("props.onReplaceAttachment(target.attachmentId, item)");
        expect(source).toContain("onReferenceFilesDrop=");
        expect(source).toContain("CanvasPromptOptimizerDrawer");
        expect(source).toContain("promptOptimizerOpen");
        expect(source).toContain("provider={props.promptOptimizerProvider}");
        expect(styles).toContain(".creation-reference-track");
        expect(styles).toContain(".creation-reference-stack-card");
        expect(styles).toContain("--stack-rotate: -7deg");
        expect(styles).toContain(".creation-reference-track.is-expanded");
        expect(styles).toContain(".creation-reference-stack-card:is(:hover, :focus-within) .creation-reference-card-content");
        expect(styles).toContain("@media (hover: none)");
        expect(styles).toContain(".creation-reference-card-remove { opacity: 1; }");
        expect(styles).not.toContain(".creation-reference-track:not(.is-expanded) .creation-reference-stack-card:nth-child(n+5) { display: block; }");

        expect(workspaceStyles).toContain(".creation-chat-composer:is(.is-empty, .is-thread).has-references .creation-reference-track");
        expect(workspaceStyles).toContain("width: 44px;");
        expect(workspaceStyles).toContain("height: 44px;");
        expect(workspaceStyles).toContain("creation-reference-entry");
        expect(source).toContain("onFilesDrop: addOrStoreLocalFiles");
        expect(source).toContain('event.dataTransfer.dropEffect = interactionBusy ? "none" : "copy"');
        expect(source).toContain("props.onFilesDrop(event.dataTransfer.files)");
        expect(source).toContain('className="creation-file-drop-overlay"');
    });

    test("首个、中间和末尾参考内容都按稳定 id 独立删除并保留顺序", () => {
        const attachments = [
            { id: "first", name: "首个" },
            { id: "middle", name: "中间" },
            { id: "last", name: "末尾" },
        ];

        expect(removeCreationAttachment(attachments, "first").map((item) => item.id)).toEqual(["middle", "last"]);
        expect(removeCreationAttachment(attachments, "middle").map((item) => item.id)).toEqual(["first", "last"]);
        expect(removeCreationAttachment(attachments, "last").map((item) => item.id)).toEqual(["first", "middle"]);
    });

    test("无素材时参考卡片作为编辑器外的独立顶部工具栏", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));
        const editorSource = compactSource(readFileSync(resolve(import.meta.dir, "../src/components/canvas/canvas-resource-mention-textarea.tsx"), "utf8"));
        const workspaceStyles = readFileSync(resolve(import.meta.dir, "../src/pages/create/creation-workspace.css"), "utf8");

        expect(source).toContain("const showReferenceEntry = !props.attachments.length");
        expect(source).toContain('showReferenceEntry ? " has-reference-entry" : ""');
        expect(source).toContain('className="creation-reference-entry-bar" aria-label="参考素材工具栏"');
        expect(source).not.toContain("forceRichEditor={showReferenceEntry}");
        expect(editorSource).not.toContain("forceRichEditor");
        expect(editorSource).not.toContain("--creation-reference-scroll-offset");
        expect(workspaceStyles).toContain(".creation-home .creation-reference-entry-bar {");
        expect(workspaceStyles).toContain("border-bottom: 1px solid var(--creation-border);");
        expect(workspaceStyles).toContain("--creation-composer-writing-height: 126px;");
        expect(source).toContain('className="creation-entry-button creation-reference-action is-upload"');
        expect(source).toContain('className="creation-entry-button creation-reference-action is-library"');
        expect(source).toContain("参考素材");
        expect(source).toContain("可以先上传到素材库；选择模型后再添加为参考");
        expect(workspaceStyles).toContain("position: relative;");
        expect(workspaceStyles).toContain("pointer-events: auto;");
        expect(workspaceStyles).not.toContain('.creation-chat-mention-editor[role="textbox"]::before');
        expect(workspaceStyles).not.toContain("float: left;");
    });

    test("删除按钮隔离拖拽，顶部与已有素材面板都可继续上传", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));

        expect(source).toContain("onPointerDownCapture={(event) => event.stopPropagation()}");
        expect(source).toContain("onRemove(item.id)");
        expect(source).toContain("onClick={() => props.fileInputRef.current?.click()}");
        expect(source).toContain("onClick={props.onOpenLibrary}");
    });

    test("视频创作的声音开关会更新生成配置并反馈当前状态", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));

        expect(source).toContain('onGenerateAudioChange: (enabled: boolean) => updateConfig("videoGenerateAudio", String(enabled))');
        expect(source).toContain('className="creation-chat-control creation-entry-button creation-sound-toggle"');
        expect(source).toContain("aria-pressed={generateAudio}");
        expect(source).toContain("onClick={() => props.onGenerateAudioChange(!generateAudio)}");
        expect(source).toContain('{generateAudio ? "有声音" : "无声音"}');
    });

    test("生成同款恢复参数时不会被模型默认值覆盖或污染非视频配置", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));

        expect(source).toContain("draftSettingsRestoreRef");
        expect(source).toContain('pendingRestore?.mode === "video"');
        expect(source).toContain('nextMode === "video" && nextSettings.generateAudio !== undefined');
        expect(source).toContain('nextMode === "video" && nextSettings.watermark !== undefined');
        expect(source).toContain('setVideoOperationChoice("auto")');
    });

    test("视频生成方式、首尾帧角色和分类限制会进入提交链路", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));
        const workspaceStyles = readFileSync(resolve(import.meta.dir, "../src/pages/create/creation-workspace.css"), "utf8");

        expect(source).toContain("<VideoOperationPicker value={props.videoOperationChoice}");
        expect(source).toContain('aria-label="选择视频生成方式"');
        expect(source).toContain("normalizeCreationVideoImageRoles");
        expect(source).toContain("creationVideoFrameAttachmentIds(submissionAttachments)");
        expect(source).toContain("videoStartFrameNodeId");
        expect(source).toContain("videoEndFrameNodeId");
        expect(source).toContain("videoEditOperation: videoOperation");
        expect(source).toContain('videoOperationExplicit: videoOperationChoice !== "auto"');
        expect(source).toContain("modelGroupReferenceLimits(config, selectedModel, mode)");
        expect(source).toContain("modelGroupVideoOperations(config, selectedModel)");
        expect(source).toContain("operations={props.videoOperations}");
        expect(source).toContain("reconcileCreationAttachmentLimits");
        expect(source).toContain("filterCreationUploadFiles");
        expect(source).toContain("className={`creation-reference-frame-role is-${videoImageRole}`}");
        expect(source).toContain("onVideoImageRoleChange(item.id, option.value)");
        expect(workspaceStyles).toContain(".creation-video-operation-menu");
        expect(workspaceStyles).toContain(".creation-home .creation-reference-frame-role");
    });

    test("无可用模型时发送按钮硬禁用并提供明确恢复入口", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));

        expect(source).toContain("const canSubmit = Boolean(props.model) && Boolean(props.prompt.trim()) && invalidReferenceCount === 0 && !interactionBusy");
        expect(source).toContain("disabled={interactionBusy || !canSubmit}");
        expect(source).toContain("请先选择${modeLabels[props.mode]}模型");
        expect(source).toContain('to={settingsPath("models", true)}');
        expect(source).toContain("if (!selectedModel) {");
    });

    test("素材库批量选择超限时原子拒绝，不静默裁剪或关闭弹窗", () => {
        const source = readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8");
        const start = source.indexOf("const handleLibrarySelect");
        const end = source.indexOf("const removeAttachment", start);
        const selection = source.slice(start, end);

        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        expect(selection).toContain("reconcileCreationAttachmentLimits(merged, mode, referenceLimits)");
        expect(selection).toContain("throw new Error");
        expect(selection).not.toContain(".attachments;");
        expect(selection.indexOf("throw new Error")).toBeLessThan(selection.indexOf("setAttachments"));
        expect(selection.indexOf("throw new Error")).toBeLessThan(selection.indexOf("setLibraryOpen(false)"));
        expect(selection).toContain("const selectedIdSet = new Set(selectedIds)");
        expect(selection).toContain("return !libraryId || selectedIdSet.has(libraryId)");
        expect(selection).toContain("if (selectedIds.length && !next.length)");
    });

    test("素材库满额时仍可替换已有素材，无模型时文件选择器只展示可入库媒体", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));

        expect(source).toContain("ignoreCapacity = false");
        expect(source).toContain("!ignoreCapacity && referenceCounts[kind] >= limit");
        expect(source).toContain("allowEmptySelection");
        expect(source).toContain('const directUploadAccept = props.mode === "text" && canAddMoreReferences ? creationUploadAccept("text") : "image/*,video/*,audio/*"');
        expect(source).toContain("accept={directUploadAccept}");
    });

    test("不兼容素材会保留并标记，手机端生成配置完整换行展示", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));
        const workspaceStyles = readFileSync(resolve(import.meta.dir, "../src/pages/create/creation-workspace.css"), "utf8");

        expect(source).toContain("const invalidReferenceReasons = useMemo");
        expect(source).toContain("invalidReason={invalidReferenceReasons.get(item.id)}");
        expect(source).toContain('className="creation-reference-invalid-badge"');
        expect(source).toContain("个不兼容");
        expect(workspaceStyles).toContain(".creation-home .creation-reference-card-content.is-invalid");
        expect(workspaceStyles).toContain("grid-template-columns: minmax(0, 1fr) max-content;");
        expect(workspaceStyles).toContain("flex-wrap: wrap;");
        expect(workspaceStyles).toContain("height: 38px !important;");
    });

    test("全部创作入口按配置与输入素材分组并共用按钮外壳", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));
        const workspaceStyles = readFileSync(resolve(import.meta.dir, "../src/pages/create/creation-workspace.css"), "utf8");

        expect(source).toContain('className="creation-entry-group is-config" role="group" aria-label="生成配置"');
        expect(source).toContain('className="creation-entry-group is-input" role="group" aria-label="提示词辅助"');
        expect(source).toContain('className="creation-entry-divider"');
        expect(source).toContain('className="creation-model-picker creation-entry-button is-model"');
        expect(source).not.toContain("VoiceRecordingButton");
        expect(source).not.toContain('aria-label="从本机上传附件"');
        expect(source).not.toContain('aria-label="打开素材库选择参考内容"');
        expect(source).toContain("creation-reference-entry");
        expect(workspaceStyles).toContain(".creation-chat-composer:is(.is-empty, .is-thread) {");
        expect(workspaceStyles).toContain("--creation-toolbar-button-bg: #f1f3f5;");
        expect(workspaceStyles).toContain("--creation-toolbar-button-bg: #272b32;");
        expect(workspaceStyles).toContain("background: var(--creation-toolbar-button-bg) !important;");
        expect(workspaceStyles).toContain(".creation-home .creation-entry-button,");
        expect(workspaceStyles).toContain(".creation-home .creation-entry-group.is-input");
        expect(workspaceStyles).toContain(".creation-home .creation-entry-divider");
        expect(workspaceStyles).toContain("@layer utilities {");
        expect(workspaceStyles).toContain(".creation-chat-composer:is(.is-empty, .is-thread):focus-within {");
        expect(workspaceStyles).toContain("box-shadow: none !important;");
        expect(workspaceStyles).toContain("filter: none !important;");
    });

    test("画幅与清晰度使用带说明和选中反馈的参数卡片", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));
        const workspaceStyles = readFileSync(resolve(import.meta.dir, "../src/pages/create/creation-workspace.css"), "utf8");

        expect(source).toContain('className="creation-choice-copy"');
        expect(source).toContain('className="creation-option-check"');
        expect(source).toContain("ratioDisplayLabel(value)");
        expect(source).toContain("resolutionDisplayDescription(option.value)");
        expect(source).toContain("resolutionDisplayDescription(choice)");
        expect(source).toContain("creation-generation-settings-surface");
        expect(workspaceStyles).toContain("width: min(372px, calc(100vw - 24px))");
        expect(workspaceStyles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
        expect(workspaceStyles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
        expect(workspaceStyles).toContain(".creation-choice-copy small");
        expect(workspaceStyles).toContain("button.is-selected .creation-option-check");
    });

    test("对话消息、生成明细与媒体预览采用统一结果卡设计", () => {
        const source = compactSource(readFileSync(resolve(import.meta.dir, "../src/pages/create/index.tsx"), "utf8"));
        const workspaceStyles = readFileSync(resolve(import.meta.dir, "../src/pages/create/creation-workspace.css"), "utf8");

        expect(source).toContain("completedAt?: string");
        expect(source).toContain('className="creation-media-details"');
        expect(source).toContain("生成耗时");
        expect(source).toContain("视频时长");
        expect(source).toContain("video.videoWidth");
        expect(source).toContain("image.naturalWidth");
        expect(source).toContain('width="fit-content"');
        expect(source).toContain('playsInline preload="metadata"');
        expect(workspaceStyles).toContain(".creation-home .creation-user-message {");
        expect(workspaceStyles).toContain(".creation-home .creation-assistant-message {");
        expect(workspaceStyles).toContain(".creation-home .creation-media-details {");
        expect(workspaceStyles).toContain("max-width: 640px;");
        expect(workspaceStyles).toContain("display: flex;");
        expect(workspaceStyles).toContain(".creation-chat-composer:is(.is-empty, .is-thread) .creation-chat-writing-surface");
        expect(workspaceStyles).toContain(".creation-chat-composer:is(.is-empty, .is-thread) {");
        expect(workspaceStyles).toContain("--creation-composer-writing-height: 176px;");
        expect(workspaceStyles).toContain("height: var(--creation-composer-writing-height);");
        expect(workspaceStyles).toContain(".creation-chat-composer:is(.is-empty, .is-thread) .creation-chat-dock");
        expect(workspaceStyles).toContain("max-height: 56px;");
        expect(workspaceStyles).toContain(".creation-media-preview-modal.is-video .creation-media-preview-video");
        expect(workspaceStyles).toContain("background: transparent !important;");
        expect(workspaceStyles).toContain("max-height: 84vh");
    });
});
