import { expect, test } from "bun:test";
import { planWorkbenchReferences, prepareWorkbenchReferences } from "../src/pages/workbench/workbench-reference-policy";

test("a slot cannot bypass the model-wide media limit", () => {
    const slot = { key: "images", name: "参考图", mediaTypes: ["image" as const], maxCount: 8, minCount: 0, required: false };
    expect(() => planWorkbenchReferences([{ resourceId: "first", kind: "image", slotKey: "images" }], [{ resourceId: "second", kind: "image" }], [slot], { image: 1, video: 0, audio: 0 }, "images")).toThrow("上限");
});

test("a missing restored reference rejects the complete selection without mutating current input", async () => {
    const current = [{ resourceId: "current", kind: "image" as const, previewUrl: "blob:current" }];
    const before = JSON.stringify(current);
    let commits = 0;
    await expect(
        (async () => {
            const result = await prepareWorkbenchReferences(
                [
                    { resourceId: "ready", kind: "image" as const },
                    { resourceId: "missing", kind: "image" as const },
                ],
                async (reference) => (reference.resourceId === "ready" ? "/ready" : undefined),
                () => true,
            );
            commits++;
            current.splice(0, current.length, ...result);
        })(),
    ).rejects.toThrow("当前创作输入已保留");
    expect(commits).toBe(0);
    expect(JSON.stringify(current)).toBe(before);
});

test("edits or an account switch during restoration reject late references", async () => {
    let active = true;
    let finish!: (url: string) => void;
    const result = prepareWorkbenchReferences(
        [{ resourceId: "old", kind: "video" as const }],
        () =>
            new Promise<string>((resolve) => {
                finish = resolve;
            }),
        () => active,
    );
    active = false;
    finish("/old-account.mp4");
    await expect(result).rejects.toThrow("创作输入或账号已变化");
    let calls = 0;
    await expect(
        prepareWorkbenchReferences(
            [{ resourceId: "old", kind: "video" as const }],
            async () => {
                calls++;
                return "/old";
            },
            () => false,
        ),
    ).rejects.toThrow();
    expect(calls).toBe(0);
});

test("successful restoration preserves resource identities, roles and slot order", async () => {
    const references = [
        { resourceId: "last", kind: "image" as const, role: "last_frame", slotKey: "end" },
        { resourceId: "first", kind: "image" as const, role: "first_frame", slotKey: "start" },
    ];
    const result = await prepareWorkbenchReferences(
        references,
        async (reference) => `/preview/${reference.resourceId}`,
        () => true,
    );
    expect(result).toEqual(references.map((reference) => ({ ...reference, previewUrl: `/preview/${reference.resourceId}` })));
    expect(references[0]).not.toHaveProperty("previewUrl");
});
