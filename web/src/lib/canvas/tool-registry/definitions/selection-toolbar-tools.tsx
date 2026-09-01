import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignHorizontalSpaceAround, AlignHorizontalSpaceBetween, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalSpaceAround, AlignVerticalSpaceBetween, Film, FolderTree, Grid3X3, LayoutTemplate, Link2, LoaderCircle, Workflow } from "lucide-react";

import { registerToolbarTools, type ToolDefinition } from "@/lib/canvas/tool-registry";

export const selectionToolbarTools: ToolDefinition[] = [
    // 对齐组
    { id: "selection-align-left", toolbar: "selection", category: "layout", label: "左对齐", icon: <AlignHorizontalJustifyStart />, defaultVisible: true, defaultOrder: 10, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onAlign("left") },
    { id: "selection-align-center-x", toolbar: "selection", category: "layout", label: "水平居中", icon: <AlignHorizontalJustifyCenter />, defaultVisible: true, defaultOrder: 20, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onAlign("centerX") },
    { id: "selection-align-right", toolbar: "selection", category: "layout", label: "右对齐", icon: <AlignHorizontalJustifyEnd />, defaultVisible: true, defaultOrder: 30, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onAlign("right") },
    { id: "selection-align-top", toolbar: "selection", category: "layout", label: "顶对齐", icon: <AlignVerticalJustifyStart />, defaultVisible: true, defaultOrder: 40, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onAlign("top") },
    { id: "selection-align-center-y", toolbar: "selection", category: "layout", label: "垂直居中", icon: <AlignVerticalJustifyCenter />, defaultVisible: true, defaultOrder: 50, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onAlign("centerY") },
    { id: "selection-align-bottom", toolbar: "selection", category: "layout", label: "底对齐", icon: <AlignVerticalJustifyEnd />, defaultVisible: true, defaultOrder: 60, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onAlign("bottom") },
    { id: "selection-distribute-x", toolbar: "selection", category: "layout", label: "水平等距", icon: <AlignHorizontalSpaceBetween />, defaultVisible: true, defaultOrder: 70, disabled: lacksLayoutTrio, disabledReason: layoutTrioReason, run: (ctx) => ctx.handlers.onAlign("distributeX") },
    { id: "selection-distribute-y", toolbar: "selection", category: "layout", label: "垂直等距", icon: <AlignVerticalSpaceBetween />, defaultVisible: true, defaultOrder: 80, disabled: lacksLayoutTrio, disabledReason: layoutTrioReason, run: (ctx) => ctx.handlers.onAlign("distributeY") },
    // 排列组
    { id: "selection-arrange-row", toolbar: "selection", category: "arrange", label: "横向排列", icon: <AlignHorizontalSpaceAround />, defaultVisible: true, defaultOrder: 90, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onArrange("row") },
    { id: "selection-arrange-column", toolbar: "selection", category: "arrange", label: "纵向排列", icon: <AlignVerticalSpaceAround />, defaultVisible: true, defaultOrder: 100, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onArrange("column") },
    { id: "selection-arrange-grid", toolbar: "selection", category: "arrange", label: "宫格排列", icon: <Grid3X3 />, defaultVisible: true, defaultOrder: 110, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onArrange("grid") },
    { id: "selection-arrange-flow", toolbar: "selection", category: "arrange", label: "按连线整理", icon: <Workflow />, defaultVisible: true, defaultOrder: 120, disabled: lacksLayoutPair, disabledReason: layoutPairReason, run: (ctx) => ctx.handlers.onArrange("flow") },
    // 分组组
    { id: "selection-create-storyboard", toolbar: "selection", category: "selection", label: "创建分镜组", icon: <LayoutTemplate />, defaultVisible: true, defaultOrder: 130, disabled: (ctx) => (ctx.storyboardEligibleCount ?? ctx.selectedCount) < 2, disabledReason: (ctx) => (ctx.storyboardEligibleCount ?? ctx.selectedCount) < 2 ? "至少选择两张未锁定且已有内容的图片" : undefined, run: (ctx) => ctx.handlers.onCreateStoryboard() },
    { id: "selection-create-reference-group", toolbar: "selection", category: "selection", label: "创建引用组", icon: <FolderTree />, defaultVisible: true, defaultOrder: 140, disabled: (ctx) => (ctx.referenceGroupEligibleCount ?? ctx.selectedCount) < 2, disabledReason: (ctx) => (ctx.referenceGroupEligibleCount ?? ctx.selectedCount) < 2 ? "至少选择两个未锁定且已有内容的图片或视频" : undefined, run: (ctx) => ctx.handlers.onCreateReferenceGroup() },
    { id: "selection-batch-connect", toolbar: "selection", category: "selection", label: "批量连接", icon: <Link2 />, defaultVisible: true, defaultOrder: 145, disabled: (ctx) => (ctx.batchConnectEligibleCount ?? ctx.selectedCount) < 2, disabledReason: (ctx) => (ctx.batchConnectEligibleCount ?? ctx.selectedCount) < 2 ? "至少选择两个可作为连接起点的节点" : undefined, run: (ctx) => ctx.handlers.onBatchConnect() },
    {
        id: "selection-merge-videos",
        toolbar: "selection",
        category: "selection",
        label: (ctx) => `合并选中视频（${ctx.selectedVideoCount}）`,
        icon: (ctx) => ctx.mergingVideos ? <LoaderCircle className="animate-spin" /> : <Film />,
        defaultVisible: true,
        defaultOrder: 150,
        applicable: (ctx) => ctx.selectedVideoCount >= 2,
        disabled: (ctx) => ctx.mergingVideos,
        run: (ctx) => ctx.handlers.onMergeVideos(),
    },
];

registerToolbarTools(selectionToolbarTools);

function layoutEligibleCount(ctx: Parameters<NonNullable<ToolDefinition["disabled"]>>[0]) {
    return ctx.layoutEligibleCount ?? ctx.selectedCount;
}

function lacksLayoutPair(ctx: Parameters<NonNullable<ToolDefinition["disabled"]>>[0]) {
    return layoutEligibleCount(ctx) < 2;
}

function lacksLayoutTrio(ctx: Parameters<NonNullable<ToolDefinition["disabled"]>>[0]) {
    return layoutEligibleCount(ctx) < 3;
}

function layoutPairReason(ctx: Parameters<NonNullable<ToolDefinition["disabledReason"]>>[0]) {
    return lacksLayoutPair(ctx) ? "至少选择两个未锁定且非背板的节点" : undefined;
}

function layoutTrioReason(ctx: Parameters<NonNullable<ToolDefinition["disabledReason"]>>[0]) {
    return lacksLayoutTrio(ctx) ? "至少选择三个未锁定且非背板的节点" : undefined;
}
