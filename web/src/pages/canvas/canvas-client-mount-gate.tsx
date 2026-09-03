import { useEffect, useState, type ReactNode } from "react";

import { CanvasRefreshShell } from "./canvas-refresh-shell";

type CanvasClientMountGateProps = {
    children: ReactNode;
};

export function CanvasClientMountGate({ children }: CanvasClientMountGateProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return children;
}
