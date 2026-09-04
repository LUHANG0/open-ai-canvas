import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error -- Node 原生 TypeScript 测试运行器需要保留扩展名。
import { deriveHomeMode, homePrimaryAction, newCanvasIntent, projectCreateHref, shouldShowProjectControls, shouldShowTaskSection } from "./home-model.ts";

const settledEmpty = {
    projectCount: 0,
    canvasCount: 0,
    assetCount: 0,
    taskCount: 0,
    projectsState: "ready" as const,
    tasksState: "ready" as const,
    localDataState: "ready" as const,
};

test("有 active project 时优先继续该项目", () => {
    assert.equal(deriveHomeMode({ ...settledEmpty, activeProjectId: "project-1", projectCount: 1 }), "project");
    assert.deepEqual(homePrimaryAction("project", "project-1"), { label: "继续制作", to: "/projects/project-1/overview" });
});

test("无项目但已有画布、素材或任务时识别为返回用户", () => {
    assert.equal(deriveHomeMode({ ...settledEmpty, canvasCount: 2 }), "returning");
    assert.equal(deriveHomeMode({ ...settledEmpty, assetCount: 24 }), "returning");
    assert.equal(deriveHomeMode({ ...settledEmpty, taskCount: 15 }), "returning");
    assert.deepEqual(homePrimaryAction("returning"), { label: "继续创作", to: "/create" });
});

test("所有来源明确完成且无活动时才是真正空账号", () => {
    assert.equal(deriveHomeMode(settledEmpty), "empty");
    assert.deepEqual(homePrimaryAction("empty"), { label: "立即创作", to: "/create" });
});

test("项目或任务失败、数据仍在加载时不误判为空账号", () => {
    assert.equal(deriveHomeMode({ ...settledEmpty, projectsState: "error" }), "returning");
    assert.equal(deriveHomeMode({ ...settledEmpty, tasksState: "loading" }), "returning");
    assert.equal(deriveHomeMode({ ...settledEmpty, tasksState: "error" }), "returning");
    assert.equal(deriveHomeMode({ ...settledEmpty, localDataState: "loading" }), "returning");
});

test("shortDrama 与 taskCenter feature gate 控制各自入口", () => {
    assert.equal(shouldShowTaskSection(true), true);
    assert.equal(shouldShowTaskSection(false), false);
    assert.equal(shouldShowProjectControls(0), false);
    assert.equal(shouldShowProjectControls(1), true);
    assert.equal(projectCreateHref(true), "/projects?create=1");
    assert.match(projectCreateHref(false), /^\/login\?next=/);
});

test("新建自由画布保留登录、hydration 与创建动作语义", () => {
    assert.deepEqual(newCanvasIntent({ hydrated: false, userPresent: true }), { kind: "disabled" });
    assert.deepEqual(newCanvasIntent({ hydrated: true, userPresent: false }), { kind: "login", to: "/login?next=%2Fcanvas%3Fmode%3Dnew" });
    assert.deepEqual(newCanvasIntent({ hydrated: true, userPresent: true }), { kind: "create" });
});
