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
        const [source, draftSource, typesSource, storyboardSource, transactionSource, submitSource] = await Promise.all([
            read("../src/pages/create/index.tsx"),
            read("../src/pages/create/use-creation-draft-workflow.ts"),
            read("../src/pages/create/creation-types.ts"),
            read("../src/pages/create/creation-storyboard-workbench.tsx"),
            read("../src/pages/create/creation-submission-transaction.ts"),
            read("../src/pages/create/use-creation-submit-workflow.ts"),
        ]);
        const projection = sourceSection(source, "function shotsFromMessages", "export default function CreatePage");
        const selection = sourceSection(source, "const shots = useMemo", "const visibleShotIndex");
        const selectShot = sourceSection(draftSource, "const selectStoryboardShot", "const beginVariantFromShot");
        const rail = sourceSection(storyboardSource, "function StoryboardShotRail", "function StoryboardComposerContext");
        const submit = sourceSection(submitSource, "const submit = async", "useEffect(() => {");

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
        expect(transactionSource).toContain("...(input.retryTarget ? { id: input.retryTarget.shotId } : {})");
        expect(submit).toContain("selectSubmittedShot(userMessage.id)");
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
        expect(rail).toContain("storyboard-editor-shot-thumb-state is-${status}");
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

    test("keeps rail, preview, and inspector visible from 1024px with bounded director columns", async () => {
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

        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-body", [/grid-template-columns:\s*84px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-shot", [/grid-template-columns:\s*minmax\(0,\s*1fr\)/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-shot-info", [/display:\s*none/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-shot-layout", [/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+220px/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-inspector", [/display:\s*block/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-editor-inspector-toggle", [/display:\s*none\s*!important/]);

        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-body", [/grid-template-columns:\s*200px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-shot", [/grid-template-columns:\s*86px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-shot-layout", [/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+260px/]);
        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-inspector", [/display:\s*block/]);
        expectRuleWith(wideStyles, ".creation-home .storyboard-editor-inspector-toggle", [/display:\s*none\s*!important/]);

        expectRuleWith(cinemaStyles, ".creation-home .storyboard-editor-body", [/grid-template-columns:\s*220px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(cinemaStyles, ".creation-home .storyboard-editor-shot", [/grid-template-columns:\s*96px\s+minmax\(0,\s*1fr\)/]);
        expectRuleWith(cinemaStyles, ".creation-home .storyboard-editor-shot-layout", [/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+300px/]);
    });

    test("puts the desktop composer before auxiliary inspiration without changing the mobile branch", async () => {
        const [source, composer, toolbar, message, styles] = await Promise.all([
            read("../src/pages/create/index.tsx"),
            read("../src/pages/create/creation-composer.tsx"),
            read("../src/pages/create/creation-workspace-toolbar.tsx"),
            read("../src/pages/create/creation-message-view.tsx"),
            read("../src/pages/create/creation-workspace.css"),
        ]);
        const emptyRender = sourceSection(source, "{isEmpty ? (", ') : viewMode === "chat" ? (');
        const desktopComposer = emptyRender.indexOf('{pcBrandV2 ? (\n                                <div className="creation-empty-composer">');
        const suggestions = emptyRender.indexOf("<CreationEmptySuggest");
        const mobileComposer = emptyRender.indexOf('{!pcBrandV2 ? (\n                                <div className="creation-empty-composer">');
        const modePicker = sourceSection(composer, "function ModePicker", "function VideoOperationPicker");

        expect(desktopComposer).toBeGreaterThanOrEqual(0);
        expect(suggestions).toBeGreaterThan(desktopComposer);
        expect(mobileComposer).toBeGreaterThan(suggestions);
        expect(source).toContain("desktopLayout: pcBrandV2");
        expect(composer).toContain('props.desktopLayout ? " is-desktop" : ""');
        expect(composer).toContain('!props.desktopLayout && props.mode === "video"');
        expect(composer).not.toContain('<SettingSection title="参考模式"');
        expect(modePicker).toContain('{ mode: "video", icon: <Film />, label: "文生视频" }');
        expect(modePicker).toContain('{ mode: "image", icon: <ImageIcon />, label: "图片生成" }');
        expect(modePicker).toContain('{ mode: "text", icon: <MessageSquareText />, label: "文本创作" }');
        expect(modePicker).toContain('className="creation-mode-picker-menu" role="listbox"');
        expect(modePicker).not.toContain("combineVideoOperation");
        expect(modePicker).not.toContain("参考模式");
        expect(modePicker).not.toContain("creation-mode-operation-grid");
        expect(styles).not.toContain(".creation-mode-picker-menu.is-combined");
        expect(styles).not.toContain(".creation-mode-operation-grid");
        expect(composer).not.toContain("...(props.desktopLayout ? [videoOperation.label] : [])");
        expect(composer).toContain('props.desktopLayout ? "创作类型" : "类型"');
        expect(composer).toContain('terminology={props.desktopLayout ? "创作类型" : "生成类型"}');
        expect(composer).toContain("showSelectedPrice={!props.desktopLayout}");
        expect(composer).toContain("fullWidth={props.desktopLayout}");
        expect(composer).toContain('<SettingSection title="时长"');
        expect(composer).not.toContain('<SettingSection title="声音"');
        expect(composer).toContain('className="creation-config-field is-sound"');
        expect(composer).toContain('className="creation-prompt-panel-header"');
        expect(composer).toContain('className="creation-reference-panel-title"');
        expect(composer).toContain('.filter((filter) => !props.desktopLayout || filter.id === "all" || filter.count > 0)');
        const finalDesktopStyles = styles.slice(styles.lastIndexOf("/*\n * 创作页桌面端层级收口"));
        const layeredOverrides = sourceSection(styles, "/* 旧版透明按钮位于 utilities 层", "\n}\n\n.creation-home .creation-sound-toggle");
        expectRuleWith(finalDesktopStyles, ".creation-home .creation-chat-composer.is-desktop.has-references .creation-chat-editor", [/display:\s*grid/, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+clamp\(264px,\s*32%,\s*304px\)/]);
        expectRuleWith(finalDesktopStyles, ".creation-home .creation-chat-composer.is-desktop.has-references .creation-chat-mention-editor", [/min-height:\s*112px/, /max-height:\s*144px/]);
        expectRuleWith(finalDesktopStyles, ".creation-home .creation-chat-composer.is-desktop .creation-entry-group.is-config", [/display:\s*flex/, /width:\s*auto/, /flex:\s*0\s+1\s+auto/]);
        expectRuleWith(finalDesktopStyles, ".creation-home .creation-chat-composer.is-desktop .creation-config-field.is-mode", [/width:\s*136px/, /flex:\s*0\s+0\s+136px/]);
        expectRuleWith(finalDesktopStyles, ".creation-home .creation-chat-composer.is-desktop .creation-config-field.is-model .creation-model-picker", [
            /width:\s*100%\s*!important/,
            /min-width:\s*0/,
            /max-width:\s*100%\s*!important/,
            /overflow:\s*hidden/,
        ]);
        expectRuleWith(layeredOverrides, ".creation-home .creation-chat-composer.is-desktop .creation-config-field.is-model .creation-model-picker.canvas-composer-model-picker", [
            /width:\s*100%\s*!important/,
            /min-width:\s*0\s*!important/,
            /max-width:\s*100%\s*!important/,
        ]);
        expectRuleWith(finalDesktopStyles, ".creation-home .creation-chat-composer.is-desktop .creation-submit-cluster", [/display:\s*flex/, /gap:\s*8px/]);
        expectRuleWith(finalDesktopStyles, ".creation-home .creation-chat-composer.is-desktop .creation-submit-estimate", [/height:\s*42px/, /align-items:\s*flex-end/]);
        expect(toolbar).toContain('aria-label={desktopLayout ? "工作方式" : "创作视图"}');
        expect(toolbar).toContain("desktopLayout ? <span>新建</span> : null");
        expect(toolbar).toContain("desktopLayout ? <span>历史</span> : null");
        expect(message).toContain('compactLayout ? "继续调整" : "生成同款"');
    });

    test("keeps the new turn graph and continuation UI behind the desktop breakpoint", async () => {
        const [source, messageSource, submitSource, transactionSource, draftSource, composerSource] = await Promise.all([
            read("../src/pages/create/index.tsx"),
            read("../src/pages/create/creation-message-view.tsx"),
            read("../src/pages/create/use-creation-submit-workflow.ts"),
            read("../src/pages/create/creation-submission-transaction.ts"),
            read("../src/pages/create/use-creation-draft-workflow.ts"),
            read("../src/pages/create/creation-composer.tsx"),
        ]);
        const compactSource = compact(source);

        expect(compactSource).toContain("{pcBrandV2 ? shots.map");
        expect(compactSource).toContain(": activeConversation.messages.map");
        expect(compactSource).toContain("<CreationMessageView");
        expect(compactSource).toContain("legacyLayout");
        expect(compactSource).toContain("createVariant(item, index, { legacy: true })");
        expect(source).toContain("continuationContext: pcBrandV2 &&");
        expect(source).toContain("linkConversationMessages: pcBrandV2");
        expect(submitSource).toContain("linkMessages: linkConversationMessages");
        expect(transactionSource).toContain("const linkMessages = input.linkMessages !== false");
        expect(draftSource).toContain("if (options?.legacy)");
        expect(messageSource).toContain("legacyLayout = false");
        expect(composerSource).toContain("{props.desktopLayout ? (");
        expect(composerSource).toContain('className="creation-entry-button creation-reference-action is-upload"');
        expect(composerSource).toContain('className="creation-entry-button creation-reference-action is-library"');
    });

    test("compacts the desktop composer controls instead of clipping them at narrow PC widths", async () => {
        const styles = await read("../src/pages/create/creation-workspace.css");
        const compactDesktop = sourceSection(styles, "/* 窄屏 PC 保持所有关键配置可达", "@media (min-width: 1280px) and (max-width: 1439px)");

        expect(compactDesktop).toContain("@media (min-width: 1024px) and (max-width: 1279px)");
        expect(compactDesktop).toContain("overflow: visible");
        expect(compactDesktop).toContain("flex: 1 1 104px");
        expect(compactDesktop).toContain("flex: 0 0 38px");
        expect(compactDesktop).toContain(".creation-reference-add-chevron");
        expect(compactDesktop).toContain("display: none");
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
        const [source, draftSource, storyboardSource] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/use-creation-draft-workflow.ts"), read("../src/pages/create/creation-storyboard-workbench.tsx")]);
        const variant = sourceSection(draftSource, "const beginVariantFromShot", "const updateComposerPrompt");
        const context = sourceSection(storyboardSource, "function StoryboardComposerContext", "function StoryboardToolbar");
        const shotCard = sourceSection(storyboardSource, "function StoryboardShotCard", "function StoryboardNextShotCard");
        const stage = sourceSection(source, "const storyboardStageContent", "return (");
        const nextCard = sourceSection(storyboardSource, "function StoryboardNextShotCard", "function StoryboardBriefAttachments");
        const promptUpdate = sourceSection(draftSource, "const updateComposerPrompt", "const resetStoryboardDraftState");
        const composeControls = sourceSection(draftSource, "const cancelComposeNextShot", "const selectStoryboardShot");

        expect(variant).toContain("createVariant(shot.result, resultIndex, { announce: false })");
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
        const [source, draftSource, preparationSource, transactionSource, submitSource] = await Promise.all([
            read("../src/pages/create/index.tsx"),
            read("../src/pages/create/use-creation-draft-workflow.ts"),
            read("../src/pages/create/creation-submit-preparation.ts"),
            read("../src/pages/create/creation-submission-transaction.ts"),
            read("../src/pages/create/use-creation-submit-workflow.ts"),
        ]);
        const submit = sourceSection(submitSource, "const submit = async", "useEffect(() => {");
        const guard = sourceSection(submitSource, "export function creationSubmissionStartGuard", "export function useCreationSubmitWorkflow");
        const retry = sourceSection(draftSource, "const retryFailedMessage", "const createVariant");
        const retryEffect = sourceSection(submitSource, "if (!pendingRetry) return", "return { submit, cancelSubmission, cancellingMessageIds }");

        expect(retry).not.toContain("updateActive(");
        expect(retry).not.toContain("removedIds");
        expect(retry).not.toContain("messages.filter");
        expect(retry).toContain("原镜头已保留，请确认草稿后再次生成");
        expect(retry).toContain("conversationId: activeConversation.id");
        expect(retry).toContain("userMessageId: pair.userMessage.id");
        expect(retry).toContain("assistantMessageId: pair.assistantMessage.id");
        expect(retry).toContain("parentMessageId: pair.userMessage.parentMessageId");
        expect(retryEffect).toContain("void submit(pendingRetry.context, pendingRetry.lockKey, pendingRetry.target)");

        const guardPosition = submit.indexOf("const guard = creationSubmissionStartGuard");
        const validationPosition = submit.indexOf("const preparation = prepareCreationSubmission");
        const preparePosition = submit.indexOf("skillExecution = await skillRuntime.prepare");
        const replacementPosition = submit.indexOf("applyCreationSubmissionToConversation");
        expect(guardPosition).toBeGreaterThanOrEqual(0);
        expect(validationPosition).toBeGreaterThan(guardPosition);
        expect(preparePosition).toBeGreaterThan(validationPosition);
        expect(replacementPosition).toBeGreaterThan(preparePosition);
        expect(guard.indexOf("if (input.retryConversationId")).toBeLessThan(guard.indexOf("if (!input.selectedModel)"));
        expect(preparationSource).toContain("const compatibilityError = modelCompatibilityError");
        expect(preparationSource).toContain("reconcileCreationAttachmentLimits(submissionAttachments, mode, referenceLimits)");
        expect(guard).toContain('message: "已切换到其他创作，本次重试未执行"');
        expect(transactionSource).toContain("if (retryTarget && conversation.id === retryTarget.conversationId)");
        expect(transactionSource).toContain("const userParentMessageId = linkMessages ? (input.retryTarget ? input.retryTarget.parentMessageId : input.continuationParentMessageId) : undefined");
        expect(transactionSource).toContain("deletedMessageIds.delete(userMessage.id)");
        expect(transactionSource).toContain("retained.splice(insertAt >= 0 ? insertAt : retained.length, 0, userMessage, assistantMessage)");
        expect(submit).toContain("selectSubmittedShot(userMessage.id)");
    });

    test("retains preview, download, retry, canvas handoff, upload, and generation fingerprints", async () => {
        const [source, executorSource, messageSource, composerSource, storyboardSource, submitSource] = await Promise.all([
            read("../src/pages/create/index.tsx"),
            read("../src/pages/create/creation-generation-executor.ts"),
            read("../src/pages/create/creation-message-view.tsx"),
            read("../src/pages/create/creation-composer.tsx"),
            read("../src/pages/create/creation-storyboard-workbench.tsx"),
            read("../src/pages/create/use-creation-submit-workflow.ts"),
        ]);
        const shotCard = sourceSection(storyboardSource, "function StoryboardShotCard", "function StoryboardNextShotCard");
        const result = storyboardSource.slice(storyboardSource.indexOf("function StoryboardShotResult"));
        const downloads = sourceSection(messageSource, "export function CreationResultDownloads", "function CreationMediaPending");
        const composer = sourceSection(composerSource, "function CreationComposer", "function ModePicker");

        expect(storyboardSource).toContain("creationCanvasHandoffPath(resultAssetIds, resultUrls.length)");
        expect(executorSource).toContain("runBackendGenerationTask(");
        expect(executorSource).toContain("runBackendGenerationTaskBatch(");
        expect(submitSource).toContain("executeCreationGeneration({");
        expect((submitSource.match(/requestLifecycle\.release\(\)/g) || []).length).toBe(1);
        expect(submitSource).not.toContain("abortRef.current?.abort()");
        expect(submitSource).not.toContain("submissionControllersRef.current.forEach((controller) => controller.abort())");
        expect(submitSource).toContain("Abort 只代表当前页面停止消费结果");
        expect(submitSource).toContain("if (cancelledByUserMessageIdsRef.current.has(assistantMessage.id))");
        expect(submitSource).toContain("const uniqueTaskIds = creationCancelableTaskIds(taskIds)");
        expect(submitSource).toContain("if (!uniqueTaskIds.length)");
        expect(submitSource).toContain("任务创建完成后才能停止，请稍候");
        expect(submitSource).toContain("Promise.allSettled(uniqueTaskIds.map((id) => cancelGenerationTask(id)))");
        expect(submitSource).toContain("if (cancelledCount !== uniqueTaskIds.length)");
        expect(submitSource.indexOf("if (!uniqueTaskIds.length)")).toBeLessThan(submitSource.indexOf("controller?.abort()"));
        expect(submitSource.indexOf("cancelledByUserMessageIdsRef.current.add(messageId)")).toBeLessThan(submitSource.indexOf("controller?.abort()"));
        expect(submitSource).toContain("controller?.abort()");
        expect(submitSource).toContain("cancelCreationSubmissionMessage(item)");
        expect(messageSource).toContain("const canCancelGeneration = !legacyLayout && creationCancelableTaskIds(item.taskIds).length > 0");
        expect(messageSource).toContain("disabled={cancelling || !canCancelGeneration}");
        expect(messageSource).toContain("任务创建完成后即可停止");
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
        expect(composer).toContain("<CreationReferenceAddMenu");
    });

    test("treats expected materialization cancellation as lifecycle cleanup instead of a generation failure", async () => {
        const source = await read("../src/pages/create/creation-task-lifecycle.ts");
        const materialization = sourceSection(source, "async function materializeCreationTaskResults", "function reconcileCreationTaskMessages");
        const cancellationPosition = materialization.indexOf("if (isGenerationTaskCancelled(error, signal)) return task");
        const warningPosition = materialization.indexOf("创作生成结果资源化失败");
        const failurePosition = materialization.indexOf("creationError:");

        expect(cancellationPosition).toBeGreaterThanOrEqual(0);
        expect(warningPosition).toBeGreaterThan(cancellationPosition);
        expect(failurePosition).toBeGreaterThan(cancellationPosition);
    });
});
