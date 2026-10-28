import { ArrowUpRight, Clapperboard, Image, Layers3, Play, Sparkles } from "lucide-react";
import "./brand-product-preview.css";

const frames = ["/brand/v5/story-wide.webp", "/brand/v5/story-character.webp", "/brand/v5/story-detail.webp"];
export const PRODUCT_ENTRIES = [
    { legacy: "写下灵感", title: "AI 视频创作", description: "描述画面，带入参考素材，在对话中生成镜头、继续调整。", link: "/create?mode=video", kind: "video" },
    { legacy: "展开画布", title: "AI 无限画布", description: "自由摆放文字、图片与视频，连接参考关系，比较镜头方案。", link: "/canvas", kind: "canvas" },
    { legacy: "推进作品", title: "短剧项目", description: "围绕章节、角色与分镜组织故事，让每个镜头都有清晰的位置。", link: "/projects", kind: "project" },
] as const;
export type ProductPreviewKind = typeof PRODUCT_ENTRIES[number]["kind"];

/** Purpose-made product illustrations, assembled from actual supported workflows, not app screenshots. */
export function BrandProductPreview({ kind }: { kind: ProductPreviewKind }) {
    return <div className={"mc-product-visual mc-product-visual--" + kind} role="img" aria-label={kind === "video" ? "视频创作效果示意：文字与参考画面生成镜头" : kind === "canvas" ? "画布效果示意：人物参考、创意文字与镜头相连" : "短剧项目效果示意：角色、章节与三个分镜组成故事"}>
        <div aria-hidden="true">
            {kind === "video" ? <>
                <div className="mpv-screen"><img src={frames[0]} alt="" loading="lazy" /><span className="mpv-play"><Play /></span><span className="mpv-screen-label">镜头 01 · 海边的来信</span></div>
                <div className="mpv-prompt"><Sparkles /><span>晨光漫过海面，镜头缓缓推近…</span><ArrowUpRight /></div>
                <div className="mpv-reference"><img src={frames[1]} alt="" loading="lazy" /><div><span>带入参考素材</span><strong>人物 · 场景 · 风格</strong></div><span className="mpv-tag">视频创作</span></div>
            </> : kind === "canvas" ? <div className="mpv-canvas">
                <svg className="mpv-wires" viewBox="0 0 400 350"><path d="M125 95 C220 95 155 207 230 207 M128 275 C200 275 165 207 230 207" /><circle cx="230" cy="207" r="4" /></svg>
                <div className="mpv-node mpv-node-character"><div><Image />人物参考</div><img src={frames[1]} alt="" loading="lazy" /></div>
                <div className="mpv-node mpv-node-note"><span>创意笔记</span><p>一封迟来的信，<br />一段未完的旅程。</p></div>
                <div className="mpv-node mpv-node-output"><div><Clapperboard />下一幕</div><img src={frames[0]} alt="" loading="lazy" /><span>从参考画面，继续创作</span></div>
                <div className="mpv-canvas-tools"><Layers3 /><span>文字</span><span>图片</span><span>视频</span><span>连接</span></div>
            </div> : <div className="mpv-project">
                <div className="mpv-project-heading"><Clapperboard /><div><strong>海边的来信</strong><span>第一章 · 重逢</span></div><span className="mpv-tag">短剧项目</span></div>
                <div className="mpv-character"><img src={frames[1]} alt="" loading="lazy" /><div><span>主要角色</span><strong>林夏</strong><p>带着旧信重返海边小镇</p></div></div>
                <div className="mpv-shots">{frames.map((src, index) => <div key={src}><img src={src} alt="" loading="lazy" /><span>0{index + 1} <small>{["远景", "人物", "细节"][index]}</small></span></div>)}</div>
                <div className="mpv-timeline"><span /><span /><span /><i /></div><div className="mpv-project-foot"><span>章节 → 角色 → 分镜</span><span>故事逐镜展开</span></div>
            </div>}
        </div>
    </div>;
}
