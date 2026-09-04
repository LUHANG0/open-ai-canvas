export type CanvasNodeResourceSource = {
    storageKey: string;
    fallback: string;
    remote: boolean;
};

export type CanvasNodeResourceRequest = {
    source: CanvasNodeResourceSource;
    download: boolean;
};

export type CanvasNodeResourceState = {
    source: CanvasNodeResourceSource;
    url: string;
    loading: boolean;
    request: CanvasNodeResourceRequest | null;
};

export function createCanvasNodeResourceState(source: CanvasNodeResourceSource, eager: boolean): CanvasNodeResourceState {
    return { source, url: source.remote ? "" : source.fallback, loading: source.remote && eager, request: null };
}

export function readCanvasNodeResourceState(state: CanvasNodeResourceState, source: CanvasNodeResourceSource, eager: boolean): CanvasNodeResourceState {
    // 新资源的首次渲染早于 effect，不能在这一帧借用旧资源的 URL。
    return state.source === source ? state : createCanvasNodeResourceState(source, eager);
}

export function beginCanvasNodeResourceRequest(state: CanvasNodeResourceState, request: CanvasNodeResourceRequest): CanvasNodeResourceState {
    const current = readCanvasNodeResourceState(state, request.source, request.download);
    return { ...current, loading: !current.url && request.download, request };
}

export function finishCanvasNodeResourceRequest(state: CanvasNodeResourceState, request: CanvasNodeResourceRequest, resolvedUrl: string): CanvasNodeResourceState {
    // 源身份与请求身份共同隔离换素材和缓存读取/下载的乱序完成。
    if (state.source !== request.source || state.request !== request) return state;
    return {
        source: state.source,
        url: resolvedUrl || state.url || (request.download ? state.source.fallback : ""),
        loading: false,
        request: null,
    };
}
