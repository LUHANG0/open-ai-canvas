import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { installChunkRecovery } from "@/lib/chunk-recovery";
import { bootstrapAppearance } from "@/services/appearance-bootstrap";
import { isIsolatedPrevisRepro } from "@/lib/dev-repro";

installChunkRecovery();

// Public and authenticated pages share one router; workspace startup is route-scoped.
if (/^\/welcome\/?$/.test(window.location.pathname)) window.location.replace(`/${window.location.hash || ""}`);
// The backend-free DEV lab must not make requests before AppProviders isolates it.
const appearanceReady = isIsolatedPrevisRepro(import.meta.env.DEV, window.location.pathname) ? Promise.resolve() : bootstrapAppearance();
void import("./application");
void appearanceReady.catch(() => undefined);
