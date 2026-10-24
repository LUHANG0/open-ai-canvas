import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { BrandCanvasDemo } from "./brand-canvas-demo";
import { BrandLink } from "./brand-link";
import { WORKFLOW_SCENES } from "./brand-workflow-scenes";
import { BrandMotionMedia as MotionMedia } from "./brand-motion-media";
import { loginPath } from "@/lib/auth-navigation";
import "./brand-workflow-theater.css";

export function BrandWorkflowTheater({ preview = false, creationLink }: { preview?: boolean; creationLink: string }) {
    const root = useRef<HTMLDivElement>(null);
    const categories = useRef<HTMLDivElement>(null);
    const mouseWithinCategories = useRef(false);
    const [selected, setSelected] = useState(0);
    const [visible, setVisible] = useState(false);
    const [intent, setIntent] = useState<boolean | null>(null);
    const [reduced, setReduced] = useState(true);
    const transition = useRef<ViewTransition | null>(null);
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
        update(); media?.addEventListener("change", update);
        return () => media?.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        if (preview || !root.current || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .15 });
        observer.observe(root.current);
        return () => observer.disconnect();
    }, [preview]);
    const scene = WORKFLOW_SCENES[selected];
    const playing = !preview && visible && (intent ?? !reduced);
    const select = (index: number) => {
        if (index === selected) return;
        transition.current?.skipTransition();
        if (!preview && !reduced && typeof document.startViewTransition === "function") {
            transition.current = document.startViewTransition(() => flushSync(() => setSelected(index)));
            void transition.current.ready.catch(() => {});
        } else setSelected(index);
    };
    useEffect(() => () => { clearHover(); transition.current?.skipTransition(); }, []);
    const items = scene.nodes.map((node) => ({ title: node.title }));
    const blockNavigation = preview ? { onClick: (event: React.MouseEvent) => event.preventDefault() } : {};
    return <div className="mc-workflow-theater" ref={root}>
        <div className="mc-theater-categories" ref={categories} aria-label="创作类型" onPointerEnter={(event) => { mouseWithinCategories.current = event.pointerType === "mouse"; }} onPointerLeave={() => { mouseWithinCategories.current = false; clearHover(); }}><div className="mc-theater-category-track" style={{ "--category-index": selected } as CSSProperties}>{WORKFLOW_SCENES.map((item, index) => <button type="button" aria-pressed={selected === index} key={item.id} onPointerEnter={(event) => { clearHover(); if (event.pointerType === "mouse") hoverTimer.current = setTimeout(() => { hoverTimer.current = null; select(index); }, 120); }} onPointerLeave={clearHover} onClick={() => { clearHover(); select(index); }}>{item.label}</button>)}</div></div>
        <div className="mc-theater-scene" key={scene.id} style={{ viewTransitionName: preview ? undefined : "mc-workflow-scene" }}>
            <div className="mc-theater-background" aria-hidden="true"><MotionMedia media={scene.background} enabled={playing} visible={visible && !preview} /></div>
            <div className="mc-theater-heading"><div><h3>{scene.title}</h3><p>{scene.description}</p></div><button type="button" className="mc-theater-motion" aria-label={playing ? "暂停动态预览" : "播放动态预览"} disabled={preview} onClick={() => setIntent(!playing)}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button></div>
            <BrandCanvasDemo key={scene.id} items={items} renderMedia={(_item, index) => <MotionMedia media={scene.nodes[index].media} enabled={playing} visible={visible && !preview} />} />
            <div className="mc-theater-footer"><BrandLink className="mc-button mc-primary" href={loginPath(creationLink)} {...blockNavigation}>开始我的创作<ArrowUpRight aria-hidden="true" /></BrandLink></div>
        </div>
    </div>;
}
