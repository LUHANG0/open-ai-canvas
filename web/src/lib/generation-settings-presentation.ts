import type { ImageParameter, ImageParameterValue } from "@/lib/image-parameters";
import { imageQualityLabel } from "@/lib/image-quality";
import { formatVideoResolutionLabel } from "@/lib/video-generation-options";

export function settingsVideoResolutionLabel(value: string) {
    if (value.toLowerCase() === "auto") return "自动";
    if (value.toLowerCase() === "adaptive") return "自适应";
    return formatVideoResolutionLabel(value);
}

export function settingsImageResolutionLabel(value: string) {
    return /^\d+(?:\.\d+)?k$/i.test(value) ? value.toUpperCase() : value.toLowerCase() === "auto" ? "自动" : value;
}

export function settingsAspectLabel(value: string) {
    const token = value.toLowerCase();
    if (token === "auto") return "自动";
    if (token === "adaptive") return "自适应";
    const match = value.match(/^(\d+(?:\.\d+)?)(?::|x)(\d+(?:\.\d+)?)$/i);
    if (!match) return value;
    const width = Number(match[1]), height = Number(match[2]);
    if (!width || !height) return value;
    return `${width === height ? "方形" : width > height ? "横屏" : "竖屏"} ${value}`;
}

export function imageResponseFormatField(field: Pick<ImageParameter, "name" | "binding">) {
    return field.name === "response_format" || (field.name === "responseFormat" && Boolean(field.binding?.endsWith(".response_format") || field.binding === "response_format"));
}

export function imageSettingLabel(field: ImageParameter) {
    if (field.name === "quality") return field.values?.length && field.values.every((value) => typeof value === "string" && /^\d+(?:\.\d+)?k$/i.test(value)) ? "分辨率" : "图像质量";
    if (field.name === "size") return "画幅";
    if (field.name === "imageResolution") return "分辨率";
    if (field.name === "count") return "生成张数";
    if (imageResponseFormatField(field)) return "图片返回形式";
    return field.label;
}

/** Generation labels only: the typed enum and protocol editor remain untouched. */
export function imageSettingOption(field: ImageParameter, value: ImageParameterValue) {
    if (typeof value === "boolean") return value ? "开启" : "关闭";
    if (typeof value !== "string") return String(value);
    if (field.name === "quality") return /^\d+(?:\.\d+)?k$/i.test(value) ? value.toUpperCase() : imageQualityLabel(value);
    if (field.name === "imageResolution") return settingsImageResolutionLabel(value);
    if (field.name === "size") return settingsAspectLabel(value);
    if (imageResponseFormatField(field)) return ({ url: "图片链接", b64_json: "图片数据", auto: "自动" } as Record<string, string>)[value] || value;
    return value;
}

export function imageSettingOrder(field: ImageParameter) {
    return ({ size: 0, imageResolution: 1, quality: 2, count: 3, transparentBackground: 4 } as Record<string, number>)[field.name] ?? 5;
}

export function imageSettingDescription(field: ImageParameter) {
    if (field.name === "imageResolution" && field.description === "仅用于画幅到像素尺寸的换算，不向上游发送 resolution。") return "用于画幅与像素尺寸的换算。";
    if (field.name === "imageResolution" && field.description === "1K / 2K / 4K 分别映射为平台的 quality=low / medium / high。") return "1K、2K、4K对应当前模型支持的清晰度档位。";
    if (field.name === "quality" && field.description === "low / medium / high 为质量；xhigh / max 仅适用于平台明确开放的 GPT 2.5 线路。") return "超高、最高仅限当前线路明确支持时使用。";
    return field.description;
}
