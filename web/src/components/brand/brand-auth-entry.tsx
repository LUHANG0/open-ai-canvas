import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { App } from "antd";
import { safeAuthNext } from "@/lib/auth-navigation";

export type BrandAuthMode = "login" | "register" | "forgot-password";
export const BrandAuthFlow = createContext<{ next: string; changeMode: (mode: BrandAuthMode) => void } | null>(null);
const BrandAuthEntry = createContext<{ open: (next: string) => void; pending: boolean } | null>(null);
let dialog: ReturnType<typeof importDialog> | undefined;
const importDialog = () => import("./brand-auth-dialog");
export const preloadBrandAuthDialog = () => dialog ??= importDialog().catch((error) => { dialog = undefined; throw error; });
export const useBrandAuthEntry = () => useContext(BrandAuthEntry);
export const useBrandAuthFlow = () => useContext(BrandAuthFlow);

export function BrandAuthProvider({ children }: { children: ReactNode }) {
    const [entry, setEntry] = useState<{ next: string } | null>(null);
    const [AuthDialog, setAuthDialog] = useState<Awaited<ReturnType<typeof importDialog>>["default"]>();
    const [pending, setPending] = useState(false);
    const request = useRef(0);
    const { message } = App.useApp();
    useEffect(() => () => { request.current++; }, []);
    const open = async (next: string) => {
        const id = ++request.current;
        setPending(true);
        try {
            const module = await preloadBrandAuthDialog();
            if (id !== request.current) return;
            setAuthDialog(() => module.default); setEntry({ next: safeAuthNext(next) });
        } catch { if (id === request.current) message.error("登录窗口暂时无法打开，请重试。"); }
        finally { if (id === request.current) setPending(false); }
    };
    return <BrandAuthEntry.Provider value={{ open: (next) => { void open(next); }, pending }}>
        {children}
        {entry && AuthDialog && <AuthDialog next={entry.next} onClosed={() => setEntry(null)} />}
    </BrandAuthEntry.Provider>;
}
