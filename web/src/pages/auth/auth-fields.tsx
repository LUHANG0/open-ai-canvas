import type { ReactNode } from "react";

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="pc-auth-field block space-y-2">
            <span className="pc-auth-field-label">{label}</span>
            {children}
        </label>
    );
}

export function LinuxDOIcon() {
    return (
        <span
            aria-hidden
            className="size-5 shrink-0 rounded-full"
            style={{
                background: "linear-gradient(to bottom, #1d1d1f 0 33.333%, #efefef 33.333% 66.666%, #feb005 66.666% 100%)",
                boxShadow: "0 0 0 1px rgba(255,255,255,.14)",
            }}
        />
    );
}
