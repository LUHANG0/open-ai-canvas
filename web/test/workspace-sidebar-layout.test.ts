import { describe, expect, test } from "bun:test";
import { buildWorkspaceNav, workspaceNavActiveId } from "../src/components/layout/workspace-sidebar-nav";
import { defaultFeatureAvailability } from "../src/stores/use-user-store";

describe("workspace navigation availability", () => {
    test("keeps creation destinations first and retains existing disabled-tool gates", () => {
        const groups = buildWorkspaceNav({ ...defaultFeatureAvailability, taskCenterEnabled: false, pluginCenterEnabled: false, imageWorkbenchEnabled: false, videoWorkbenchEnabled: false });
        expect(groups[0].items.map(({ title, to }) => [title, to])).toEqual([["对话创作", "/create"], ["短剧项目", "/projects"], ["创作画布", "/canvas"]]);
        expect(groups.flatMap(({ items }) => items.map(({ to }) => to))).toEqual(["/create", "/projects", "/canvas", "/assets", "/skills"]);
    });

    test("exposes every enabled tool in the intended group without adding privileged destinations", () => {
        const groups = buildWorkspaceNav({ ...defaultFeatureAvailability, taskCenterEnabled: true, pluginCenterEnabled: true, imageWorkbenchEnabled: true, videoWorkbenchEnabled: true });
        expect(groups[1].items.map(({ title }) => title)).toEqual(["素材库", "任务记录"]);
        expect(groups[2].items.map(({ to }) => to)).toEqual(["/toolbox/image", "/toolbox/video", "/skills", "/plugins"]);
        expect(groups.flatMap(({ items }) => items).some(({ to }) => to.startsWith("/admin"))).toBe(false);
    });

    test("keeps a single active destination for detail and tool routes", () => {
        expect(workspaceNavActiveId("/create")).toBe("home");
        expect(workspaceNavActiveId("/projects/example/chapters/one")).toBe("projects");
        expect(workspaceNavActiveId("/canvas/example")).toBe("canvas");
        expect(workspaceNavActiveId("/toolbox/image")).toBe("toolbox-image");
        expect(workspaceNavActiveId("/toolbox/video")).toBe("toolbox-video");
    });
});
