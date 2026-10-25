import { normalizeImageValue, normalizeVideoValue, type ModelCapabilityConfig } from "@/lib/model-capabilities";
import type { ModelProtocol } from "@/lib/model-protocols";
import { imageHostControls, parseImageParameters } from "@/lib/image-parameters";
import { formatVideoResolutionLabel, isVideoResolutionMatch } from "@/lib/video-generation-options";
import type { AiConfig } from "@/stores/use-config-store";

export type ParameterChange = { label: string; before: string; after: string };
export type MediaParameterMode = "image" | "video";
export class UnconfirmedMediaParametersError extends Error {}

export function mediaParameterChangeMessage(changes: ParameterChange[]) {
    return changes.length ? `当前模型无法保留已选参数：${changes.map((change) => `${change.label} ${change.before} → ${change.after}`).join("；")}。请在模型设置中确认调整后再生成。` : "";
}

function sizeKey(value: string) {
    const parts = value.trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    // A pixel size carries resolution as well as aspect ratio. Never collapse it to a ratio.
    return parts && Number(parts[2]) > 0 ? `ratio:${(Number(parts[1]) / Number(parts[2])).toFixed(6)}` : value.trim().toLowerCase().replace("×", "x");
}

export function mediaParameterChanges(before: Partial<AiConfig>, after: Partial<AiConfig>, mode: MediaParameterMode): ParameterChange[] {
    const changes: ParameterChange[] = [];
    const add = (key: keyof AiConfig, label: string, equal = (a: string, b: string) => a === b, format = (value: string) => value || "不指定") => {
        const a = before[key];
        const b = after[key];
        if (a === undefined || a === "" || b === undefined || equal(String(a), String(b))) return;
        changes.push({ label, before: format(String(a)), after: format(String(b)) });
    };
    add("size", "画幅 / 输出尺寸", (a, b) => sizeKey(a) === sizeKey(b));
    if (mode === "video") {
        const automatic = /^(auto|default|medium|high)$/i;
        add("vquality", "分辨率", (a, b) => a.toLowerCase() === b.toLowerCase() || (!automatic.test(a) && !automatic.test(b) && isVideoResolutionMatch(a, b)), (value) => automatic.test(value) ? value : formatVideoResolutionLabel(value));
        add("videoSeconds", "时长", (a, b) => Number(a) === Number(b), (v) => `${v} 秒`);
        add("videoGenerateAudio", "生成音轨", undefined, (v) => v === "true" ? "开启" : "关闭");
        add("videoWatermark", "水印", undefined, (v) => v === "true" ? "开启" : "关闭");
    } else {
        add("imageResolution", "分辨率", (a, b) => a.toLowerCase() === b.toLowerCase());
        add("quality", "质量", (a, b) => a.toLowerCase() === b.toLowerCase());
        add("count", "生成数量", (a, b) => Number(a) === Number(b));
        add("transparentBackground", "透明背景", undefined, (v) => v === "true" ? "开启" : "关闭");
        if (before.imageParameters !== undefined) {
            const oldParameters = parseImageParameters(before.imageParameters);
            const newParameters = parseImageParameters(after.imageParameters);
            for (const name of new Set([...Object.keys(oldParameters), ...Object.keys(newParameters)])) {
                if (imageHostControls.has(name) || newParameters[name] === oldParameters[name]) continue;
                changes.push({ label: `扩展参数 ${name}`, before: oldParameters[name] === undefined ? "未设置" : String(oldParameters[name]), after: newParameters[name] === undefined ? "不支持" : String(newParameters[name]) });
            }
        }
    }
    return changes;
}

// Only explicit user model switches use this plan. Cache restoration keeps its existing normalizers.
export function planMediaParameters(current: AiConfig, model: string, mode: MediaParameterMode, profile: ModelCapabilityConfig, protocol?: ModelProtocol) {
    const supportedSizes = mode === "video" ? profile.video?.ratios : profile.image?.size.values;
    const size = supportedSizes?.find((value) => sizeKey(value) === sizeKey(current.size)) || current.size;
    let parameters: Partial<AiConfig>;
    if (mode === "video" && profile.video) {
        const normalized = normalizeVideoValue(profile.video, { ratio: size, seconds: current.videoSeconds, resolution: current.vquality });
        parameters = {
            size: normalized.ratio, videoSeconds: normalized.seconds, vquality: normalized.resolution,
            videoGenerateAudio: profile.video.generateAudio.supported ? current.videoGenerateAudio : String(profile.video.generateAudio.default),
            videoWatermark: profile.video.watermark.supported ? current.videoWatermark : String(profile.video.watermark.default),
        };
    } else if (mode === "image" && profile.image) {
        const normalized = normalizeImageValue(profile.image, { ...current, size }, protocol);
        parameters = { ...normalized, imageResolution: normalized.imageResolution || "auto" };
    } else {
        throw new Error("目标模型未配置对应的生成能力");
    }
    const config = { ...current, ...parameters, model };
    return { config, changes: mediaParameterChanges(current, config, mode) };
}

// One pending intention per canvas editor. A stale or repeated confirmation can never commit.
export function createModelSwitchCoordinator() {
    let revision = 0;
    return {
        invalidate() { revision += 1; },
        request<T>({ read, plan, confirm, stale }: {
            read: () => T;
            plan: (snapshot: T) => { changes: ParameterChange[]; apply: () => void };
            confirm: (changes: ParameterChange[], accept: () => void) => void;
            stale: () => void;
        }) {
            const intention = ++revision;
            const snapshot = read();
            const proposed = plan(snapshot);
            let settled = false;
            const accept = () => {
                if (settled) return;
                settled = true;
                if (revision !== intention || read() !== snapshot) { stale(); return; }
                revision += 1;
                proposed.apply();
            };
            if (!proposed.changes.length) { accept(); return true; }
            confirm(proposed.changes, accept);
            return false;
        },
    };
}
