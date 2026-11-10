import { decodeNovelText } from "@/lib/canvas/canvas-document";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_WORD_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_WORD_BYTES = 64 * 1024 * 1024;
const MAX_WORD_CHARACTERS = 1_000_000;

export const TEXT_DOCUMENT_UPLOAD_ACCEPT = `text/plain,text/markdown,.txt,.md,.markdown,.docx,${WORD_MIME}`;

export function isWordUploadFile(file: Pick<File, "name" | "type">) {
    return /\.docx$/i.test(file.name) || file.type === WORD_MIME;
}

export function isLegacyWordUploadFile(file: Pick<File, "name" | "type">) {
    return /\.doc$/i.test(file.name) || file.type === "application/msword";
}

export function unsupportedDocumentUploadMessage(file?: Pick<File, "name" | "type">) {
    return file && isLegacyWordUploadFile(file)
        ? "旧版 .doc 文档暂不支持，请用 Word 或 WPS 另存为 .docx 后上传"
        : "请选择图片、视频、音频或 Word（.docx）/ TXT / Markdown 文件";
}

/** 只提取正文，不渲染文档 HTML、执行宏或读取文档中的外部资源。 */
export async function readTextUploadFile(file: File): Promise<string> {
    if (isLegacyWordUploadFile(file)) throw new Error(unsupportedDocumentUploadMessage(file));
    if (!isWordUploadFile(file)) return decodeNovelText(await file.arrayBuffer());
    if (file.size > MAX_WORD_BYTES) throw new Error("Word 文档不能超过 20 MB，请拆分后上传");

    let text: string;
    try {
        const buffer = await file.arrayBuffer();
        const { unzipSync } = await import("fflate");
        let expandedBytes = 0;
        let hasDocument = false;
        // 先检查 ZIP 目录声明的展开量；此阶段不解压图片或其他附件。
        unzipSync(new Uint8Array(buffer), { filter: (entry) => {
            expandedBytes += entry.originalSize;
            if (expandedBytes > MAX_EXPANDED_WORD_BYTES) throw new Error("文档展开后过大");
            if (entry.name === "word/document.xml") hasDocument = true;
            return false;
        } });
        if (!hasDocument) throw new Error("缺少 Word 正文");
        const mammoth = await import("mammoth/mammoth.browser.js");
        // extractRawText 会丢弃 Word 的手动换行。通过脱离页面的 DOM 取文本，
        // 保留段落、换行和表格边界；不将转换结果插入页面，也不加载内嵌图片。
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
            externalFileAccess: false,
            convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
        });
        const document = new DOMParser().parseFromString(result.value, "text/html");
        const plainText = (node: Node): string => {
            if (node.nodeType === 3) return node.textContent || "";
            const tag = node.nodeName.toUpperCase();
            if (tag === "BR") return "\n";
            if (tag === "IMG") return "";
            const children = Array.from(node.childNodes).map(plainText).join("");
            if (/^(P|H[1-6]|LI|TR)$/.test(tag)) return children + "\n\n";
            if (tag === "TD" || tag === "TH") return children.trim() + "\t";
            return children;
        };
        text = plainText(document.body).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    } catch {
        throw new Error("无法读取 Word 文档，请确认文件未损坏、未加密，并用 Word 或 WPS 重新另存为 .docx");
    }
    if (!text) throw new Error("Word 文档没有可读取的正文；图片或扫描件中的文字请先转为文本");
    if (text.length > MAX_WORD_CHARACTERS) throw new Error("Word 正文超过 100 万字符，请拆分后上传");
    return text;
}
