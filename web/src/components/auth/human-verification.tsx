import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { flushSync } from "react-dom";
import { getPublicTurnstileConfig, protectsHumanAction, type HumanVerificationAction } from "@/services/api/turnstile";
import { loadTurnstile, type TurnstileAPI } from "./turnstile-client";
import "./human-verification.css";

export type HumanVerificationHandle = { verify(): Promise<string>; reset(): void };
type Status = "idle" | "loading" | "retrying" | "interaction" | "ready" | "error";

function challengeError(code: string): { message: string; retryable: boolean } {
    const reference = /^\d{6}$/.test(code) ? `（${code}）` : "";
    if (code === "110200" || code === "400021") return { message: `当前域名未获安全验证授权，请联系管理员${reference}`, retryable: false };
    if (["110100", "110110", "400020", "400070"].includes(code)) return { message: `安全验证配置异常，请联系管理员${reference}`, retryable: false };
    if (code === "200100") return { message: `安全验证失败，请检查设备时间并刷新页面${reference}`, retryable: false };
    if (/^[36]\d{5}$/.test(code)) return { message: `安全验证未通过，请刷新页面重试；若仍失败，可尝试其他浏览器或网络${reference}`, retryable: true };
    return { message: `无法连接安全验证服务，请检查网络或浏览器拦截设置后重试${reference}`, retryable: true };
}

export function HumanVerification({ action, active = true, ref }: { action: HumanVerificationAction; active?: boolean; ref?: Ref<HumanVerificationHandle> }) {
    const container = useRef<HTMLDivElement>(null);
    const instance = useRef<{ api: TurnstileAPI; widget: string } | null>(null);
    const pending = useRef<{ resolve(token: string): void; reject(error: Error): void; timer: number } | null>(null);
    const generation = useRef(0);
    const requestAbort = useRef<AbortController | null>(null);
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState("");

    const remove = () => {
        if (instance.current) { instance.current.api.remove(instance.current.widget); instance.current = null; }
    };
    const cancel = () => {
        generation.current++;
        requestAbort.current?.abort(); requestAbort.current = null;
        if (pending.current) { window.clearTimeout(pending.current.timer); pending.current.reject(new Error("验证已取消，请重新尝试")); pending.current = null; }
        remove();
    };
    const reset = () => { cancel(); setStatus("idle"); setError(""); };
    useEffect(() => { setStatus("idle"); return cancel; }, [action, active]);

    useImperativeHandle(ref, () => ({
        reset,
        verify: async () => {
            if (!active) return "";
            cancel();
            const current = generation.current;
            const controller = new AbortController(); requestAbort.current = controller;
            setError("");
            const stillCurrent = () => generation.current === current;
            try {
                const { turnstile: settings } = await getPublicTurnstileConfig(controller.signal);
                if (!stillCurrent()) throw new Error("验证已取消，请重新尝试");
                if (!protectsHumanAction(settings, action)) { setStatus("idle"); return ""; }
                if (!settings?.siteKey) throw new Error("安全验证尚未配置，请联系管理员");
                // Turnstile measures its host during render; a cached script can resolve
                // before React commits the status that reveals this container.
                flushSync(() => setStatus("loading"));
                const api = await new Promise<TurnstileAPI>((resolve, reject) => {
                    const abort = () => reject(new Error("验证已取消，请重新尝试"));
                    controller.signal.addEventListener("abort", abort, { once: true });
                    void loadTurnstile().then((value) => { controller.signal.removeEventListener("abort", abort); resolve(value); }, (cause) => { controller.signal.removeEventListener("abort", abort); reject(cause); });
                });
                if (!stillCurrent() || !container.current) throw new Error("验证已取消，请重新尝试");
                return await new Promise<string>((resolve, reject) => {
                    let failures = 0;
                    const settle = (token?: string, message?: string) => {
                        if (!stillCurrent() || !pending.current) return;
                        window.clearTimeout(pending.current.timer); pending.current = null;
                        if (token) { setStatus("ready"); resolve(token); }
                        else { setStatus("error"); setError(message || "安全验证未通过，请重新尝试"); reject(new Error(message || "安全验证未通过，请重新尝试")); }
                        queueMicrotask(() => { if (stillCurrent()) remove(); });
                    };
                    pending.current = { resolve, reject, timer: window.setTimeout(() => settle(undefined, "安全验证已超时，请重新尝试"), 120000) };
                    try {
                        const widget = api.render(container.current!, {
                            sitekey: settings.siteKey, action, theme: "auto", language: "zh-cn", size: container.current!.clientWidth < 300 ? "compact" : "flexible", appearance: "execute", execution: "execute", retry: "auto", "retry-interval": 2000,
                            callback: (token) => settle(token),
                            "error-callback": (code) => {
                                if (!stillCurrent() || !pending.current) return true;
                                const failure = challengeError(code);
                                // Keep the widget alive for Cloudflare's own transient-error retries.
                                if (failure.retryable && ++failures <= 2) { setStatus("retrying"); return false; }
                                settle(undefined, failure.message);
                                return true;
                            },
                            "expired-callback": () => settle(undefined, "安全验证已过期，请重新尝试"),
                            "timeout-callback": () => settle(undefined, "安全验证已超时，请重新尝试"),
                            "before-interactive-callback": () => { if (stillCurrent()) setStatus("interaction"); },
                        });
                        instance.current = { api, widget };
                        api.execute(widget);
                    } catch { settle(undefined, "无法启动安全验证，请重新尝试"); }
                });
            } catch (cause) {
                if (stillCurrent()) { setStatus("error"); setError(cause instanceof Error ? cause.message : "安全验证暂不可用，请重试"); }
                throw cause;
            }
        },
    }));

    return <div className={`auth-human-verification is-${status}`} hidden={!active || status === "idle"}>
        <div className="auth-human-verification-status" role={status === "error" ? "alert" : "status"} aria-live="polite">
            <span>{status === "loading" ? "正在进行安全验证…" : status === "retrying" ? "安全验证暂未完成，正在重试…" : status === "interaction" ? "请完成下方安全验证" : status === "ready" ? "安全验证已完成" : error}</span>
            {(status === "loading" || status === "retrying" || status === "interaction") && <button type="button" onClick={reset}>取消</button>}
        </div>
        <div ref={container} className="auth-human-verification-widget" />
    </div>;
}
