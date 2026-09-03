export async function fetchBlob(url: string, init?: RequestInit, label = "媒体读取") {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`${label}失败（HTTP ${response.status}）`);
    return response.blob();
}
