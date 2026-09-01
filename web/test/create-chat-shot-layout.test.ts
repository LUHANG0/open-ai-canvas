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

describe("PC creation chat and storyboard layout regression gates", () => {
    test("keeps the new structural layout rules behind the desktop breakpoint", async () => {
        const styles = await read("../src/pages/create/creation-workspace.css");
        const desktopStart = styles.indexOf("@media (min-width: 1024px)");
        expect(desktopStart).toBeGreaterThanOrEqual(0);
        const preDesktopStyles = styles.slice(0, desktopStart);

        for (const selector of [".creation-workspace-toolbar", ".storyboard-workbench-timeline", ".storyboard-workbench-dialogue-pane", ".storyboard-workbench-result-pane"]) {
            expect(preDesktopStyles).not.toContain(selector);
        }
    });

    test("uses one fixed three-slot toolbar for chat and storyboard modes", async () => {
        const [source, styles] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/creation-workspace.css")]);
        const desktopStart = styles.indexOf("@media (min-width: 1024px)");
        expect(desktopStart).toBeGreaterThanOrEqual(0);
        const desktopStyles = styles.slice(desktopStart);
        const toolbar = sourceSection(source, "function CreationWorkspaceToolbar", "function CreationMessageView");

        expect((source.match(/<CreationWorkspaceToolbar/g) || []).length).toBeGreaterThanOrEqual(2);
        expect(toolbar).toContain('className="creation-thread-toolbar creation-workspace-toolbar"');
        expect(toolbar).toContain('className="creation-workspace-toolbar-leading"');
        expect(toolbar).toContain('className="creation-workspace-toolbar-switch"');
        expect(toolbar).toContain('className="storyboard-workbench-bar-actions"');
        expect(toolbar).toContain("<CreationViewSwitch viewMode={viewMode} onChange={onViewModeChange} />");
        expect(source).toContain('role="group" aria-label="\u521b\u4f5c\u89c6\u56fe"');
        expect(source).toContain('aria-pressed={viewMode === "chat"}');
        expect(source).toContain('aria-pressed={viewMode === "storyboard"}');

        expectRuleWith(desktopStyles, ".creation-home .creation-workspace-toolbar", [/display:\s*grid/, /grid-template-columns:\s*minmax\([^;]+,\s*1fr\)\s+(?:auto|\d+px)\s+minmax\([^;]+,\s*1fr\)/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-workspace-toolbar-leading", [/justify-self:\s*start/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-workspace-toolbar-switch", [/justify-self:\s*center/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-workspace-toolbar .storyboard-workbench-bar-actions", [/justify-self:\s*end/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-view-switch", [/(?:inline-size|width):\s*[^;]+/, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/]);

        const activeRules = ruleBodies(desktopStyles, '.creation-home .creation-view-switch button[aria-pressed="true"]');
        expect(activeRules.length).toBeGreaterThan(0);
        expect(activeRules.join(" ")).not.toMatch(/(?:^|;)\s*(?:width|inline-size|height|block-size|padding|margin|inset|transform)\s*:/);
    });

    test("keeps the storyboard timeline in normal flow and gives dialogue and results their own scroll panes", async () => {
        const [source, styles] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/creation-workspace.css")]);
        const desktopStyles = styles.slice(styles.indexOf("@media (min-width: 1024px)"));
        const storyboardRender = sourceSection(source, '<div className="storyboard-workbench">', "<CreationHistoryDrawer");
        const stagePosition = storyboardRender.indexOf('className="storyboard-workbench-stage creation-scrollbar"');
        const timelinePosition = storyboardRender.indexOf("<StoryboardTimeline");
        const composerPosition = storyboardRender.indexOf('className="storyboard-workbench-composer"');

        expect(stagePosition).toBeGreaterThanOrEqual(0);
        expect(timelinePosition).toBeGreaterThan(stagePosition);
        expect(composerPosition).toBeGreaterThan(timelinePosition);
        expect(source).toContain('<section id="storyboard-timeline" className="storyboard-workbench-timeline" aria-label="\u955c\u5934\u65f6\u95f4\u7ebf">');
        expect(source).toContain('className="storyboard-workbench-dialogue-pane creation-scrollbar"');
        expect(source).toContain('className="storyboard-workbench-result-pane creation-scrollbar"');
        expect(source).toContain('role="listbox" aria-label="\u955c\u5934\u5217\u8868"');
        expect(source).toContain('aria-controls="storyboard-timeline"');
        expect(source).toContain('aria-haspopup="listbox"');
        expect(source).toContain('role="option" aria-selected={active}');

        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench", [/display:\s*grid/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench", [/grid-template-rows:[^;]*minmax\(0,\s*1fr\)/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench-stage", [/min-height:\s*0/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench-card-body", [/min-height:\s*0/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench-thread", [/display:\s*grid/, /grid-template-columns:[^;]*minmax\([^;]*\)\s+minmax\(0,/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench-dialogue-pane", [/min-height:\s*0/, /overflow-y:\s*auto/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench-result-pane", [/min-height:\s*0/, /overflow-y:\s*auto/]);
        expectRuleWith(desktopStyles, ".creation-home .storyboard-workbench-timeline-track", [/overflow-x:\s*auto/]);

        const timelineRules = ruleBodies(desktopStyles, ".creation-home .storyboard-workbench-timeline");
        expect(timelineRules.length).toBeGreaterThan(0);
        expect(timelineRules.join(" ")).not.toMatch(/position:\s*(?:absolute|fixed)/);
    });

    test("bounds both composers while long chat content scrolls inside the work area", async () => {
        const styles = await read("../src/pages/create/creation-workspace.css");
        const desktopStyles = styles.slice(styles.indexOf("@media (min-width: 1024px)"));

        expectRuleWith(desktopStyles, ".creation-home .creation-thread-workbench", [/display:\s*grid/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-thread-workbench", [/grid-template-rows:\s*52px\s+minmax\(0,\s*1fr\)\s+auto/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-thread-scroll", [/min-height:\s*0/, /overflow-y:\s*auto/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-chat-composer.is-thread .creation-chat-mention-editor", [/max-height:\s*[^;]+/, /overflow-y:\s*auto/]);

        for (const selector of [".creation-home .creation-thread-composer", ".creation-home .storyboard-workbench-composer"]) {
            const bodies = ruleBodies(desktopStyles, selector);
            expect(bodies.length).toBeGreaterThan(0);
            expect(bodies.join(" ")).not.toMatch(/position:\s*(?:absolute|fixed)/);
        }
    });

    test("renders compact media previews and folds result metadata behind native details", async () => {
        const [source, styles] = await Promise.all([read("../src/pages/create/index.tsx"), read("../src/pages/create/creation-workspace.css")]);
        const desktopStyles = styles.slice(styles.indexOf("@media (min-width: 1024px)"));
        const mediaResult = sourceSection(source, "function MediaResult", "function CreationVideoSupplementalImages");

        expect(mediaResult).toContain("compactLayout: boolean");
        expect(mediaResult).toContain("{compactLayout ? (");
        expect(source).toContain("compactLayout={pcBrandV2}");
        expect(mediaResult).toContain('<details className="creation-media-disclosure">');
        expect(mediaResult).toContain("<summary>");
        expect(mediaResult).toContain('aria-label="\u9884\u89c8\u751f\u6210\u56fe\u7247"');
        expect(mediaResult).toContain('aria-label="\u9884\u89c8\u751f\u6210\u89c6\u9891"');
        expect(mediaResult).toContain("<CreationMediaPreviewModal");
        expect(source).toContain("<video controls autoPlay playsInline");

        expectRuleWith(desktopStyles, ".creation-home .creation-image-result-grid", [/display:\s*grid/, /grid-template-columns:\s*repeat\(/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-image-result", [/aspect-ratio:\s*[^;]+/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-image-result img", [/width:\s*100%/, /height:\s*100%/, /object-fit:\s*cover/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-video-result", [/aspect-ratio:\s*16\s*\/\s*9/, /max-height:\s*[^;]+/, /overflow:\s*hidden/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-video-result video", [/width:\s*100%/, /height:\s*100%/, /object-fit:\s*cover/]);
        expectRuleWith(desktopStyles, ".creation-home .creation-media-disclosure", [/(?:width|max-width):\s*[^;]+/]);
    });

    test("retains preview, download, retry, variant, canvas handoff, and add-shot wiring", async () => {
        const source = await read("../src/pages/create/index.tsx");
        const downloads = sourceSection(source, "function CreationResultDownloads", "function CreationMediaPending");

        expect(source).toContain("creationCanvasHandoffPath(resultAssetIds, resultUrls.length)");
        expect(source).toContain("runBackendGenerationTask(");
        expect(source).toContain("runBackendGenerationTaskBatch(");
        expect(source).toContain("onRetryFailure={() => retryFailedMessage(item, index)}");
        expect(source).toContain("onCreateVariant={() => createVariant(item, index)}");
        expect(source).toContain("onBeginCompose={beginComposeNextShot}");
        expect(source).toContain("<Link to={canvasPath}>");
        expect(source).toContain("<CreationResultDownloads results={resultMedia} />");
        expect(source).toContain('<CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />');
        expect(downloads).toContain("href={entry.url} download");
        expect(downloads).toContain("\u4e0b\u8f7d\u89c6\u9891");
        expect(downloads).toContain("\u4e0b\u8f7d\u56fe\u7247");
        expect(source).toContain("onSubmit: () => void submit()");
    });
});
