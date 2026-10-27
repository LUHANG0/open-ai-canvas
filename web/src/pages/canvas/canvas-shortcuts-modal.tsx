import { useEffect, useMemo, useRef, useState } from "react";
import { AppModal } from "@/components/ui/product/app-modal";
import { Command, Search } from "lucide-react";
import { Kbd } from "@/components/ui/base/kbd";
import { useCanvasInputPreferences } from "@/stores/canvas/use-canvas-input-preferences";
import { getCanvasInputPlatform } from "@/lib/canvas/canvas-input-platform";

import {
    CANVAS_SHORTCUT_CATEGORIES,
    getCanvasShortcuts,
    filterCanvasShortcuts,
    type CanvasShortcutCategoryId,
    type CanvasShortcutItem,
} from "@/lib/canvas/canvas-shortcuts";

type ShortcutCategoryFilter = CanvasShortcutCategoryId | "all";

export function CanvasShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<ShortcutCategoryFilter>("all");
    const { preferences, canvasTool, updatePreferences, resetPreferences } = useCanvasInputPreferences();
    const platform = getCanvasInputPlatform();
    const catalog = useMemo(() => getCanvasShortcuts({ platform, preferences }), [platform, preferences]);

    useEffect(() => {
        if (!open) return;
        setQuery("");
        setCategory("all");
    }, [open]);

    const results = useMemo(() => filterCanvasShortcuts(query, category, { platform, preferences }), [category, query, platform, preferences]);
    const categoryCounts = useMemo(
        () => new Map(CANVAS_SHORTCUT_CATEGORIES.map((entry) => [entry.id, catalog.filter((shortcut) => shortcut.category === entry.id).length])),
        [catalog],
    );

    return (
        <AppModal rootClassName="workspace-utility-overlay"
            className="workspace-modal workspace-modal-wide canvas-shortcuts-modal"
            open={open}
            onCancel={onClose}
            footer={null}
            title="操作与快捷键"
            centered
            keyboard
            width="min(860px, calc(100vw - 24px))"
            flush
            afterOpenChange={(visible) => {
                if (visible) window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
        >
            <div className="canvas-shortcuts-shell">
                <header className="canvas-shortcuts-header">
                    <div className="canvas-shortcuts-heading">
                        <span className="canvas-shortcuts-heading-icon" aria-hidden>
                            <Command />
                        </span>
                        <span>
                            <strong>操作与快捷键</strong>
                            <small>{platform === "mac" ? "Mac · ⌘ Command / ⌥ Option" : "Windows / 其他系统 · Ctrl / Alt"}</small>
                        </span>
                    </div>
                    <label className="canvas-shortcuts-search">
                        <Search aria-hidden />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="搜索按键或操作…"
                            aria-label="搜索画布快捷键"
                        />
                        {query ? (
                            <button type="button" onClick={() => setQuery("")} aria-label="清空搜索">
                                清除
                            </button>
                        ) : null}
                    </label>
                </header>

                <div className="canvas-shortcuts-scroll" data-canvas-no-zoom data-canvas-wheel-scroll>
                    <details className="canvas-input-disclosure">
                        <summary><span>操作偏好<small>鼠标、拖动与工具记忆</small></span><span className="canvas-input-disclosure-action">调整设置</span></summary>
                    <section className="canvas-input-settings" aria-label="画布操作偏好">
                        <div className="canvas-input-settings-heading">
                            <div><h2>操作偏好</h2><p id="canvas-input-scope">仅对当前账号与浏览器生效。</p></div>
                            <button type="button" onClick={resetPreferences}>恢复默认</button>
                        </div>
                        <div className="canvas-input-settings-fields">
                            <label>空白处左键拖动
                                <select aria-label="空白处左键拖动" value={preferences.blankDrag} onChange={(event) => updatePreferences({ blankDrag: event.target.value as "box-select" | "pan" })}>
                                    <option value="box-select">框选节点（默认）</option><option value="pan">平移画布</option>
                                </select>
                            </label>
                            <label>鼠标滚轮
                                <select aria-label="鼠标滚轮" value={preferences.mouseWheel} onChange={(event) => updatePreferences({ mouseWheel: event.target.value as "zoom" | "pan" })}>
                                    <option value="zoom">缩放画布（默认）</option><option value="pan">平移画布</option>
                                </select>
                            </label>
                        </div>
                        <p>当前工具：{canvasTool === "move" ? "抓手（平移画布）" : "区域选择（框选节点）"}。工具栏的当前选择优先于默认设置。</p>
                        <label className="canvas-input-remember"><input type="checkbox" checked={preferences.rememberTool} onChange={(event) => updatePreferences({ rememberTool: event.target.checked })} />记住上次工具（抓手 / 区域选择）</label>
                        <p>开启后，下次进入沿用上次工具。滚轮设置按事件步长识别鼠标，部分触控板事件也可能受影响；Ctrl / ⌘ 滚轮及捏合手势始终缩放画布。</p>
                    </section>
                    </details>
                <div className="canvas-shortcuts-body">
                    <nav className="canvas-shortcuts-categories" aria-label="快捷键分类">
                        <CategoryButton label="全部" count={catalog.length} active={category === "all"} onClick={() => setCategory("all")} />
                        {CANVAS_SHORTCUT_CATEGORIES.map((entry) => (
                            <CategoryButton
                                key={entry.id}
                                label={entry.label}
                                count={categoryCounts.get(entry.id) || 0}
                                active={category === entry.id}
                                onClick={() => setCategory(entry.id)}
                            />
                        ))}
                    </nav>

                    <main className="canvas-shortcuts-results" aria-live="polite">
                        {results.length ? (
                            <div className="canvas-shortcuts-list">
                                {CANVAS_SHORTCUT_CATEGORIES.map((group) => {
                                    const items = results.filter((item) => item.category === group.id);
                                    return items.length ? <section className="canvas-shortcuts-group" key={group.id} aria-label={group.label}>
                                        <h2>{group.label}<span>{items.length}</span></h2>
                                        {items.map((shortcut) => <ShortcutRow key={shortcut.id} shortcut={shortcut} showCategory={false} />)}
                                    </section> : null;
                                })}
                            </div>
                        ) : (
                            <div className="canvas-shortcuts-empty">
                                <Search aria-hidden />
                                <strong>没有找到相关操作</strong>
                                <span>试试搜索“粘贴”“缩放”或按键名称</span>
                            </div>
                        )}
                    </main>
                </div>
                </div>

                <footer className="canvas-shortcuts-footer">
                    <span>共 {results.length} 项操作 · 在画布获得焦点时使用键盘快捷键</span>
                    <span className="canvas-shortcuts-close-hint"><Kbd>Esc</Kbd> 关闭</span>
                </footer>
            </div>
        </AppModal>
    );
}

function CategoryButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
    return (
        <button type="button" className={active ? "is-active" : undefined} aria-pressed={active} onClick={onClick}>
            <span>{label}</span>
            <small>{count}</small>
        </button>
    );
}

function ShortcutRow({ shortcut, showCategory }: { shortcut: CanvasShortcutItem; showCategory: boolean }) {
    const categoryLabel = CANVAS_SHORTCUT_CATEGORIES.find((entry) => entry.id === shortcut.category)?.label;

    return (
        <article className="canvas-shortcuts-row">
            <div className="canvas-shortcuts-row-copy">
                <span className="canvas-shortcuts-row-title">
                    <strong>{shortcut.title}</strong>
                    {showCategory ? <small>{categoryLabel}</small> : null}
                </span>
                <p>{shortcut.description}</p>
            </div>
            <div className="canvas-shortcuts-keys" aria-label={shortcut.keys.map((combination) => combination.join(" 加 ")).join(" 或 ")}>
                {shortcut.keys.map((combination, combinationIndex) => (
                    <span key={`${shortcut.id}-${combination.join("-")}`} className="canvas-shortcuts-combination">
                        {combinationIndex ? <em>或</em> : null}
                        {combination.map((key, keyIndex) => (
                            <span key={`${key}-${keyIndex}`} className="canvas-shortcuts-key-part">
                                {keyIndex ? <i>+</i> : null}
                                <Kbd>{key}</Kbd>
                            </span>
                        ))}
                    </span>
                ))}
            </div>
        </article>
    );
}
