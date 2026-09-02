import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

function compact(source: string) {
    return source.replace(/\s+/g, " ").trim();
}

function splitSelectorList(value: string) {
    const selectors: string[] = [];
    let start = 0;
    let roundDepth = 0;
    let squareDepth = 0;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === "(") roundDepth += 1;
        if (character === ")") roundDepth = Math.max(0, roundDepth - 1);
        if (character === "[") squareDepth += 1;
        if (character === "]") squareDepth = Math.max(0, squareDepth - 1);
        if (character === "," && roundDepth === 0 && squareDepth === 0) {
            selectors.push(compact(value.slice(start, index)));
            start = index + 1;
        }
    }
    selectors.push(compact(value.slice(start)));
    return selectors;
}

function ruleBodies(source: string, selector: string) {
    const matches: string[] = [];
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    for (const match of source.matchAll(rulePattern)) {
        const selectorList = match[1].replace(/\/\*[\s\S]*?\*\//g, "");
        if (splitSelectorList(selectorList).includes(selector)) matches.push(compact(match[2]));
    }
    return matches;
}

function expectRuleWith(source: string, selector: string, patterns: RegExp[]) {
    const bodies = ruleBodies(source, selector);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((body) => patterns.every((pattern) => pattern.test(body)))).toBe(true);
}

function sourceSection(source: string, startMarker: string, endMarker: string) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe("PC creation chat and storyboard director workbench regression gates", () => {
    test("keeps the director workbench PC-only and exposes the fixed mode toolbar in the empty state", async () => {
        const [source, toolbarSource, styles] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/creation-workspace-toolbar.tsx"), read("../src/pages/create/creation-workspace.css")]);
        const desktopStart = styles.indexOf("@media (min-width: 1024px)");
        expect(desktopStart).toBeGreaterThanOrEqual(0);
        const preDesktopStyles = styles.slice(0, desktopStart);
        const desktopStyles = styles.slice(desktopStart);
        const emptyRender = sourceSection(source, "{isEmpty ? (", ') : viewMode === "chat" ? (');

        for (const selector of [".creation-workspace-toolbar", ".storyboard-editor-body", ".storyboard-editor-rail", ".storyboard-editor-preview-pane", ".storyboard-editor-inspector", ".storyboard-editor-composer-context"]) {
            expect(preDesktopStyles).not.toContain(selector);
        }

        expect(emptyRender).toContain("{pcBrandV2 ? (");
        expect(emptyRender).toContain("<CreationWorkspaceToolbar");
        expect(emptyRender).toContain('viewMode === "storyboard"');
        expect(emptyRender).toContain('className="creation-empty-workspace creation-scrollbar"');
        expect((source.match(/<CreationWorkspaceToolbar/g) || []).length).toBeGreaterThanOrEqual(3);
        expect(source).toContain('from "./creation-workspace-toolbar"');
        expect(source).not.toContain("function CreationWorkspaceToolbar");
        expect(toolbarSource).toContain("export function CreationHistoryDrawer");
        expect(toolbarSource).toContain("export function CreationWorkspaceToolbar");
        expectRuleWith(desktopStyles, ".creation-home .creation-workspace-toolbar", [/display:\s*grid/, /height:\s*52px/, /grid-template-columns:\s*minmax\([^;]+,\s*1fr\)\s+248px\s+minmax\([^;]+,\s*1fr\)/]);
        expectRuleWith(desktopStyles, ".creation-home > .creation-workspace-toolbar + .creation-empty-workspace", [/min-height:\s*0/, /flex:\s*1\s+1\s+auto/]);
    });

    test("uses stable message-backed shot ids for selection instead of array indexes", async () => {
        const [source, typesSource, storyboardSource] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/creation-types.ts"), read("../src/pages/create/creation-storyboard-workbench.tsx")]);
        const projection = sourceSection(source, "function shotsFromMessages", "function completedCreationGenerationTask");
        const selection = sourceSection(source, "const shots = useMemo", "useEffect(() => {");
        const selectShot = sourceSection(source, "const selectStoryboardShot", "const beginVariantFromShot");
        const rail = sourceSection(storyboardSource, "function StoryboardShotRail", "function StoryboardComposerContext");
        const submit = sourceSection(source, "const submit = async", "useEffect(() => {");

        expect(typesSource).toContain("export type CreationShot = {");
        expect(typesSource).toContain("id: string;");
        expect(projection).toContain("shots.push({ id: message.id, user: message })");
        expect(projection).toContain("shots.push({ id: message.id, result: message })");
        expect(projection).toContain("!shots[shots.length - 1].result");
        expect(selection).toContain("selectedShotId ? shots.findIndex((shot) => shot.id === selectedShotId) : -1");
        expect(selectShot).toContain("setSelectedShotId(shotId)");
        expect(selectShot).toContain("setComposingNextShot(false)");
        expect(rail).toContain("activeShotId: string");
        expect(rail).toContain("const active = shot.id === activeShotId && !composing");
        expect(rail).toContain("onClick={() => onSelect(shot.id)}");
        expect(rail).toContain("activeItemRef.current?.scrollIntoView");
        expect(submit).toContain("...(retryTarget ? { id: retryTarget.shotId } : {})");
        expect(submit).toContain("setSelectedShotId(userMessage.id)");
    });

    test("renders a vertical shot rail, central preview, right inspector, and bottom composer context", async () => {
        const [source, storyboardSource, styles] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/creation-storyboard-workbench.tsx"), read("../src/pages/create/creation-workspace.css")]);
        const desktopStyles = styles.slice(styles.indexOf("@media (min-width: 1024px)"));
        const storyboardRender = sourceSection(source, '<div className="storyboard-workbench">', "<CreationHistoryDrawer");
        const rail = sourceSection(storyboardSource, "function StoryboardShotRail", "function StoryboardComposerContext");
        const shotCard = sourceSection(storyboardSource, "function StoryboardShotCard", "function StoryboardNextShotCard");
        const nextCard = sourceSection(storyboardSource, "function StoryboardNextShotCard", "function StoryboardBriefAttachments");

        const railPosition = storyboardRender.indexOf("<StoryboardShotRail");
        const stagePosition = storyboardRender.indexOf('className="storyboard-workbench-stage"');
        const contextPosition = storyboardRender.indexOf("<StoryboardComposerContext");
        const composerPosition = storyboardRender.indexOf("<CreationComposer");
        expect(railPosition).toBeGreaterThanOrEqual(0);
        expect(stagePosition).toBeGreaterThan(railPosition);
        expect(contextPosition).toBeGreaterThan(stagePosition);
        expect(composerPosition).toBeGreaterThan(contextPosition);
        expect(storyboardRender).toContain('className={`storyboard-editor-body${storyboardTimelineOpen ? "" : " is-rail-collapsed"}`}');
        expect(storyboardRender).toContain('className="storyboard-editor-main"');

        expect(shotCard).toContain('className="storyboard-editor-shot-layout"');
        expect(shotCard).toContain('className="storyboard-editor-preview-pane"');
        expect(shotCard).toContain('className="storyboard-editor-preview-canvas creation-scrollbar"');
        expect(shotCard).toContain('className="storyboard-editor-inspector creation-scrollbar"');
        expect(shotCard).toContain('className="storyboard-editor-inspector-section is-script"');
        expect(shotCard).toContain('className="storyboard-editor-inspector-section is-settings"');
        expect(shotCard).toContain('className="storyboard-workbench-card-summary"');
        expect(shotCard).toContain('className="storyboard-workbench-card-meta"');
        expect(shotCard).toContain('className="storyboard-workbench-card-title"');
        expect(shotCard).toContain("创作内容");
        expect(rail).toContain('storyboard-editor-shot-thumb-state is-${status}');
        expect(nextCard).toContain('className="storyboard-workbench-next-kicker"');
        expect(nextCard).toContain('aria-label="镜头描述建议"');
        expect(nextCard).toContain("主体与动作");
        expect(nextCard).toContain("景别与运镜");
        expect(nextCard).toContain("场景与氛围");

        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-body", [/display:\s*grid/, /min-height:\s*0/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-main", [/display:\s*grid/, /grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-rail", [/display:\s*grid/, /grid-template-rows:\s*50px\s+minmax\(0,\s*1fr\)\s+52px/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-rail-list", [/overflow-x:\s*hidden/, /overflow-y:\s*auto/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-preview-pane", [/grid-template-rows:\s*38px\s+minmax\(0,\s*1fr\)/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-preview-canvas", [/overflow:\s*auto/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-preview-content .creation-video-result", [/width:\s*auto/, /max-width:\s*100%/, /background:\s*transparent/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-inspector", [/overflow-y:\s*auto/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench-composer", [/grid-template-rows:\s*38px\s+auto/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-composer-context", [/display:\s*grid/, /grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\)\s+auto/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench-next-guide", [/display:\s*flex/, /flex-wrap:\s*wrap/]);
    });

    test("locks the compact 1024 rail and the 1280 and 1360 director column widths", async () => {
        const styles = await read("../src/pages/create/creation-workspace.css");
        const desktopStart = styles.indexOf("@media (min-width: 1024px)");
        const wideStart = styles.lastIndexOf("@media (min-width: 1280px) {");
        const cinemaStart = styles.indexOf("@media (min-width: 1360px)", wideStart);
        expect(desktopStart).toBeGreaterThanOrEqual(0);
        expect(wideStart).toBeGreaterThan(desktopStart);
        expect(cinemaStart).toBeGreaterThan(wideStart);
        const desktopStyles = styles.slice(desktopStart, wideStart);
        const wideStyles = styles.slice(wideStart, cinemaStart);
        const cinemaStyles = styles.slice(cinemaStart);

        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-body", [/grid-template-columns:\s*80px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-shot", [/grid-template-columns:\s*minmax\(0,\s*1fr\)/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-shot-info", [/display:\s*none/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-shot-layout", [/grid-template-columns:\s*minmax\(0,\s*1fr\)/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-inspector", [/display:\s*none/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-inspector-toggle", [/display:\s*inline-flex/]);

        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-body", [/grid-template-columns:\s*216px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-shot", [/grid-template-columns:\s*86px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-shot-layout", [/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+280px/]);
        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-inspector", [/display:\s*block/]);
        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-inspector-toggle", [/display:\s*none\s*!important/]);

        expectRuleWith(cinemaStyles, ".creation-home .storyboard-editor-body", [/grid-template-columns:\s*240px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(cinemaStyles, ".creation-home .storyboard-editor-shot", [/grid-template-columns:\s*96px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(cinemaStyles, ".creation-home .storyboard-editor-shot-layout", [/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+320px/]);
    });

    test("uses ordered-list and button semantics with aria-current instead of a fake listbox", async () => {
        const [storyboardSource, toolbar] = await Promise.all([read("../src/pages/create/creation-storyboard-workbench.tsx"), read("../src/pages/create/creation-workspace-toolbar.tsx")]);
        const rail = sourceSection(storyboardSource, "function StoryboardShotRail", "function StoryboardComposerContext");

        expect(rail).toContain('<ol className="storyboard-editor-rail-list creation-scrollbar" aria-label="镜头列表">');
        expect(rail).toContain('aria-current={active ? "true" : undefined}');
        expect(rail).toContain('type="button" aria-current="true" className="storyboard-editor-shot is-draft is-active"');
        expect(rail).not.toContain('role="listbox"');
        expect(rail).not.toContain('role="option"');
        expect(rail).not.toContain("aria-selected");
        expect(rail).toContain('aria-label="收起镜头轨道"');
        expect(rail).toContain('aria-label="收起镜头草稿"');
        expect(toolbar).toContain('aria-controls={storyboard.timelineOpen && storyboard.count > 0 ? "storyboard-timeline" : undefined}');
        expect(toolbar).not.toContain('aria-haspopup="listbox"');
    });

    test("maps streaming and cancelled states consistently in the rail, card, and result", async () => {
        const [storyboardSource, styles] = await Promise.all([read("../src/pages/create/creation-storyboard-workbench.tsx"), read("../src/pages/create/creation-workspace.css")]);
        const stateContract = sourceSection(storyboardSource, "type StoryboardShotState", "function storyboardShotTitle");
        const shotCard = sourceSection(storyboardSource, "function StoryboardShotCard", "function StoryboardNextShotCard");
        const result = storyboardSource.slice(storyboardSource.indexOf("function StoryboardShotResult"));
        const desktopStyles = styles.slice(styles.indexOf("@media (min-width: 1024px)"));

        expect(stateContract).toContain('cancelled: "已停止"');
        expect(stateContract).toContain('if (status === "pending" || status === "streaming") return "pending"');
        expect(stateContract).toContain('if (status === "cancelled") return "cancelled"');
        expect(shotCard).toContain("const normalizedStoryboardStatus = storyboardShotState(shot)");
        expect(shotCard).toContain('const status = compactLayout ? normalizedStoryboardStatus : result?.status || "queued"');
        expect(shotCard).toContain('compactLayout && status === "cancelled"');
        expect(shotCard).toContain('className="storyboard-workbench-card-state is-cancelled">已停止');
        expect(shotCard).toContain('aria-busy={status === "pending" || status === "streaming" ? true : undefined}');
        expect(result).toContain('if (status === "cancelled")');
        expect(result).toContain('className="storyboard-workbench-error is-cancelled" role="alert"');
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-shot-state.is-cancelled", [/background:\s*var\(--app-status-info-bg/, /color:\s*var\(--app-status-info-fg/]);
    });

    test("presents variants as a new-shot flow and never as an in-place mutation", async () => {
        const [source, storyboardSource] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/creation-storyboard-workbench.tsx")]);
        const variant = sourceSection(source, "const beginVariantFromShot", "const updateComposerPrompt");
        const context = sourceSection(storyboardSource, "function StoryboardComposerContext", "function StoryboardToolbar");
        const shotCard = sourceSection(storyboardSource, "function StoryboardShotCard", "function StoryboardNextShotCard");
        const stage = sourceSection(source, "const storyboardStageContent", "return (");
        const nextCard = sourceSection(storyboardSource, "function StoryboardNextShotCard", "function StoryboardBriefAttachments");
        const promptUpdate = sourceSection(source, "const updateComposerPrompt", "const composerProps");
        const composeControls = sourceSection(source, "const cancelComposeNextShot", "const selectStoryboardShot");

        expect(variant).toContain("createVariant(shot.result, resultIndex)");
        expect(variant).toContain("setVariantSourceShotId(shot.id)");
        expect(variant).toContain("setSelectedShotId(shot.id)");
        expect(variant).toContain("setComposingNextShot(true)");
        expect(variant).toContain("将创建一个新镜头");
        expect(context).toContain("提交后仍会创建新镜头");
        expect(context).toContain("这里的每次提交都会创建一个新镜头，不会覆盖当前浏览的镜头");
        expect(shotCard).toContain('{compactLayout ? "复用为新镜头" : "生成变体"}');
        expect(stage).toContain("if (pcBrandV2) beginVariantFromShot");
        expect(stage).toContain("else if (visibleShotResultIndex >= 0 && visibleShot.result) createVariant");
        expect(nextCard).toContain('{compactLayout ? "收起草稿" : "取消撰写"}');
        expect(nextCard).toContain("影策会拆解脚本、设计运镜并渲染成片");
        expect(promptUpdate).toContain('if (pcBrandV2 && viewMode === "storyboard" && value.trim())');
        expect(composeControls).toContain('if (pcBrandV2 && hasStoryboardDraft) toast.info("草稿已保留在下方输入区")');
    });

    test("keeps failed-shot retry non-destructive until validation and guards conversation changes", async () => {
        const source = await read("../src/pages/create/index.tsx");
        const submit = sourceSection(source, "const submit = async", "useEffect(() => {");
        const retry = sourceSection(source, "const retryFailedMessage", "const createVariant");
        const retryEffect = sourceSection(source, "if (!retrySequence) return", "const startNewConversation");

        expect(retry).not.toContain("updateActive(");
        expect(retry).not.toContain("removedIds");
        expect(retry).not.toContain("messages.filter");
        expect(retry).toContain("原镜头已保留，请确认草稿后再次生成");
        expect(retry).toContain("conversationId: activeConversation.id");
        expect(retry).toContain("userMessageId: previous.id");
        expect(retry).toContain("assistantMessageId: assistant.id");
        expect(retryEffect).toContain("void submit(pending.context, pending.lockKey, pending.target)");

        const guardPosition = submit.indexOf("if (retryTarget && activeConversation.id !== retryTarget.conversationId)");
        const compatibilityPosition = submit.indexOf("const compatibilityError = modelCompatibilityError");
        const preparePosition = submit.indexOf("skillExecution = await skillRuntime.prepare");
        const replacementPosition = submit.indexOf("const replacedIds = new Set");
        expect(guardPosition).toBeGreaterThanOrEqual(0);
        expect(compatibilityPosition).toBeGreaterThan(guardPosition);
        expect(preparePosition).toBeGreaterThan(compatibilityPosition);
        expect(replacementPosition).toBeGreaterThan(preparePosition);
        expect(submit).toContain('toast.warning("已切换到其他创作，本次重试未执行")');
        expect(submit).toContain("if (retryTarget && conversation.id === retryTarget.conversationId)");
        expect(submit).toContain("retained.splice(insertAt >= 0 ? insertAt : retained.length, 0, userMessage, assistantMessage)");
        expect(submit).toContain("setSelectedShotId(userMessage.id)");
    });

    test("retains preview, download, retry, canvas handoff, upload, and generation fingerprints", async () => {
        const [source, messageSource, composerSource, storyboardSource] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/creation-message-view.tsx"), read("../src/pages/create/creation-composer.tsx"), read("../src/pages/create/creation-storyboard-workbench.tsx")]);
        const shotCard = sourceSection(storyboardSource, "function StoryboardShotCard", "function StoryboardNextShotCard");
        const result = storyboardSource.slice(storyboardSource.indexOf("function StoryboardShotResult"));
        const downloads = sourceSection(messageSource, "export function CreationResultDownloads", "function CreationMediaPending");
        const composer = sourceSection(composerSource, "function CreationComposer", "function ModePicker");

        expect(storyboardSource).toContain("creationCanvasHandoffPath(resultAssetIds, resultUrls.length)");
        expect(source).toContain("runBackendGenerationTask(");
        expect(source).toContain("runBackendGenerationTaskBatch(");
        expect(source).toContain("onSubmit: () => void submit()");
        expect(shotCard).toContain("onRetryFailure");
        expect(shotCard).toContain('<Link className="storyboard-workbench-card-action" to={canvasPath}>');
        expect(shotCard).toContain("<CreationResultDownloads results={resultMedia} />");
        expect(result).toContain('aria-label="预览生成视频"');
        expect(result).toContain('style={{ aspectRatio: creationMediaAspectRatio(result.settings?.ratio, "video") }}');
        expect(result).toContain('aria-label="预览生成图片"');
        expect(result).toContain("{!compactLayout ? (");
        expect(result).not.toContain('className="storyboard-workbench-result-details"');
        expect(result).toContain('<CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />');
        expect(downloads).toContain("href={entry.url} download");
        expect(composer).toContain('type="file" hidden');
        expect(composer).toContain("onDrop={handleComposerDrop}");
        expect(composer).toContain("props.onFilesDrop(event.dataTransfer.files)");
        expect(composer).toContain("props.fileInputRef.current?.click()");
        expect(composer).toContain("props.onOpenLibrary");
        expect(composer).toContain('aria-label="打开素材库上传或选择素材"');
    });

    test("treats expected materialization cancellation as lifecycle cleanup instead of a generation failure", async () => {
        const source = await read("../src/pages/create/index.tsx");
        const materialization = sourceSection(source, "async function materializeCreationTaskResults", "function reconcileCreationTaskMessages");
        const cancellationPosition = materialization.indexOf("if (isGenerationTaskCancelled(error, signal)) return task");
        const warningPosition = materialization.indexOf("创作生成结果资源化失败");
        const failurePosition = materialization.indexOf("creationError:");

        expect(cancellationPosition).toBeGreaterThanOrEqual(0);
        expect(warningPosition).toBeGreaterThan(cancellationPosition);
        expect(failurePosition).toBeGreaterThan(cancellationPosition);
    });
});
