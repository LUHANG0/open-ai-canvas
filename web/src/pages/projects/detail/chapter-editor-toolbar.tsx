import type { ReactNode } from "react";
import { Dropdown, Tooltip } from "antd";
import type { Editor } from "@tiptap/react";
import {
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Bold,
    ChevronDown,
    Code2,
    Eraser,
    Highlighter,
    Italic,
    Link2,
    List,
    ListOrdered,
    Minus,
    MoreHorizontal,
    Quote,
    Redo2,
    Strikethrough,
    Underline,
    Undo2,
} from "lucide-react";

export function ChapterEditorToolbar({ editor }: { editor: Editor | null }) {
    const setLink = () => {
        if (!editor) return;
        const current = String(editor.getAttributes("link").href || "");
        const href = window.prompt("输入链接地址", current);
        if (href === null) return;
        if (!href.trim()) editor.chain().focus().unsetLink().run();
        else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
    };
    const setColor = () => {
        const color = window.prompt("输入文字颜色，例如 #d97706", String(editor?.getAttributes("textStyle").color || "#d97706"));
        if (color?.trim()) editor?.chain().focus().setColor(color.trim()).run();
    };
    const setHighlight = () => {
        const color = window.prompt("输入高亮颜色，例如 #fef3c7", String(editor?.getAttributes("highlight").color || "#fef3c7"));
        if (color?.trim()) editor?.chain().focus().toggleHighlight({ color: color.trim() }).run();
    };
    const blockLabel = editor?.isActive("heading", { level: 1 }) ? "标题 1" : editor?.isActive("heading", { level: 2 }) ? "标题 2" : editor?.isActive("heading", { level: 3 }) ? "标题 3" : "正文";
    const alignment = editor?.isActive({ textAlign: "center" }) ? "center" : editor?.isActive({ textAlign: "right" }) ? "right" : editor?.isActive({ textAlign: "justify" }) ? "justify" : "left";
    const alignmentIcon = alignment === "center" ? <AlignCenter className="size-3.5" /> : alignment === "right" ? <AlignRight className="size-3.5" /> : alignment === "justify" ? <AlignJustify className="size-3.5" /> : <AlignLeft className="size-3.5" />;
    return (
        <div className="hide-scrollbar flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/70 px-2">
            <EditorTool editor={editor} label="撤销" icon={<Undo2 className="size-3.5" />} onClick={() => editor?.chain().focus().undo().run()} />
            <EditorTool editor={editor} label="重做" icon={<Redo2 className="size-3.5" />} onClick={() => editor?.chain().focus().redo().run()} />
            <ToolbarDivider />
            <Dropdown trigger={["click"]} menu={{ selectedKeys: [blockLabel], items: ["正文", "标题 1", "标题 2", "标题 3"].map((key) => ({ key, label: key })), onClick: ({ key }) => key === "正文" ? editor?.chain().focus().setParagraph().run() : editor?.chain().focus().toggleHeading({ level: Number(key.slice(-1)) as 1 | 2 | 3 }).run() }}>
                <button type="button" className="flex h-7 items-center gap-1 rounded px-2 text-xs text-foreground/60 hover:bg-surface-hover" aria-label="段落格式">{blockLabel}<ChevronDown className="size-3" /></button>
            </Dropdown>
            <EditorTool editor={editor} label="粗体" icon={<Bold className="size-3.5" />} onClick={() => editor?.chain().focus().toggleBold().run()} active={Boolean(editor?.isActive("bold"))} />
            <EditorTool editor={editor} label="斜体" icon={<Italic className="size-3.5" />} onClick={() => editor?.chain().focus().toggleItalic().run()} active={Boolean(editor?.isActive("italic"))} />
            <EditorTool editor={editor} label="下划线" icon={<Underline className="size-3.5" />} onClick={() => editor?.chain().focus().toggleUnderline().run()} active={Boolean(editor?.isActive("underline"))} />
            <EditorTool editor={editor} label="删除线" icon={<Strikethrough className="size-3.5" />} onClick={() => editor?.chain().focus().toggleStrike().run()} active={Boolean(editor?.isActive("strike"))} />
            <ToolbarDivider />
            <Dropdown trigger={["click"]} menu={{ selectedKeys: [alignment], items: [{ key: "left", icon: <AlignLeft className="size-3.5" />, label: "左对齐" }, { key: "center", icon: <AlignCenter className="size-3.5" />, label: "居中" }, { key: "right", icon: <AlignRight className="size-3.5" />, label: "右对齐" }, { key: "justify", icon: <AlignJustify className="size-3.5" />, label: "两端对齐" }], onClick: ({ key }) => editor?.chain().focus().setTextAlign(key).run() }}>
                <button type="button" className="grid size-7 place-items-center rounded text-foreground/60 hover:bg-surface-hover" aria-label="文字对齐">{alignmentIcon}</button>
            </Dropdown>
            <EditorTool editor={editor} label="项目符号" icon={<List className="size-3.5" />} onClick={() => editor?.chain().focus().toggleBulletList().run()} active={Boolean(editor?.isActive("bulletList"))} />
            <EditorTool editor={editor} label="编号列表" icon={<ListOrdered className="size-3.5" />} onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={Boolean(editor?.isActive("orderedList"))} />
            <EditorTool editor={editor} label="引用" icon={<Quote className="size-3.5" />} onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={Boolean(editor?.isActive("blockquote"))} />
            <EditorTool editor={editor} label="链接" icon={<Link2 className="size-3.5" />} onClick={setLink} active={Boolean(editor?.isActive("link"))} />
            <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: [{ key: "color", icon: <span className="text-[var(--fs-label)] font-bold text-amber-600">A</span>, label: "文字颜色" }, { key: "highlight", icon: <Highlighter className="size-3.5" />, label: "高亮颜色" }, { type: "divider" }, { key: "code", icon: <Code2 className="size-3.5" />, label: "行内代码" }, { key: "rule", icon: <Minus className="size-3.5" />, label: "分隔线" }, { key: "clear", icon: <Eraser className="size-3.5" />, label: "清除格式" }], onClick: ({ key }) => { if (key === "color") setColor(); else if (key === "highlight") setHighlight(); else if (key === "code") editor?.chain().focus().toggleCode().run(); else if (key === "rule") editor?.chain().focus().setHorizontalRule().run(); else if (key === "clear") editor?.chain().focus().clearNodes().unsetAllMarks().run(); } }}>
                <button type="button" className="grid size-7 place-items-center rounded text-foreground/60 hover:bg-surface-hover" aria-label="更多格式"><MoreHorizontal className="size-4" /></button>
            </Dropdown>
        </div>
    );
}

function EditorTool({ editor, label, icon, active = false, onClick }: { editor: Editor | null; label: string; icon: ReactNode; active?: boolean; onClick: () => void }) {
    return <Tooltip title={label}><button type="button" aria-label={label} className={`grid size-7 shrink-0 place-items-center rounded ${active ? "bg-surface-active text-[var(--workspace-accent)]" : "text-foreground/55 hover:bg-surface-hover hover:text-foreground"}`} disabled={!editor} onClick={onClick}>{icon}</button></Tooltip>;
}

function ToolbarDivider() {
    return <span className="mx-1 h-4 w-px shrink-0 bg-border" />;
}
