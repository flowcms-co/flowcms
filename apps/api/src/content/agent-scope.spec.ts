import { describe, it, expect } from "vitest";
import { tokenScopeAllows } from "./agent-scope";

/**
 * Locks the agent-token scope authorization semantics, including the critical
 * back-compat rule: tokens created before scoping (empty scopes) stay unrestricted.
 */
describe("tokenScopeAllows", () => {
    it("allows everything when scopes are empty (back-compat)", () => {
        expect(tokenScopeAllows([], "content.publish")).toBe(true);
        expect(tokenScopeAllows([], "content.delete")).toBe(true);
    });

    it("allows everything when scopes are absent / not an array", () => {
        expect(tokenScopeAllows(undefined, "content.publish")).toBe(true);
        expect(tokenScopeAllows(null, "content.create")).toBe(true);
        expect(tokenScopeAllows("oops" as unknown, "content.create")).toBe(true);
    });

    it("grants all with the wildcard scope", () => {
        expect(tokenScopeAllows(["*"], "content.delete")).toBe(true);
        expect(tokenScopeAllows(["*"], "content.publish")).toBe(true);
    });

    it("enforces a non-empty scope list", () => {
        expect(tokenScopeAllows(["content.read"], "content.read")).toBe(true);
        expect(tokenScopeAllows(["content.read"], "content.publish")).toBe(false);
        expect(tokenScopeAllows(["content.create", "content.update"], "content.update")).toBe(true);
        expect(tokenScopeAllows(["content.create", "content.update"], "content.delete")).toBe(false);
    });
});
