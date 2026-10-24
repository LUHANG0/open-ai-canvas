import { expect, test } from "bun:test";
import { invitationCreditsText, parseInvitationCredits } from "../src/lib/invitation-credits";

test("invitation amounts retain six-decimal precision and distinguish empty from zero", () => {
    for (const invalid of [null, "", "-1", "0.0000001", "1000000.000001", "1e2", "abc"]) expect(parseInvitationCredits(invalid)).toBeNull();
    for (const [text, amount] of [["0", 0], ["0.000001", 1], ["123.456789", 123456789], ["1000000", 1000000000000]] as const) {
        expect(parseInvitationCredits(text)).toBe(amount);
        expect(invitationCreditsText(amount)).toBe(text);
    }
});
