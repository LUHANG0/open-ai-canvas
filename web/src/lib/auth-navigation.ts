/** Shared destination contract for public entries, guards and authentication forms. */
export function safeAuthNext(value: string | null | undefined) {
    if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/create";
    return value;
}

export function loginPath(next: string) {
    return `/login?next=${encodeURIComponent(safeAuthNext(next))}`;
}
