export type TurnstileAPI = {
    render(container: HTMLElement, options: {
        sitekey: string; action: string; theme: "auto"; language: "zh-cn"; size: "flexible" | "compact";
        appearance: "interaction-only"; execution: "execute";
        callback: (token: string) => void;
        "error-callback": () => void;
        "expired-callback": () => void;
        "timeout-callback": () => void;
        "before-interactive-callback": () => void;
    }): string;
    execute(widget: string): void;
    remove(widget: string): void;
};

declare global { interface Window { turnstile?: TurnstileAPI } }

let loading: Promise<TurnstileAPI> | null = null;
const scriptID = "mengceng-turnstile";

export function loadTurnstile(): Promise<TurnstileAPI> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    const promise = new Promise<TurnstileAPI>((resolve, reject) => {
        let script = document.getElementById(scriptID) as HTMLScriptElement | null;
        if (script) script.remove();
        script = document.createElement("script");
        script.id = scriptID;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        const fail = () => { window.clearTimeout(timer); script?.remove(); reject(new Error("安全验证加载失败，请检查网络后重试")); };
        const timer = window.setTimeout(fail, 12000);
        script.onload = () => {
            window.clearTimeout(timer);
            if (window.turnstile) resolve(window.turnstile); else fail();
        };
        script.onerror = fail;
        document.head.appendChild(script);
    });
    loading = promise;
    const clear = () => { if (loading === promise) loading = null; };
    void promise.then(clear, clear);
    return promise;
}
