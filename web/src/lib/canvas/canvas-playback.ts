import { claimMediaPlayback, releaseMediaPlayback } from "./media-playback-focus";
export const VIDEO_HOVER_DELAY_MS = 350;
export const VIDEO_HOVER_CURSOR_IDLE_MS = 1200;
export type PauseReason = "user" | "hidden" | "blur" | "offscreen" | "view" | "handoff" | "environment";
export type PlaybackStatus = "loading" | "recovering" | "buffering" | "seeking" | "playing" | "paused" | "ended" | "blocked" | "error";
export type CanvasPlaybackSession = {
    nodeId: string;
    identity: string;
    token: number;
    command: number;
    mode: "hover" | "explicit";
    intent: "play" | "pause";
    status: PlaybackStatus;
    startAt: number;
    pauseReason?: PauseReason;
    autoplayMuted?: boolean;
};
type Transport = { time: () => number | undefined; pause: () => void; rewind?: () => void };
export type PlaybackSound = { muted: boolean; volume: number };

/** LibTV-style transient player: deselection closes it; re-entry starts at zero. */
export class CanvasPlaybackController {
    private current: CanvasPlaybackSession | null = null;
    private nextToken = 0;
    private command = 0;
    private available = true;
    private progress = 0;
    private transport: { token: number; driver: Transport } | null = null;
    private sound: PlaybackSound = { muted: false, volume: 1 };
    private listeners = new Set<() => void>();
    private activate: ((nodeId: string) => void) | undefined;
    getSnapshot = () => this.current;
    getSound = () => this.sound;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    private notify() {
        this.listeners.forEach((listener) => listener());
    }
    private publish(next: CanvasPlaybackSession | null) {
        this.current = next;
        this.notify();
    }
    setActivationHandler(handler?: (nodeId: string) => void) {
        this.activate = handler;
    }
    setSound = (sound: PlaybackSound) => {
        const next = { muted: sound.muted, volume: Math.max(0, Math.min(1, sound.volume)) };
        if (!Number.isFinite(next.volume) || (next.volume === this.sound.volume && next.muted === this.sound.muted)) return;
        this.sound = next;
        this.notify();
    };
    bind(token: number, driver: Transport) {
        this.transport = { token, driver };
        return () => {
            if (this.transport?.driver === driver) this.transport = null;
        };
    }
    checkpoint(token: number) {
        if (this.current?.token !== token) return;
        const time = this.transport?.token === token ? this.transport.driver.time() : undefined;
        if (time !== undefined) this.recordTime(token, time);
    }
    canPreview(nodeId: string, identity: string) {
        if (!this.available) return false;
        const current = this.current;
        if (current?.mode !== "explicit") return true;
        // A user pause protects this player, not every other video on the canvas.
        return current.intent !== "play" && (current.nodeId !== nodeId || current.identity !== identity);
    }
    private acquire(nodeId: string, identity: string, mode: "hover" | "explicit") {
        const current = this.current;
        if (!this.available || (mode === "hover" && !this.canPreview(nodeId, identity))) return false;
        if (!claimMediaPlayback(this, mode === "hover" ? "preview" : "explicit", () => this.pause("handoff"))) return false;
        if (current?.nodeId === nodeId && current.identity === identity && !["ended", "error", "blocked"].includes(current.status)) {
            if (mode === "hover") return true;
            this.publish({ ...current, mode, autoplayMuted: false, intent: "play", command: ++this.command, pauseReason: undefined, status: current.intent === "play" && current.status === "playing" ? "playing" : "loading" });
        } else {
            this.transport?.driver.pause();
            this.transport = null;
            this.progress = 0;
            this.publish({ nodeId, identity, mode, intent: "play", status: "loading", token: ++this.nextToken, command: ++this.command, startAt: 0 });
        }
        if (mode === "explicit") this.activate?.(nodeId);
        return true;
    }
    preview(nodeId: string, identity: string) {
        return this.acquire(nodeId, identity, "hover");
    }
    play(nodeId: string, identity: string) {
        this.acquire(nodeId, identity, "explicit");
    }
    pause = (reason: PauseReason = "user") => {
        const s = this.current;
        if (!s) return;
        this.checkpoint(s.token);
        releaseMediaPlayback(this);
        if (s.mode === "hover") {
            this.release(s.token);
            return;
        }
        this.publish({ ...s, intent: "pause", command: ++this.command, status: ["ended", "error", "blocked"].includes(s.status) ? s.status : "paused", pauseReason: reason });
        this.transport?.driver.pause();
    };
    dismiss = () => {
        if (this.current) this.release(this.current.token);
    };
    accepts(token: number) {
        return this.current?.token === token && this.current.intent === "play";
    }
    played(token: number) {
        const s = this.current;
        if (!s || !this.accepts(token)) return false;
        if (s.status !== "playing") this.publish({ ...s, status: "playing" });
        return true;
    }
    phase(token: number, status: "buffering" | "seeking") {
        const s = this.current;
        if (s?.token === token && s.intent === "play" && s.status !== status) this.publish({ ...s, status });
    }
    paused(token: number) {
        const s = this.current;
        if (s?.token === token && s.intent === "play" && s.status === "playing") this.pause("environment");
    }
    recovering(token: number) {
        const s = this.current;
        if (s?.token !== token) return;
        this.checkpoint(token);
        this.publish({ ...s, status: "recovering" });
    }
    rejected(token: number, error: unknown) {
        const s = this.current;
        if (!s || !this.accepts(token)) return;
        const blocked = typeof error === "object" && error !== null && "name" in error && error.name === "NotAllowedError";
        if (blocked && s.mode === "hover" && !s.autoplayMuted) {
            // Fresh documents may preview silently until a trusted interaction enables audio.
            // This is session-local policy fallback, never a saved sound preference.
            this.publish({ ...s, autoplayMuted: true, command: ++this.command, status: "loading" });
            return;
        }
        this.checkpoint(token);
        releaseMediaPlayback(this);
        this.publish({ ...s, intent: "pause", command: ++this.command, status: blocked ? "blocked" : "error" });
    }
    ended(token: number) {
        const s = this.current;
        if (!s || s.token !== token) return;
        this.progress = 0;
        releaseMediaPlayback(this);
        if (s.mode === "hover") this.release(token);
        else {
            this.publish({ ...s, intent: "pause", command: ++this.command, status: "ended" });
            this.transport?.driver.rewind?.();
        }
    }
    failed(token: number) {
        const s = this.current;
        if (s?.token !== token) return;
        if (s.intent === "play") this.rejected(token, new Error("视频资源不可用"));
        else this.publish({ ...s, status: "error" });
    }
    recordTime(token: number, time: number) {
        if (this.current?.token === token && this.current.status !== "ended" && Number.isFinite(time) && time >= 0) this.progress = time;
    }
    position(token: number) {
        return this.current?.token === token ? this.progress : 0;
    }
    leave(token: number) {
        if (this.current?.token === token && this.current.mode === "hover") this.release(token);
    }
    release(token: number) {
        if (this.current?.token !== token) return;
        const driver = this.transport?.driver;
        this.transport = null;
        this.progress = 0;
        releaseMediaPlayback(this);
        this.publish(null);
        driver?.pause();
    }
    setAvailable(available: boolean) {
        if (this.available === available) return;
        this.available = available;
        if (!available && this.current) this.dismiss();
        else this.notify();
    }
    forget(nodeId: string) {
        if (this.current?.nodeId === nodeId) this.dismiss();
    }
    prune(nodeIds: Set<string>) {
        if (this.current && !nodeIds.has(this.current.nodeId)) this.dismiss();
    }
    clear() {
        this.dismiss();
    }
}
export type CanvasTapStart = { pointerId: number; x: number; y: number };
export function isCanvasBackgroundTap(start: CanvasTapStart | null, end: CanvasTapStart & { cancelled: boolean }) {
    return Boolean(start && !end.cancelled && start.pointerId === end.pointerId && Math.hypot(end.x - start.x, end.y - start.y) <= 3);
}
