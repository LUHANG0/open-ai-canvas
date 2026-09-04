export const CANVAS_VIDEO_HOVER_DELAY_MS = 180;

type PreviewCallbacks = { start: () => void; stop: () => void };
type SchedulePreview = (callback: () => void) => () => void;

// 所有画布视频共用一个播放席位；连同尚未触发的悬停一起取消，避免快速划过后延迟出声。
export function createCanvasVideoPreviewGroup(schedule: SchedulePreview = (callback) => {
    const timer = setTimeout(callback, CANVAS_VIDEO_HOVER_DELAY_MS);
    return () => clearTimeout(timer);
}) {
    let current: { stop: () => void } | null = null;
    return {
        createSession(callbacks: PreviewCallbacks) {
            let cancel: (() => void) | undefined;
            let active = false;
            let revision = 0;
            const session = {
                start(immediate = false) {
                    if (current === session && (active || (cancel && !immediate))) return;
                    current?.stop();
                    current = session;
                    const token = ++revision;
                    const activate = () => {
                        if (current !== session || revision !== token) return;
                        cancel = undefined;
                        active = true;
                        callbacks.start();
                    };
                    if (immediate) activate();
                    else cancel = schedule(activate);
                },
                stop() {
                    cancel?.();
                    cancel = undefined;
                    revision++;
                    active = false;
                    if (current !== session) return;
                    current = null;
                    callbacks.stop();
                },
                isActive(token = revision) { return current === session && active && revision === token; },
                token() { return revision; },
            };
            return session;
        },
    };
}

export const canvasVideoPreviewGroup = createCanvasVideoPreviewGroup();
