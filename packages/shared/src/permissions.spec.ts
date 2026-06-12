import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, SYSTEM_ROLES } from "./permissions";

describe("can()", () => {
    it("grants an exact permission key match", () => {
        expect(can([PERMISSIONS.CONTENT_READ], PERMISSIONS.CONTENT_READ)).toBe(true);
    });

    it("grants everything when the wildcard '*' is present", () => {
        expect(can(["*"], PERMISSIONS.BILLING_MANAGE)).toBe(true);
        expect(can(["*"], "anything.at.all")).toBe(true);
    });

    it("denies a permission not in the granted set", () => {
        expect(can([PERMISSIONS.CONTENT_READ], PERMISSIONS.CONTENT_DELETE)).toBe(false);
    });

    it("fails closed for an empty granted set", () => {
        expect(can([], PERMISSIONS.CONTENT_READ)).toBe(false);
    });

    it("fails closed for null / undefined granted sets", () => {
        expect(can(null, PERMISSIONS.CONTENT_READ)).toBe(false);
        expect(can(undefined, PERMISSIONS.CONTENT_READ)).toBe(false);
    });
});

describe("SYSTEM_ROLES", () => {
    it("defines exactly the four expected role keys", () => {
        const keys = SYSTEM_ROLES.map((r) => r.key);
        expect(keys).toEqual(["super_admin", "admin", "search_strategist", "editor"]);
    });

    it("gives super_admin the wildcard", () => {
        const superAdmin = SYSTEM_ROLES.find((r) => r.key === "super_admin");
        expect(superAdmin?.permissions).toEqual(["*"]);
        expect(can(superAdmin?.permissions, PERMISSIONS.SECURITY_MANAGE)).toBe(true);
    });

    it("scopes the editor to content/media/ai/chat, never security or billing", () => {
        const editor = SYSTEM_ROLES.find((r) => r.key === "editor");
        expect(can(editor?.permissions, PERMISSIONS.CONTENT_CREATE)).toBe(true);
        expect(can(editor?.permissions, PERMISSIONS.SECURITY_MANAGE)).toBe(false);
        expect(can(editor?.permissions, PERMISSIONS.BILLING_MANAGE)).toBe(false);
        expect(can(editor?.permissions, PERMISSIONS.CONTENT_DELETE)).toBe(false);
    });

    it("every non-wildcard role only references known permission values", () => {
        const known = new Set<string>(Object.values(PERMISSIONS));
        for (const role of SYSTEM_ROLES) {
            for (const p of role.permissions) {
                if (p === "*") continue;
                expect(known.has(p)).toBe(true);
            }
        }
    });
});
