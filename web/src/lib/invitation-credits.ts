// Keep empty distinct from zero and convert decimal text without float rounding.
export function parseInvitationCredits(value: string | null): number | null {
    if (value === null || !/^\d+(?:\.\d{1,6})?$/.test(value)) return null;
    const [whole, fraction = ""] = value.split(".");
    const microcredits = BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
    if (microcredits > BigInt("1000000000000")) return null;
    return Number(microcredits);
}
export function invitationCreditsText(microcredits: number): string {
    const amount = BigInt(microcredits);
    const fraction = String(amount % BigInt(1_000_000)).padStart(6, "0").replace(/0+$/, "");
    return `${amount / BigInt(1_000_000)}${fraction ? `.${fraction}` : ""}`;
}
