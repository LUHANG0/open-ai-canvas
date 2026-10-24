import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";
import { loginPath } from "@/lib/auth-navigation";
import { BrandLink } from "./brand-link";
import { BrandMotionMedia } from "./brand-motion-media";
import { WORKFLOW_SCENES, type WorkflowMedia } from "./brand-workflow-scenes";
import "./brand-techniques.css";

type BrandTechnique = { presetId: string; title: string; description: string; steps: string[]; media: WorkflowMedia };

// Editorial previews of the existing preset catalog, not automatically applied workflows.
export const BRAND_TECHNIQUES: BrandTechnique[] = [
    { presetId: "short-drama-pilot", title: "短剧立项与大纲", description: "先搭建故事结构，再让人物、弧光与对白落进同一条叙事。", steps: ["故事结构", "人物设定", "对白打磨"], media: { image: "/brand/b/train.webp" } },
    { presetId: "ad-full-chain", title: "广告全链路", description: "从产品研究出发，让创意、文案与分镜彼此呼应。", steps: ["产品研究", "创意概念", "脚本分镜"], media: WORKFLOW_SCENES[2].background },
    { presetId: "ai-performer", title: "AI 角色表演", description: "连接角色设定、表演节拍与视觉基调，组织人物的情绪与动作。", steps: ["角色设定", "情绪节拍", "表演设计"], media: WORKFLOW_SCENES[1].background },
    { presetId: "ecom-image", title: "电商大图与系列图", description: "从产品参考与风格出发，规划一组有统一气质的画面。", steps: ["产品参考", "风格探索", "系列画面"], media: WORKFLOW_SCENES[3].background },
];

export function BrandTechniques({ preview = false }: { preview?: boolean }) {
    const [selected, setSelected] = useState(0);
    const [visible, setVisible] = useState(false);
    const [pageVisible, setPageVisible] = useState(true);
    const [reduced, setReduced] = useState(true);
    const [manualPlay, setManualPlay] = useState<boolean | null>(null);
    const root = useRef<HTMLElement>(null);
    const hoverTimer = useRef<number | null>(null);
    const panel = useId();
    const active = BRAND_TECHNIQUES[selected];
    const wantsPlay = manualPlay ?? !reduced;
    const playing = wantsPlay && visible && pageVisible && !preview;
    const clearHover = () => { if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current); hoverTimer.current = null; };
    const select = (index: number) => { clearHover(); setSelected(index); };
    useEffect(() => {
        const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        const change = () => setReduced(media?.matches ?? true);
        change(); media?.addEventListener("change", change);
        return () => media?.removeEventListener("change", change);
    }, []);
    useEffect(() => {
        const change = () => setPageVisible(document.visibilityState !== "hidden");
        change(); document.addEventListener("visibilitychange", change);
        const observer = !preview && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .15 }) : null;
        if (root.current) observer?.observe(root.current);
        return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", change); clearHover(); };
    }, [preview]);
    return <section ref={root} id="techniques" className="mc-section mc-techniques" aria-labelledby={`${panel}-heading`}>
        <div className="mc-techniques-heading"><div><h2 id={`${panel}-heading`}>灵感之外，还有方法。</h2><p>从故事开发到商业影像，把需要的创作技能连接起来。</p></div><BrandLink className="mc-content-link" href={loginPath("/skills")} onClick={preview ? (event) => event.preventDefault() : undefined}>探索技能库<ArrowUpRight aria-hidden="true" /></BrandLink></div>
        <div className="mc-techniques-layout">
            <div id={`${panel}-preview`} className="mc-technique-preview" role="region" aria-labelledby={`${panel}-title`} data-playing={playing || undefined}>
                <div className="mc-technique-frames" aria-hidden="true">{BRAND_TECHNIQUES.map((technique, index) => <div className="mc-technique-frame" key={technique.presetId} data-active={index === selected || undefined}><BrandMotionMedia media={technique.media} visible={visible && index === selected && !preview} enabled={playing && index === selected} /></div>)}</div>
                {!preview && <button type="button" className="mc-film-playback mc-technique-playback" aria-label={wantsPlay ? "暂停方法影像" : "播放方法影像"} onClick={() => setManualPlay(!wantsPlay)}>{wantsPlay ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>}
                <div className="mc-technique-copy"><h3 id={`${panel}-title`}>{active.title}</h3><p>{active.description}</p><ol className="mc-technique-steps" aria-label="方法步骤">{active.steps.map((step, index) => <li key={step}><span>{step}</span>{index < active.steps.length - 1 && <ArrowRight aria-hidden="true" />}</li>)}</ol></div>
            </div>
            <div className="mc-technique-choices" role="group" aria-label="选择创作方法">{BRAND_TECHNIQUES.map((technique, index) => <button type="button" key={technique.presetId} aria-pressed={selected === index} aria-controls={`${panel}-preview`} className="mc-technique-choice" onClick={() => select(index)} onFocus={() => select(index)} onPointerEnter={(event) => { if (event.pointerType !== "mouse") return; clearHover(); hoverTimer.current = window.setTimeout(() => { hoverTimer.current = null; setSelected(index); }, 120); }} onPointerLeave={clearHover}>
                <img src={technique.media.image} alt="" loading="lazy" decoding="async" draggable={false} /><span><strong>{technique.title}</strong><small>{technique.steps.join(" · ")}</small></span><ArrowRight aria-hidden="true" />
            </button>)}</div>
        </div>
    </section>;
}
