import { describe, expect, it } from "vitest";
import { apiActorAt } from "./token-at";

describe("apiActorAt", () => {
    const d = (s: string) => new Date(s);
    const tokens = [
        { name: "City pages script", createdAt: d("2026-09-01"), revokedAt: null },
        { name: "Old bot", createdAt: d("2026-08-01"), revokedAt: d("2026-09-10") },
    ];
    it("names the only write token live at that moment", () => {
        expect(apiActorAt(tokens, d("2026-09-20"))).toBe("City pages script (API token)");
        expect(apiActorAt(tokens, d("2026-08-15"))).toBe("Old bot (API token)");
    });
    it("says API agent when it can't tell which token", () => {
        expect(apiActorAt(tokens, d("2026-09-05"))).toBe("API agent");
        expect(apiActorAt([], d("2026-09-05"))).toBe("API agent");
    });
});
