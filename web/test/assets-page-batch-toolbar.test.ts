import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("assets page batch toolbar", () => {
    test("places select all before cancel selection", () => {
        const source = readFileSync(resolve(import.meta.dir, "../src/pages/assets/index.tsx"), "utf8").replace(/\s+/g, " ");
        const selectionBarSource = readFileSync(resolve(import.meta.dir, "../src/components/ui/pc/data-display.tsx"), "utf8").replace(/\s+/g, " ");
        const actionsIndex = selectionBarSource.indexOf("{actions}");
        const clearSelectionIndex = selectionBarSource.indexOf("{clearLabel}");

        expect(source).toContain("全选 </Button>");
        expect(source).toContain('clearLabel="取消选择"');
        expect(actionsIndex).toBeGreaterThanOrEqual(0);
        expect(clearSelectionIndex).toBeGreaterThanOrEqual(0);
        expect(actionsIndex).toBeLessThan(clearSelectionIndex);
    });
});
