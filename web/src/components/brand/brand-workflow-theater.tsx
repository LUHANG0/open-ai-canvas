import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { BrandCanvasDemo } from "./brand-canvas-demo";
import { BrandLink } from "./brand-link";
import { WORKFLOW_SCENES } from "./brand-workflow-scenes";
import { BrandMotionMedia as MotionMedia } from "./brand-motion-media";
import "./brand-workflow-theater.css";

export const WORKFLOW_AUTOPLAY_MS = 10_000;

export function BrandWorkflowTheater({ preview = false, creationLink }: { preview?: boolean; creationLink: string }) {
    const root = useRef<HTMLDivElement>(null);
    const categories = useRef<HTMLDivElement>(null);
    const mouseWithinCategories = useRef(false);
    const [selected, setSelected] = useState(0);
    const [visible, setVisible] = useState(false);
    const [pageVisible, setPageVisible] = useState(true);
    const [intent, setIntent] = useState<boolean | null>(null);
    const [reduced, setReduced] = useState(true);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [pointerActive, setPointerActive] = useState(false);
    const [selectionEpoch, setSelectionEpoch] = useState(0);
    const pointerFocus = useRef(false);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearHover = () => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; } };
    useEffect(() => {
        const element = categories.current;
        if (!element) return;
        const reveal = () => {
            if (mouseWithinCategories.current) return;
            const button = element.querySelectorAll<HTMLButtonElement>("button")[selected];
            if (button && (button.offsetLeft < element.scrollLeft || button.offsetLeft + button.offsetWidth > element.scrollLeft + element.clientWidth)) element.scrollTo({ left: Math.max(0, button.offsetLeft + button.offsetWidth / 2 - element.clientWidth / 2), behavior: reduced ? "auto" : "smooth" });
        };
        reveal();
        const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(reveal);
        observer?.observe(element);
        return () => observer?.disconnect();
    }, [selected, reduced]);
    useEffect(() => {
        const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(media?.matches ?? true);
        const page = () => setPageVisible(!document.hidden);
        update(); page(); media?.addEventListener("change", update);
        document.addEventListener("visibilitychange", page);
        return () => { media?.removeEventListener("change", update); document.removeEventListener("visibilitychange", page); };
    }, []);
    useEffect(() => {
        if (preview || !root.current || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .15 });
        observer.observe(root.current);
        return () => observer.disconnect();
    }, [preview]);
    const scene = WORKFLOW_SCENES[selected];
    const playing = !preview && visible && pageVisible && (intent ?? !reduced);
    const cycling = playing && !reduced && !hovered && !focused && !pointerActive;
    useEffect(() => {
        if (!cycling) return;
        const timer = window.setTimeout(() => setSelected((index) => (index + 1) % WORKFLOW_SCENES.length), WORKFLOW_AUTOPLAY_MS);
        return () => window.clearTimeout(timer);
    }, [cycling, selected, selectionEpoch]);
    useEffect(() => {
        const release = () => setPointerActive(false);
        const keyboard = (event: globalThis.KeyboardEvent) => { if (event.key === "Tab") pointerFocus.current = false; };
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
        window.addEventListener("blur", release);
        document.addEventListener("keydown", keyboard, true);
        return () => {
            window.removeEventListener("pointerup", release);
            window.removeEventListener("pointercancel", release);
            window.removeEventListener("blur", release);
            document.removeEventListener("keydown", keyboard, true);
        };
    }, []);
    const select = (index: number) => {
        setSelected(index);
        setSelectionEpoch((value) => value + 1);
    };
    useEffect(() => () => { clearHover(); }, []);
    const selectWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const next = event.key === "Home" ? 0 : event.key === "End" ? WORKFLOW_SCENES.length - 1 : event.key === "ArrowRight" ? (index + 1) % WORKFLOW_SCENES.length : event.key === "ArrowLeft" ? (index + WORKFLOW_SCENES.length - 1) % WORKFLOW_SCENES.length : null;
        if (next === null) return;
        event.preventDefault(); clearHover(); select(next);
        categories.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    };
    const items = scene.nodes.map((node) => ({ title: node.title }));
    const blockNavigation = preview ? { onClick: (event: React.MouseEvent) => event.preventDefault() } : {};
    return <div className="mc-workflow-theater" ref={root} data-ui data-auto-playing={cycling || undefined}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") setHovered(false); }}
        onPointerDownCapture={() => { pointerFocus.current = true; setFocused(false); setPointerActive(true); }}
        onFocusCapture={() => { if (!pointerFocus.current) setFocused(true); }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
        onKeyDownCapture={() => { pointerFocus.current = false; setFocused(true); }}>
        <div className="mc-theater-autoplay-status"><span>{String(selected + 1).padStart(2, "0")} / {String(WORKFLOW_SCENES.length).padStart(2, "0")}</span><span>{preview ? "画布预览" : reduced ? "手动切换" : cycling ? "每 10 秒切换创作方向" : "自动切换已暂停"}</span></div>
        <div className="mc-theater-categories" ref={categories} role="group" aria-label="创作类型" onPointerEnter={(event) => { mouseWithinCategories.current = event.pointerType === "mouse"; }} onPointerLeave={() => { mouseWithinCategories.current = false; clearHover(); }}><div className="mc-theater-category-track">{WORKFLOW_SCENES.map((item, index) => <button type="button" aria-pressed={selected === index} tabIndex={selected === index ? 0 : -1} onKeyDown={(event) => selectWithKeyboard(event, index)} key={item.id} onPointerEnter={(event) => { clearHover(); if (event.pointerType === "mouse") hoverTimer.current = setTimeout(() => { hoverTimer.current = null; select(index); }, 120); }} onPointerLeave={clearHover} onClick={() => { clearHover(); select(index); }}>{item.label}{selected === index && cycling && <span key={selectionEpoch} className="mc-theater-category-progress" aria-hidden="true" />}</button>)}</div></div>
        <div className="mc-theater-scene" key={scene.id}>
            <div className="mc-theater-background" aria-hidden="true"><MotionMedia media={scene.background} enabled={playing} visible={visible && !preview} /></div>
            <div className="mc-theater-heading"><div><h3>{scene.title}</h3><p>{scene.description}</p></div><button type="button" className="mc-theater-motion" aria-label={reduced ? playing ? "暂停动态预览" : "播放动态预览" : intent === false ? "播放自动轮播" : "暂停自动轮播"} disabled={preview} onClick={() => setIntent(!(intent ?? !reduced))}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button></div>
            <BrandCanvasDemo key={scene.id} items={items} renderMedia={(_item, index) => <MotionMedia media={scene.nodes[index].media} enabled={playing} visible={visible && !preview} />} />
            <div className="mc-theater-footer"><BrandLink className="mv-button" href="/login" authNext={creationLink} {...blockNavigation}>打开创作画布<ArrowUpRight aria-hidden="true" /></BrandLink></div>
        </div>
    </div>;
}
