import { ArrowRight, Clapperboard, FileText, Image as ImageIcon, type LucideIcon } from "lucide-react";

export type CreationMode = "text" | "image" | "video";

type EmptyStateAction = {
    mode: CreationMode;
    icon: LucideIcon;
    eyebrow: string;
    title: string;
    hint: string;
    prompt: string;
};

const emptyStateActions: EmptyStateAction[] = [
    {
        mode: "video",
        icon: Clapperboard,
        eyebrow: "热门技能",
        title: "镜头导演",
        hint: "把一个想法拆成画面、运镜与节奏完整的电影镜头。",
        prompt: "雨夜天台，镜头缓缓推近霓虹灯牌下的主角，她回眸看向镜头，强对比电影感布光",
    },
    {
        mode: "image",
        icon: ImageIcon,
        eyebrow: "角色设计",
        title: "系列定妆照",
        hint: "围绕同一角色生成统一风格、多视角的视觉设定。",
        prompt: "电影剧照，一名年轻女性独自坐在深夜便利店窗边，玻璃上映出城市灯光，安静克制的情绪，35mm 胶片质感",
    },
    {
        mode: "text",
        icon: FileText,
        eyebrow: "剧本灵感",
        title: "短片故事结构",
        hint: "从人物冲突出发，快速搭出可拍摄的短片故事骨架。",
        prompt: "帮我续写一个短剧故事，先聊聊剧情走向：",
    },
];

const modeHeadline: Record<CreationMode, string> = {
    text: "故事",
    image: "画面",
    video: "镜头",
};

export function CreationEmptyIntro({ mode }: { mode: CreationMode }) {
    return (
        <header className="creation-empty-intro">
            <h1>
                你好，想创作什么<span aria-hidden="true">？</span>
            </h1>
            <p>从一个想法开始，和影策一起完成你的{modeHeadline[mode]}。</p>
        </header>
    );
}

export function CreationEmptySuggest({ onStartPrompt }: { onStartPrompt: (mode: CreationMode, prompt: string) => void }) {
    return (
        <section className="creation-empty-starters" aria-label="创作技能推荐">
            <nav className="creation-empty-suggest" aria-label="创作起点">
                {emptyStateActions.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button key={item.title} type="button" className={`suggest-card is-${item.mode}`} onClick={() => onStartPrompt(item.mode, item.prompt)}>
                            <span className="suggest-visual" aria-hidden="true">
                                <span className="suggest-icon">
                                    <Icon />
                                </span>
                                <span className="suggest-eyebrow">{item.eyebrow}</span>
                            </span>
                            <span className="suggest-copy">
                                <strong>{item.title}</strong>
                                <span>{item.hint}</span>
                            </span>
                            <ArrowRight className="suggest-card-arrow" aria-hidden="true" />
                        </button>
                    );
                })}
            </nav>
        </section>
    );
}
