import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { GenerationTask } from "@/services/api/task-center";
import { WorkbenchResults, workbenchBillingLabel, workbenchResultMatches } from "../src/pages/workbench/workbench-results";

const task = (status: GenerationTask["status"]): GenerationTask => ({ id: status, type: "image", status, prompt: "月光中的角色", attempts: 1, createdAt: "2026-11-01T01:00:00Z", updatedAt: "2026-11-01T01:00:00Z" });
const actions = { open() {}, async loadDetail() {}, cancel() {}, retry() {}, reuse() {}, download() {} };

test("preview failure retains successful record and never offers paid retry", () => {
    const html = renderToStaticMarkup(
        <MemoryRouter>
            <WorkbenchResults
                tasks={[task("succeeded")]}
                details={{}}
                detailErrors={{ succeeded: "读取中断" }}
                kind="image"
                loading={false}
                error=""
                query=""
                onQueryChange={() => {}}
                onRefresh={() => {}}
                modelLabel={() => "影像模型"}
                busyId=""
                actions={actions}
            />
        </MemoryRouter>,
    );
    expect(html).toContain("读取中断");
    expect(html).toContain("重新加载预览");
    expect(html).not.toContain("重新生成");
    const failed = renderToStaticMarkup(
        <MemoryRouter>
            <WorkbenchResults tasks={[task("failed")]} details={{}} detailErrors={{}} kind="image" loading={false} error="" query="" onQueryChange={() => {}} onRefresh={() => {}} modelLabel={() => "影像模型"} busyId="" actions={actions} />
        </MemoryRouter>,
    );
    expect(failed).toContain("重新生成");
});

test("billing distinguishes zero actual cost, absent settlement, reserved and refunded", () => {
    expect(workbenchBillingLabel({ ...task("succeeded"), billing: { status: "settled", amountMicrocredits: 1000000, actualAmountMicrocredits: 0 } })).toBe("实收 0 积分");
    expect(workbenchBillingLabel({ ...task("succeeded"), billing: { status: "settled", amountMicrocredits: 1000000 } })).toBe("实收待核实");
    expect(workbenchBillingLabel({ ...task("running"), billing: { status: "reserved", amountMicrocredits: 1000000 } })).toBe("冻结 1 积分");
    expect(workbenchBillingLabel({ ...task("failed"), billing: { status: "refunded", amountMicrocredits: 1000000 } })).toBe("已退回");
});

test("prompt search composes with each task state filter", () => {
    expect(workbenchResultMatches(task("running"), "active", "月光")).toBe(true);
    expect(workbenchResultMatches(task("queued"), "active", "不存在")).toBe(false);
    expect(workbenchResultMatches(task("succeeded"), "active", "")).toBe(false);
    expect(workbenchResultMatches(task("cancelled"), "failed", "角色")).toBe(true);
    expect(workbenchResultMatches(task("succeeded"), "done", "角色")).toBe(true);
});
