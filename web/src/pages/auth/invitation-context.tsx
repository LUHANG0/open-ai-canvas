import { createContext, useContext } from "react";
import type { getAuthSettings } from "@/services/api/auth";

export const RegistrationInvitationContext = createContext<{
    code: string;
    bonusMicrocredits: number;
    settings: Awaited<ReturnType<typeof getAuthSettings>>;
    reload: () => void;
} | null>(null);
export const useRegistrationInvitation = () => useContext(RegistrationInvitationContext);
