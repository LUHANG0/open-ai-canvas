import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { SystemUpdateStatus } from "../src/services/api/system-update";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, ShadowRoot: dom.ShadowRoot, Element: dom.Element, Node: dom.Node, ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider } = await import("antd");
let readFailed = false;
let checkFailed = false;
let current: SystemUpdateStatus;
let starts = 0;
let rollbacks = 0;
mock.module("../src/services/api/system-update", () => ({
    getSystemUpdateStatus: async () => { if (readFailed) throw new Error("连接中断"); return structuredClone(current); },
    checkSystemUpdate: async () => { if (checkFailed) throw new Error("检查失败"); return structuredClone(current); },
    startSystemUpdate: async () => { starts++; return current; },
    rollbackSystemUpdate: async () => { rollbacks++; return current; },
}));
mock.module("../src/pages/admin/components/admin-shell", () => ({
    AdminPageFrame: ({ title, description, actions, children }: any) => <section><h1>{title}</h1><p>{description}</p>{actions}{children}</section>,
}));
mock.module("../src/pages/admin/components/admin-ui", () => ({
    AdminStatusBadge: ({ label }: any) => <span>{label}</span>,
    SettingsSectionCard: ({ title, description, status, children, footer }: any) => <section><h2>{title}</h2><p>{description}</p>{typeof status?.label === "string" ? <span>{status.label}</span> : status}{children}{footer}</section>,
}));
const { default: SystemUpdatePage } = await import("../src/pages/admin/settings/system-update-page");

afterAll(() => {
    mock.restore();
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

function status(): SystemUpdateStatus {
    return {
        supported: true, connected: true, repository: "LUHANG0/open-ai-canvas", deployment: "custom-compose-host-updater",
        currentVersion: "current", updateAvailable: true, rollbackVersion: "previous",
        components: { web: { image: "web-image", version: "web-current", commit: "63059245f3c157f639b19e9a2191ec110ae978a5" } },
        latestRelease: { version: "candidate", name: "candidate", body: "候选发布说明", url: "", publishedAt: "0001-01-01T00:00:00Z", prerelease: false },
        checks: [{ key: "contract", label: "二改发布合同", blocking: true, status: "passed" }],
        operation: { phase: "ready", automaticRollback: false, logs: [] },
    };
}

async function view(run: (host: HTMLElement) => Promise<void>) {
    readFailed = checkFailed = false; starts = rollbacks = 0; current = status();
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}><App><SystemUpdatePage /></App></ConfigProvider>));
        await run(host);
    } finally { await act(async () => root.unmount()); host.remove(); }
}

function button(host: HTMLElement, text: string) {
    const result = [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text);
    if (!result) throw new Error(`Missing button: ${text}`);
    return result;
}

test("custom update page keeps fork identity, independent component versions and data-preserving rollback copy", async () => {
    await view(async (host) => {
        expect(host.textContent).toContain("LUHANG0/open-ai-canvas");
        expect(host.textContent).toContain("web-current · 63059245f3c1");
        expect(host.textContent).toContain("版本未提供 · 提交未提供");
        expect(host.textContent).toContain("此入口仅回退代码与站点发布，不恢复旧数据库");
        expect(host.textContent).not.toContain("检查 GitHub Release");
        expect(host.textContent).not.toContain("1/1/1");
    });
});

test("failed refresh retains old facts but blocks update and rollback until status is read again", async () => {
    await view(async (host) => {
        expect(button(host, "开始更新").disabled).toBe(false);
        expect(button(host, "回退到上一版本").disabled).toBe(false);
        readFailed = checkFailed = true;
        await act(async () => button(host, "检查更新").click());
        expect(host.textContent).toContain("以下为上次读取的状态");
        expect(host.textContent).toContain("web-current · 63059245f3c1");
        expect(button(host, "开始更新").disabled).toBe(true);
        expect(button(host, "回退到上一版本").disabled).toBe(true);
        expect(button(host, "检查更新").disabled).toBe(true);
        readFailed = false;
        await act(async () => button(host, "重新读取状态").click());
        expect(host.textContent).not.toContain("以下为上次读取的状态");
        expect(button(host, "开始更新").disabled).toBe(false);
        expect(button(host, "回退到上一版本").disabled).toBe(false);
        expect(starts).toBe(0); expect(rollbacks).toBe(0);
    });
});
