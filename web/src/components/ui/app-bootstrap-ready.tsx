import { useLayoutEffect } from "react";

/** Reveal the committed React shell and remove the pre-JavaScript loading cover together. */
export function AppBootstrapReady() {
    useLayoutEffect(() => {
        document.documentElement.classList.remove("app-initializing", "app-boot-brand");
        document.getElementById("app-boot-screen")?.remove();
    }, []);
    return null;
}
