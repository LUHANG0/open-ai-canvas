import { describe, expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("PC 短剧内容与资产 UI", () => {
    test("章节工作台保留原有写路径与任务恢复", async () => {
        const source = await read("../src/pages/projects/detail/chapters.tsx");

        for (const contract of ["createProjectUnit", "importProjectUnits", "updateProjectUnit", "deleteProjectUnit", "reorderProjectUnits", "listGenerationTasks", "queryGenerationTask", "loadProjectEditorDraft", "saveProjectEditorDraft"]) {
            expect(source).toContain(contract);
        }
        expect(source).toContain("sd-content-chapters");
        expect(source).toContain("导入文稿");
        expect(source).toContain("本机草稿仅用于恢复");
    });

    test("资产页保留候选确认、目录、版本与下载合同", async () => {
        const source = await read("../src/pages/projects/detail/assets.tsx");

        for (const contract of [
            "listProjectAssetsPage",
            "listProjectAssetCandidates",
            "confirmProjectAssetCandidate",
            "createProjectAssetFolder",
            "updateProjectAssetFolder",
            "createProjectAssetVersion",
            "linkProjectAsset",
            "unlinkProjectAsset",
            "saveAs",
        ]) {
            expect(source).toContain(contract);
        }
        expect(source).toContain("sd-content-asset-pipeline");
        expect(source).toContain("sd-content-candidate-section");
        expect(source).toContain("AssetGridSkeleton");
    });

    test("域内样式跨屏共用，不依赖 Admin 私有类和 token", async () => {
        const css = await read("../src/pages/projects/detail/short-drama-content.css");

        expect(css).toContain("@media (max-width: 1023px)");
        expect(css).toContain("@media (prefers-reduced-motion: reduce)");
        expect(css).not.toContain(".admin-");
        expect(css).not.toContain("--admin-");
    });
});
