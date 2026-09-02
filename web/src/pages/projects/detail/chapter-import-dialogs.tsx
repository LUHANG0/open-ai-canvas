import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, Form, Input, Modal } from "antd";
import { FileUp } from "lucide-react";

import { DialogFrame } from "@/components/ui/pc";
import { decodeNovelText, splitTextIntoChapters } from "@/lib/canvas/canvas-document";

import { formatCount } from "./shared";

const MAX_NOVEL_IMPORT_CHAPTERS = 2500;

export function CreateChapterDialog({ open, onClose, loading, onSubmit }: { open: boolean; onClose: () => void; loading: boolean; onSubmit: (values: { title: string; sourceText?: string }) => void }) {
    return <DialogFrame className="pc-project-dialog" title="添加章节" subtitle="创建后可继续编辑正文、角色和分镜。" open={open} footer={null} destroyOnHidden onCancel={onClose} frameSize="sm"><Form layout="vertical" onFinish={onSubmit}><Form.Item name="title" label="章节标题" rules={[{ required: true, whitespace: true, message: "请输入章节标题" }]}><Input autoFocus placeholder="例如：雨夜归城" /></Form.Item><Form.Item name="sourceText" label="正文（可选）"><Input.TextArea rows={4} placeholder="创建后仍可继续编辑和排版" /></Form.Item><div className="flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button type="primary" htmlType="submit" loading={loading}>创建章节</Button></div></Form></DialogFrame>;
}

export function ImportNovelDialog({ open, loading, onClose, onImport }: { open: boolean; loading: boolean; onClose: () => void; onImport: (chapters: Array<{ title: string; plainText: string }>) => void }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [fileName, setFileName] = useState("");
    const deferredText = useDeferredValue(text);
    const chapters = useMemo(() => deferredText.trim() ? splitTextIntoChapters(deferredText).map((chapter) => ({ title: chapter.title, plainText: chapter.plainText })) : [], [deferredText]);
    useEffect(() => { if (!open) { setText(""); setFileName(""); } }, [open]);
    const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setFileName(file.name);
        setText(decodeNovelText(await file.arrayBuffer()));
    };
    return (
        <Modal rootClassName="pc-projects-import-dialog-root" className="pc-projects-import-dialog" title={null} open={open} footer={null} destroyOnHidden onCancel={onClose} width={760} styles={{ container: { padding: 0, overflow: "hidden" }, body: { padding: 0 } }}>
            <div className="flex min-h-[478px] flex-col">
                <header className="flex h-12 shrink-0 items-center border-b border-border px-4"><div><h2 className="text-sm font-semibold">导入小说</h2><p className="mt-0.5 text-[var(--fs-tiny)] text-foreground/42">自动识别章节标题，确认后追加到当前项目</p></div></header>
                <div className="grid min-h-[430px] flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="border-b border-border p-3 md:border-b-0 md:border-r">
                    <div className="mb-2 flex items-center justify-between gap-2"><div><div className="text-sm font-medium">小说正文</div><div className="mt-0.5 text-[var(--fs-label)] text-foreground/45">识别章节标题后追加到现有章节</div></div><Button size="small" icon={<FileUp className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>{fileName || "选择 TXT"}</Button></div>
                    <input ref={fileInputRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(event) => void readFile(event)} />
                    <Input.TextArea value={text} onChange={(event) => setText(event.target.value)} rows={16} placeholder={'也可以直接粘贴小说正文，例如：\n\n第一章 雨夜来信\n正文……\n\n第二章 灯塔以北\n正文……'} className="!resize-none" />
                </div>
                <div className="flex min-h-0 flex-col">
                    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3 text-xs"><span className="font-medium">拆分预览</span><span className="tabular-nums text-foreground/45">{chapters.length} 章</span></div>
                    <ImportChapterPreview chapters={chapters} />
                    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-3"><span className={`text-[var(--fs-tiny)] ${chapters.length > MAX_NOVEL_IMPORT_CHAPTERS ? "text-red-500" : "text-foreground/38"}`}>{chapters.length > MAX_NOVEL_IMPORT_CHAPTERS ? `最多一次导入 ${MAX_NOVEL_IMPORT_CHAPTERS.toLocaleString("zh-CN")} 章` : `支持最多 ${MAX_NOVEL_IMPORT_CHAPTERS.toLocaleString("zh-CN")} 章`}</span><div className="flex gap-2"><Button size="small" onClick={onClose}>取消</Button><Button size="small" type="primary" disabled={!chapters.length || chapters.length > MAX_NOVEL_IMPORT_CHAPTERS} loading={loading} onClick={() => onImport(chapters)}>导入 {chapters.length || ""} 章</Button></div></div>
                </div>
                </div>
            </div>
        </Modal>
    );
}

function ImportChapterPreview({ chapters }: { chapters: Array<{ title: string; plainText: string }> }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: chapters.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 49,
        overscan: 10,
    });
    return (
        <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {chapters.length ? <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const chapter = chapters[virtualItem.index];
                    return <div key={`${chapter.title}-${virtualItem.index}`} className="absolute left-0 top-0 flex w-full gap-2 border-b border-border/60 px-1.5 py-2" style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start}px)` }}><span className="w-8 shrink-0 pt-0.5 text-[var(--fs-tiny)] tabular-nums text-foreground/35">{String(virtualItem.index + 1).padStart(Math.max(2, String(chapters.length).length), "0")}</span><div className="min-w-0"><div className="truncate text-xs font-medium">{chapter.title}</div><div className="mt-0.5 text-[var(--fs-tiny)] text-foreground/40">{formatCount(chapter.plainText.length)} 字</div></div></div>;
                })}
            </div> : <div className="grid h-full place-items-center px-4 text-center text-xs leading-5 text-foreground/40">选择 TXT 文件或粘贴正文后，这里会显示拆分结果</div>}
        </div>
    );
}

export function plainTextToHtml(value: string) {
    const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.split(/\n{2,}/).map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`).join("");
}
