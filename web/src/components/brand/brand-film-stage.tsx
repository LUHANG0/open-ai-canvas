import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { BrandMotionMedia } from "./brand-motion-media";
import { WORKFLOW_SCENES } from "./brand-workflow-scenes";
import { useFilmPlayback } from "./use-film-playback";
import "./brand-film-stage.css";

const FILMS = [
    { name: "盐原悬海", image: "/brand/b/wave.webp" },
    { name: "流动雪境", ...WORKFLOW_SCENES[0].background },
    { name: "星夜列车", image: "/brand/b/train.webp" },
    { name: "光影空间", ...WORKFLOW_SCENES[7].background },
    { name: "云海鲸影", image: "/brand/b/whale.webp" },
    { name: "月下建筑", image: "/brand/b/architecture.webp" },
    { name: "人物影像", ...WORKFLOW_SCENES[1].background },
    { name: "玻璃城市", image: "/brand/b/glass-city.webp" },
];
const FILM_DURATIONS = FILMS.map((film) => "video" in film ? 10000 : 8000);

export function BrandFilmStage({ preview = false }: { preview?: boolean }) {
    const root = useRef<HTMLDivElement>(null);
    const rail = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointer: number; x: number; left: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    const [visible, setVisible] = useState(false);
    const [reduced, setReduced] = useState(true);
    useEffect(() => {
        const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(media?.matches ?? true);
        update(); media?.addEventListener("change", update);
        return () => media?.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        if (!root.current || preview || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .2 });
        observer.observe(root.current);
        return () => observer.disconnect();
    }, [preview]);
    const playback = useFilmPlayback({ durations: FILM_DURATIONS, visible, reduced, preview });
    const { selected, playing, choose, release } = playback;
    useEffect(() => {
        const endDrag = () => {
            if (!drag.current) return;
            suppressClick.current = drag.current.moved;
            drag.current = null;
            release();
        };
        window.addEventListener("pointerup", endDrag);
        window.addEventListener("pointercancel", endDrag);
        window.addEventListener("blur", endDrag);
        return () => {
            window.removeEventListener("pointerup", endDrag);
            window.removeEventListener("pointercancel", endDrag);
            window.removeEventListener("blur", endDrag);
        };
    }, [release]);
    useEffect(() => {
        const element = rail.current;
        const button = element?.querySelectorAll<HTMLButtonElement>("button")[selected];
        if (!element || !button || drag.current?.moved) return;
        if (button.offsetLeft < element.scrollLeft || button.offsetLeft + button.offsetWidth > element.scrollLeft + element.clientWidth) element.scrollTo({ left: Math.max(0, button.offsetLeft + button.offsetWidth / 2 - element.clientWidth / 2), behavior: reduced ? "auto" : "smooth" });
    }, [selected, reduced]);
    return <div ref={root} className="mc-film-stage" data-playing={playing || undefined}>
        <div className="mc-film-screen" aria-hidden="true">{FILMS.map((film, index) => <div key={film.name} className="mc-film-frame" data-active={selected === index || undefined}><BrandMotionMedia media={film} visible={visible && selected === index && !preview} enabled={playing && selected === index} /></div>)}</div>
        <div className="mc-film-controls" onPointerDownCapture={playback.pointer} onFocusCapture={(event) => { if (event.target.matches(":focus-visible")) playback.focus(); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) playback.blur(); }} onKeyDownCapture={playback.focus}>
            <div className="mc-film-rail" ref={rail} aria-label="首屏影像" onPointerEnter={(event) => { if (event.pointerType === "mouse") playback.enter(); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") playback.leave(); }} onPointerDown={(event) => {
                if (event.button !== 0) return;
                playback.hold();
                drag.current = { pointer: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
            }} onPointerMove={(event) => {
                const state = drag.current;
                if (!state || state.pointer !== event.pointerId) return;
                if (!state.moved && Math.abs(event.clientX - state.x) > 6) { state.moved = true; event.currentTarget.setPointerCapture?.(event.pointerId); }
                if (state.moved) { event.preventDefault(); event.currentTarget.scrollLeft = state.left - (event.clientX - state.x); }
            }} onPointerUp={() => { suppressClick.current = Boolean(drag.current?.moved); drag.current = null; playback.release(); }} onPointerCancel={() => { drag.current = null; playback.release(); }} onLostPointerCapture={() => { if (drag.current) playback.release(); drag.current = null; }} onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
                {FILMS.map((film, index) => <button type="button" key={film.name} className="mc-film-thumb" aria-label={`查看${film.name}影像`} aria-pressed={selected === index} onClick={() => choose(index)} onKeyDown={(event) => {
                    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
                    const next = event.key === "ArrowRight" ? (index + 1) % FILMS.length : event.key === "ArrowLeft" ? (index - 1 + FILMS.length) % FILMS.length : event.key === "Home" ? 0 : event.key === "End" ? FILMS.length - 1 : null;
                    if (next === null) return; event.preventDefault(); choose(next); rail.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
                }}><img src={film.image} alt="" draggable={false} loading="lazy" decoding="async" /><span className="mc-film-caption">{film.name}</span>{selected === index && <span className="mc-film-progress" aria-hidden="true"><i ref={playback.progress} /></span>}</button>)}
            </div>
            {!preview && <button type="button" className="mc-film-playback" aria-label={playback.wantsPlay ? "暂停首屏影像" : "播放首屏影像"} onClick={playback.toggle}>{playback.wantsPlay ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>}
        </div>
    </div>;
}
