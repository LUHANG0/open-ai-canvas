import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, Form, Input, Modal } from "antd";
import { BookOpenText, CheckCircle2, FileText, FileUp, ScanText } from "lucide-react";

import { DialogFrame } from "@/components/ui/pc";
import { decodeNovelText, splitTextIntoChapters } from "@/lib/canvas/canvas-document";

import { formatCount } from "./shared";

const MAX_NOVEL_IMPORT_CHAPTERS = 2500;

export function CreateChapterDialog({ open, onClose, loading, onSubmit }: { open: boolean; onClose: () => void; loading: boolean; onSubmit: (values: { title: string; sourceText?: string }) => void }) {
    return (
        <DialogFrame className="pc-project-dialog sd-content-dialog" title="新建章节" subtitle="先建立内容单元，随后可继续编辑正文、拆分资产和生成分镜。" open={open} footer={null} destroyOnHidden onCancel={onClose} frameSize="sm">
            <Form layout="vertical" onFinish={onSubmit}>
                <Form.Item name="title" label="章节标题" rules={[{ required: true, whitespace: true, message: "请输入章节标题" }]}>
                    <Input autoFocus placeholder="例如：雨夜归城" />
                </Form.Item>
                <Form.Item name="sourceText" label="正文（可选）" extra="不填也可以创建，稍后在章节编辑器中补充。">
                    <Input.TextArea rows={5} placeholder="输入本章小说或剧本正文……" />
                </Form.Item>
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" htmlType="submit" loading={loading}>
                        创建章节
                    </Button>
                </div>
            </Form>
        </DialogFrame>
    );
}

export function ImportNovelDialog({ open, loading, onClose, onImport }: { open: boolean; loading: boolean; onClose: () => void; onImport: (chapters: Array<{ title: string; plainText: string }>) => void }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [fileName, setFileName] = useState("");
    const deferredText = useDeferredValue(text);
    const chapters = useMemo(() => (deferredText.trim() ? splitTextIntoChapters(deferredText).map((chapter) => ({ title: chapter.title, plainText: chapter.plainText })) : []), [deferredText]);
    useEffect(() => {
        if (!open) {
            setText("");
            setFileName("");
        }
    }, [open]);
    const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setFileName(file.name);
        setText(decodeNovelText(await file.arrayBuffer()));
    };
    return (
        <Modal
            rootClassName="pc-projects-import-dialog-root sd-content-import-root"
            className="pc-projects-import-dialog sd-content-import-dialog"
            title={null}
            open={open}
            footer={null}
            destroyOnHidden
            onCancel={onClose}
            width={920}
            styles={{ container: { padding: 0, overflow: "hidden" }, body: { padding: 0 } }}
        >
            <div className="sd-content-import-shell flex min-h-[560px] flex-col">
                <header className="sd-content-import-header flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
                    <span className="sd-content-dialog-icon">
                        <BookOpenText className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <div className="sd-content-eyebrow">批量建立章节</div>
                        <h2 className="mt-1 text-base font-semibold">导入小说 / 章回式剧本</h2>
                        <p className="mt-1 text-[var(--fs-label)] text-foreground/46">自动识别章节标题，预览确认后追加到当前项目，不会覆盖已有内容。</p>
                    </div>
                </header>
                <div className="grid min-h-[478px] flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="sd-content-import-source border-b border-border p-4 md:border-b-0 md:border-r">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <FileText className="size-4 text-foreground/42" />
                                    原始文稿
                                </div>
                                <div className="mt-1 text-[var(--fs-label)] text-foreground/45">选择文件，或直接粘贴完整文稿</div>
                            </div>
                            <Button icon={<FileUp className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                {fileName || "选择 TXT / MD"}
                            </Button>
                        </div>
                        <input ref={fileInputRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(event) => void readFile(event)} />
                        <Input.TextArea
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            rows={17}
                            placeholder={"也可以直接粘贴小说或章回式剧本，例如：\n\n第一章 雨夜来信\n正文……\n\n第二章 灯塔以北\n正文……"}
                            className="sd-content-import-textarea !resize-none"
                        />
                        <div className="sd-content-import-rules mt-3 grid grid-cols-2 gap-2">
                            <span>
                                <ScanText className="size-3.5" />
                                识别“第一章 / 序章 / Chapter 1”等标题
                            </span>
                            <span>
                                <CheckCircle2 className="size-3.5" />
                                导入前可核对章数与字数
                            </span>
                        </div>
                    </div>
                    <div className="sd-content-import-preview flex min-h-0 flex-col">
                        <div className="flex min-h-14 shrink-0 items-center justify-between border-b border-border px-4 py-3 text-xs">
                            <div>
                                <span className="font-medium">拆分预览</span>
                                <p className="mt-1 text-[var(--fs-tiny)] text-foreground/40">按识别顺序追加</p>
                            </div>
                            <span className="sd-content-count-badge tabular-nums">{chapters.length} 章</span>
                        </div>
                        <ImportChapterPreview chapters={chapters} />
                        <div className="sd-content-import-footer shrink-0 border-t border-border p-4">
                            <p className={`mb-3 text-[var(--fs-tiny)] ${chapters.length > MAX_NOVEL_IMPORT_CHAPTERS ? "text-red-500" : "text-foreground/40"}`}>
                                {chapters.length > MAX_NOVEL_IMPORT_CHAPTERS ? `超出上限：最多一次导入 ${MAX_NOVEL_IMPORT_CHAPTERS.toLocaleString("zh-CN")} 章` : `单次最多 ${MAX_NOVEL_IMPORT_CHAPTERS.toLocaleString("zh-CN")} 章；已有章节不受影响。`}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <Button onClick={onClose}>取消</Button>
                                <Button type="primary" disabled={!chapters.length || chapters.length > MAX_NOVEL_IMPORT_CHAPTERS} loading={loading} onClick={() => onImport(chapters)}>
                                    确认导入{chapters.length ? ` ${chapters.length} 章` : ""}
                                </Button>
                            </div>
                        </div>
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
        <div ref={scrollRef} className="sd-content-import-list thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {chapters.length ? (
                <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                        const chapter = chapters[virtualItem.index];
                        return (
                            <div
                                key={`${chapter.title}-${virtualItem.index}`}
                                className="sd-content-import-row absolute left-0 top-0 flex w-full gap-2 rounded-md px-2 py-2"
                                style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start}px)` }}
                            >
                                <span className="w-8 shrink-0 pt-0.5 text-[var(--fs-tiny)] tabular-nums text-foreground/35">{String(virtualItem.index + 1).padStart(Math.max(2, String(chapters.length).length), "0")}</span>
                                <div className="min-w-0">
                                    <div className="truncate text-xs font-medium">{chapter.title}</div>
                                    <div className="mt-0.5 text-[var(--fs-tiny)] text-foreground/40">{formatCount(chapter.plainText.length)} 字</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="grid h-full place-items-center px-4 text-center text-xs leading-5 text-foreground/40">选择 TXT 文件或粘贴正文后，这里会显示拆分结果</div>
            )}
        </div>
    );
}

export function plainTextToHtml(value: string) {
    const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
        .join("");
}
