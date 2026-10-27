import { getCanvasInputPlatform, type CanvasInputPlatform } from "./canvas-input-platform";

export type CanvasShortcutOptions = {
    platform?: CanvasInputPlatform;
    preferences?: { blankDrag: "box-select" | "pan"; mouseWheel: "zoom" | "pan" };
};

export type CanvasShortcutCategoryId = "common" | "navigation" | "selection" | "editing";

export type CanvasShortcutCategory = {
    id: CanvasShortcutCategoryId;
    label: string;
    description: string;
};

export type CanvasShortcutItem = {
    id: string;
    category: CanvasShortcutCategoryId;
    title: string;
    description: string;
    keys: string[][];
    keywords?: string[];
};

export const CANVAS_MODIFIER_KEY = "Ctrl / Cmd";

export const CANVAS_SHORTCUT_CATEGORIES: CanvasShortcutCategory[] = [
    { id: "common", label: "常用", description: "搜索、保存与界面" },
    { id: "navigation", label: "视图与导航", description: "平移、缩放与定位" },
    { id: "selection", label: "选择与连接", description: "批量选择和节点连接" },
    { id: "editing", label: "编辑与文件", description: "编辑、撤销与导入" },
];

const BASE_CANVAS_SHORTCUTS: CanvasShortcutItem[] = [
    {
        id: "search",
        category: "common",
        title: "搜索画布节点",
        description: "按名称或内容搜索并定位节点",
        keys: [[CANVAS_MODIFIER_KEY, "F"]],
        keywords: ["查找", "定位", "find", "search"],
    },
    {
        id: "shortcuts",
        category: "common",
        title: "操作与快捷键",
        description: "调整操作偏好，查看键盘、鼠标和触控板操作",
        keys: [["?"]],
        keywords: ["帮助", "说明", "help"],
    },
    {
        id: "save",
        category: "common",
        title: "保存画布",
        description: "保存当前画布布局和节点位置",
        keys: [[CANVAS_MODIFIER_KEY, "S"]],
        keywords: ["存储", "save"],
    },
    {
        id: "focus",
        category: "common",
        title: "进入或退出专注模式",
        description: "隐藏界面干扰，聚焦当前画布",
        keys: [["Shift", CANVAS_MODIFIER_KEY, "F"]],
        keywords: ["沉浸", "全屏", "focus"],
    },
    {
        id: "pan",
        category: "navigation",
        title: "平移视图",
        description: "触控板双指滑动，按住空格键 / 中键拖动，或切到抓手工具后拖动画布",
        keys: [["触控板双指"], ["Space", "左键拖动"], ["中键拖动"]],
        keywords: ["移动", "画布", "触控板", "pan"],
    },
    {
        id: "zoom-wheel",
        category: "navigation",
        title: "缩放画布",
        description: "以鼠标所在位置为中心缩放；选中图片时仍缩放画布，图片尺寸使用边角控制点调整",
        keys: [["滚轮"], [CANVAS_MODIFIER_KEY, "滚轮"], ["触控板捏合"]],
        keywords: ["放大", "缩小", "zoom"],
    },
    {
        id: "zoom-controls",
        category: "navigation",
        title: "精确调整缩放",
        description: "使用画布缩放滑杆调整比例",
        keys: [["缩放滑杆"]],
        keywords: ["比例", "zoom"],
    },
    {
        id: "zoom-steps",
        category: "navigation",
        title: "步进缩放画布",
        description: "按固定步长放大或缩小画布",
        keys: [[CANVAS_MODIFIER_KEY, "+"], [CANVAS_MODIFIER_KEY, "-"]],
        keywords: ["放大", "缩小", "zoom"],
    },
    {
        id: "zoom-presets",
        category: "navigation",
        title: "快速调整视图",
        description: "0/1 恢复 100%，2 适应画布，3 适应选择",
        keys: [[CANVAS_MODIFIER_KEY, "0"], [CANVAS_MODIFIER_KEY, "1"], [CANVAS_MODIFIER_KEY, "2"], [CANVAS_MODIFIER_KEY, "3"]],
        keywords: ["100%", "适应", "居中", "缩放", "fit"],
    },
    {
        id: "box-select",
        category: "selection",
        title: "框选多个节点",
        description: "空白处左键拖动默认框选；Shift 追加、Command/Ctrl 切换、Alt 移除",
        keys: [["空白处左键拖动"], ["Shift", "拖动"], [CANVAS_MODIFIER_KEY, "拖动"], ["Alt", "拖动"]],
        keywords: ["多选", "范围", "selection"],
    },
    {
        id: "box-select-tool",
        category: "selection",
        title: "使用区域选择工具",
        description: "在工具栏切到区域选择后，空白处拖动可连续框选",
        keys: [["区域选择", "拖动"]],
        keywords: ["工具栏", "多选", "selection"],
    },
    {
        id: "add-selection",
        category: "selection",
        title: "追加或切换节点选择",
        description: "Shift 点击追加选择；Command / Ctrl 点击切换节点是否选中",
        keys: [["Shift", "点击"], [CANVAS_MODIFIER_KEY, "点击"]],
        keywords: ["多选", "添加", "切换", "selection"],
    },
    {
        id: "remove-selection",
        category: "selection",
        title: "移除选择节点",
        description: "从当前选择中移除点击或框选的节点",
        keys: [["Alt", "点击 / 框选"]],
        keywords: ["取消", "排除", "selection"],
    },
    {
        id: "select-all",
        category: "selection",
        title: "全选节点",
        description: "选择画布中的全部节点",
        keys: [[CANVAS_MODIFIER_KEY, "A"]],
        keywords: ["全部", "select all"],
    },
    {
        id: "batch-connect",
        category: "selection",
        title: "批量连接节点",
        description: "为两个或更多已选节点进入批量连接模式",
        keys: [["Alt", "L"]],
        keywords: ["连线", "连接", "link"],
    },
    {
        id: "copy",
        category: "editing",
        title: "复制节点",
        description: "复制当前选中的节点",
        keys: [[CANVAS_MODIFIER_KEY, "C"]],
        keywords: ["copy"],
    },
    {
        id: "paste",
        category: "editing",
        title: "粘贴节点或剪贴板内容",
        description: "粘贴已复制节点、文本或图片",
        keys: [[CANVAS_MODIFIER_KEY, "V"]],
        keywords: ["剪贴板", "paste"],
    },
    {
        id: "delete",
        category: "editing",
        title: "删除选中内容",
        description: "删除选中的节点或连线",
        keys: [["Delete"], ["Backspace"]],
        keywords: ["移除", "delete"],
    },
    {
        id: "undo",
        category: "editing",
        title: "撤销",
        description: "撤销上一步画布编辑",
        keys: [[CANVAS_MODIFIER_KEY, "Z"]],
        keywords: ["undo"],
    },
    {
        id: "redo",
        category: "editing",
        title: "重做",
        description: "恢复刚刚撤销的画布编辑",
        keys: [[CANVAS_MODIFIER_KEY, "Shift", "Z"], [CANVAS_MODIFIER_KEY, "Y"]],
        keywords: ["恢复", "redo"],
    },
    {
        id: "escape",
        category: "editing",
        title: "取消当前操作",
        description: "取消选择、关闭浮层或退出专注模式",
        keys: [["Esc"]],
        keywords: ["关闭", "退出", "cancel"],
    },
    {
        id: "import-media",
        category: "editing",
        title: "导入媒体",
        description: "将图片、视频或音频文件拖入画布",
        keys: [["拖入媒体"]],
        keywords: ["上传", "文件", "图片", "视频", "音频", "upload"],
    },
];

export function getCanvasShortcuts({ platform = getCanvasInputPlatform(), preferences }: CanvasShortcutOptions = {}): CanvasShortcutItem[] {
    const modifier = platform === "mac" ? "⌘" : "Ctrl";
    const alt = platform === "mac" ? "⌥" : "Alt";
    const panDefault = preferences?.blankDrag === "pan";
    const wheelPans = preferences?.mouseWheel === "pan";
    return BASE_CANVAS_SHORTCUTS.map((item) => {
        let shortcut = item;
        if (item.id === "pan") shortcut = { ...item, description: `配置的空白拖动默认${panDefault ? "平移" : "框选"}，当前工具栏选择优先；切到抓手工具后可拖动空白处平移。也可按住 Space + 左键拖动或中键拖动。触控板双指滚动通常平移，具体取决于浏览器发送的滚动事件。`, keys: [["Space", "左键拖动"], ["中键拖动"], ["抓手工具", "空白处拖动"], ["触控板双指滚动"]] };
        if (item.id === "zoom-wheel") shortcut = { ...item, title: wheelPans ? "滚轮平移与修饰键缩放" : "滚轮缩放画布", description: `普通鼠标滚轮当前${wheelPans ? "平移" : "缩放"}画布，选中图片时也遵循此偏好；${modifier} + 滚轮缩放。触控板捏合由浏览器发送缩放事件。滚轮不调整图片尺寸，图片尺寸使用边角控制点调整。`, keys: [["鼠标滚轮", wheelPans ? "平移" : "缩放"], [CANVAS_MODIFIER_KEY, "滚轮"], ["触控板捏合"]] };
        if (item.id === "box-select") shortcut = { ...item, description: `配置的空白拖动默认${panDefault ? "平移" : "框选"}，当前工具栏选择优先。区域选择工具可直接框选；在抓手工具下也可按住 Shift / ${modifier} / ${alt} 拖动空白处临时框选：Shift 追加、${modifier} 切换、${alt} 移除。`, keys: [[panDefault ? "区域选择工具" : "空白处左键拖动"], ["Shift", "拖动"], [CANVAS_MODIFIER_KEY, "拖动"], ["Alt", "拖动"]] };
        if (item.id === "add-selection") shortcut = { ...item, description: `Shift 点击追加选择；${modifier} 点击切换节点是否选中。` };
        if (item.id === "delete" && platform === "mac") shortcut = { ...item, description: "按 Mac 键盘 Delete（退格键）删除选中的节点或连线；向前删除键同样可用。", keys: [["Delete"], ["Fn", "Delete"]] };
        return { ...shortcut, keys: shortcut.keys.map((keys) => keys.map((key) => key === CANVAS_MODIFIER_KEY ? modifier : key === "Alt" ? alt : key)), keywords: [...(shortcut.keywords || []), ...(shortcut.keys.flat().includes(CANVAS_MODIFIER_KEY) ? ["Ctrl", "Cmd", "Command", "⌘"] : []), ...(shortcut.keys.flat().includes("Alt") ? ["Alt", "Option", "⌥"] : [])] };
    }).concat({ id: "context-menu", category: "common", title: "打开上下文菜单", description: platform === "mac" ? "右键或 Control + 左键点击画布或节点；触控板可使用系统设置的辅助点按。" : "右键点击画布或节点；触控板可使用系统设置的辅助点按。", keys: platform === "mac" ? [["右键"], ["Control", "左键"]] : [["右键"]], keywords: ["菜单", "鼠标", "触控板", "context menu"] });
}

export const CANVAS_SHORTCUTS = getCanvasShortcuts();

export function filterCanvasShortcuts(query: string, category?: CanvasShortcutCategoryId | "all", options?: CanvasShortcutOptions) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);

    return getCanvasShortcuts(options).filter((shortcut) => {
        if (category && category !== "all" && shortcut.category !== category) return false;
        if (!terms.length) return true;

        const categoryLabel = CANVAS_SHORTCUT_CATEGORIES.find((entry) => entry.id === shortcut.category)?.label || "";
        const searchableText = [shortcut.title, shortcut.description, categoryLabel, shortcut.keys.flat().join(" "), ...(shortcut.keywords || [])]
            .join(" ")
            .toLocaleLowerCase();
        return terms.every((term) => searchableText.includes(term));
    });
}
