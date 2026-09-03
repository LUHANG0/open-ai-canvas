export function projectSourceTextToPlainText(value: string) {
    if (!value) return "";
    const withBreaks = value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
        .replace(/<li(?:\s[^>]*)?>/gi, "• ");
    const withoutTags = withBreaks.replace(/<[^>]+>/g, "");
    return decodeProjectHtmlEntities(withoutTags)
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function decodeProjectHtmlEntities(value: string) {
    if (typeof DOMParser !== "undefined") {
        return new DOMParser().parseFromString(value, "text/html").documentElement.textContent || "";
    }
    return value
        .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
        .replace(/&#x([\da-f]+);/gi, (_match, hexadecimal: string) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'");
}
