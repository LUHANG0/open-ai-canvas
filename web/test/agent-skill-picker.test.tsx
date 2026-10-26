import { setTimeout as delay } from "node:timers/promises";
import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { canvasThemes } from "../src/lib/canvas-theme";
import type { Skill, SkillPreset } from "../src/services/api/skills";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// React DOM and AntD must initialize after browser globals; static imports run before this setup.
const { createRoot } = await import("react-dom/client");
const { AgentSceneCapsules, appendAgentSkillSelection } = await import("../src/components/canvas/canvas-cloud-agent-composer");
const settle = () => delay(100);
const skill = { skillId: "personal", skillName: "个人分镜", description: "依据角色与场景设计分镜。", isOwner: true } as Skill;
const preset: SkillPreset = { presetId: "story", name: "故事搭配", scene: "drama", skillIds: ["installed", "missing", "installed"], rationale: "从故事节拍整理到场景分镜。", source: "", evidence: "", upgrade: "" };
const panel = () => document.querySelector<HTMLElement>(".agent-skill-picker")!;
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const textButton = (text: string) => [...panel().querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text)!;
async function mount(action: () => Promise<boolean | number> = async () => true, initial = ["personal"]) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); const picks: unknown[] = []; let libraries = 0;
    function Fixture() {
        const [open, setOpen] = useState(false); const [ids, setIds] = useState(initial);
        const pick = async (incoming: string[]) => {
            picks.push(incoming);
            const result = await action();
            if (result !== true) return result;
            const next = appendAgentSkillSelection(ids, incoming);
            setIds(next);
            return next.length - ids.length;
        };
        return <AgentSceneCapsules buckets={[{ key: "drama", label: "短剧故事", presets: [preset], skills: [skill] }]} installedIds={new Set(["installed", "personal"])} theme={canvasThemes.dark} open={open} onOpenChange={setOpen} selectedSkillIds={ids} selectedSkills={[skill]} onClear={() => setIds([])} onRemove={(id) => setIds((current) => current.filter((item) => item !== id))} onOpenLibrary={() => libraries++} onPick={(value) => pick(value.skillIds)} onPickSkill={(value) => pick([value.skillId])} />;
    }
    await act(async () => root.render(<Fixture />));
    const trigger = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => { trigger.click(); await settle(); });
    return { picks, trigger, libraries: () => libraries, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test("append preserves prior selection and order, dedupes incoming bindings, and leaves inputs untouched", () => {
    const current = ["personal", "installed"];
    const incoming = ["installed", "missing", "missing"];
    expect(appendAgentSkillSelection(current, incoming)).toEqual(["personal", "installed", "missing"]);
    expect(appendAgentSkillSelection(current, ["installed"])).toEqual(current);
    expect(current).toEqual(["personal", "installed"]);
    expect(incoming).toEqual(["installed", "missing", "missing"]);
});
test("remove and clear only session selection, recommendations and library stay reachable; Escape restores focus", async () => {
    const f = await mount(undefined, ["personal", "installed"]);
    try {
        await act(async () => button("移除个人分镜").click());
        expect(f.trigger.textContent).toContain("已选 1");
        await act(async () => textButton("清空选择").click());
        expect(f.trigger.textContent).toBe("创作技能");
        expect(button("选用组合：故事搭配").disabled).toBe(false);
        expect(f.picks).toEqual([]);
        await act(async () => { panel().dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await settle(); });
        expect(f.trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(f.trigger);
        await act(async () => { f.trigger.click(); await settle(); textButton("更多技能，打开技能库").click(); });
        expect(f.libraries()).toBe(1);
    } finally { await f.close(); }
});
test("preset waits, appends unique bindings, reports actual additions and disables fully selected preset", async () => {
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const f = await mount(() => promise, ["personal", "installed"]);
    try {
        expect(panel().querySelector(".agent-skill-picker-disclosure")).not.toBeNull();
        await act(async () => button("选用组合：故事搭配").click());
        expect(button("选用组合：故事搭配").disabled).toBe(true);
        expect(button("移除个人分镜").disabled).toBe(true);
        expect(f.trigger.textContent).toContain("已选 2");
        await act(async () => resolve(true));
        expect(f.trigger.textContent).toContain("已选 3");
        expect(button("移除个人分镜")).not.toBeNull();
        expect(panel().querySelector('[role="status"]')?.textContent).toBe("已加入 1 项技能");
        expect(button("选用组合：故事搭配").disabled).toBe(true);
        await act(async () => button("选用组合：故事搭配").click());
        expect(f.picks).toHaveLength(1);
    } finally { await f.close(); }
});
test("error, busy and zero additions never claim success; retry can add a single skill", async () => {
    let attempt = 0;
    const f = await mount(async () => { attempt++; if (attempt === 1) throw new Error("安装失败"); return attempt === 2 ? false : attempt === 3 ? 0 : true; }, []);
    try {
        await act(async () => button("加入本次：个人分镜").click());
        expect(panel().querySelector('[role="alert"]')?.textContent).toContain("安装失败");
        await act(async () => button("加入本次：个人分镜").click());
        expect(panel().querySelector('[role="alert"]')?.textContent).toContain("暂不能更改");
        await act(async () => button("加入本次：个人分镜").click());
        expect(panel().querySelector('[role="status"]')?.textContent).not.toContain("已加入");
        expect(f.trigger.textContent).toBe("创作技能");
        await act(async () => button("加入本次：个人分镜").click());
        expect(f.trigger.textContent).toContain("已选 1");
        expect(button("加入本次：个人分镜").disabled).toBe(true);
    } finally { await f.close(); }
});
afterAll(async () => { await dom.happyDOM.abort(); for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); });
