import { describe, expect, it } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS, decryptSecret } from "@flowcms/shared";
import { PermissionsGuard } from "../auth/permissions.guard";
import { ContentEntriesService } from "./content-entries.service";
import { PREVIEW_TOKEN_TTL_SECONDS, mintPreviewToken, verifyPreviewToken } from "./preview-token";
import { ContentEntriesController } from "./content-entries.controller";

const S = "pvs_test_secret";
const NOW = Date.UTC(2026, 10, 26, 12, 0, 0);

describe("preview token", () => {
    const { token, exp } = mintPreviewToken(S, "ws", "service", "well-pump-repair", NOW);

    it("is <exp>.<sig>, one hour ahead", () => {
        expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
        expect(exp).toBe(Math.floor(NOW / 1000) + PREVIEW_TOKEN_TTL_SECONDS);
    });
    it("verifies for its own entry", () => {
        expect(verifyPreviewToken(S, "ws", "service", "well-pump-repair", token, NOW + 1000)).toBe(true);
    });
    it("rejects another slug, type, workspace or secret", () => {
        expect(verifyPreviewToken(S, "ws", "service", "other", token, NOW)).toBe(false);
        expect(verifyPreviewToken(S, "ws", "city", "well-pump-repair", token, NOW)).toBe(false);
        expect(verifyPreviewToken(S, "ws2", "service", "well-pump-repair", token, NOW)).toBe(false);
        expect(verifyPreviewToken("pvs_other", "ws", "service", "well-pump-repair", token, NOW)).toBe(false);
    });
    it("rejects an expired token", () => {
        expect(verifyPreviewToken(S, "ws", "service", "well-pump-repair", token, (exp + 1) * 1000)).toBe(false);
    });
    it("rejects a tampered token", () => {
        const [e, sig] = token.split(".");
        expect(verifyPreviewToken(S, "ws", "service", "well-pump-repair", `${Number(e) + 999}.${sig}`, NOW)).toBe(false);
        expect(verifyPreviewToken(S, "ws", "service", "well-pump-repair", `${e}.${sig.slice(0, -1)}A`, NOW)).toBe(false);
        expect(verifyPreviewToken(S, "ws", "service", "well-pump-repair", "garbage", NOW)).toBe(false);
        expect(verifyPreviewToken(S, "ws", "service", "well-pump-repair", "", NOW)).toBe(false);
    });
});

describe("preview token endpoint", () => {
    process.env.SECRETS_ENCRYPTION_KEY ||= "test-vault-key";
    const guard = new PermissionsGuard(new Reflector());
    const ctx = (user: unknown) =>
        ({ getHandler: () => ContentEntriesController.prototype.previewToken, getClass: () => ContentEntriesController, switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;
    const user = (permissions: string[]) => ({ role: { permissions } });

    it("refuses a request without a user or without content.read", () => {
        expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
        expect(() => guard.canActivate(ctx(user([PERMISSIONS.CONTENT_CREATE])))).toThrow(ForbiddenException);
        expect(guard.canActivate(ctx(user([PERMISSIONS.CONTENT_READ])))).toBe(true);
    });

    let stored: string | null = null;
    const secretOf = async () => decryptSecret(stored!);
    const run = (entry: unknown, allowed: string[] | null) => {
        const self = {
            prisma: {
                contentEntry: { findFirst: async () => entry },
                workspace: {
                    findUniqueOrThrow: async () => ({ previewSecretEnc: stored }),
                    update: async ({ data }: { data: { previewSecretEnc: string } }) => void (stored = data.previewSecretEnc),
                    // Sets only while empty, like the real conditional update
                    updateMany: async ({ data }: { data: { previewSecretEnc: string } }) => void (stored ??= data.previewSecretEnc),
                },
            },
            rbac: { allowedTypeIds: async () => allowed },
        };
        return ContentEntriesService.prototype.previewToken.call(self as never, "ws", "e1", {} as never);
    };
    const entry = { slug: "well-pump-repair", contentTypeId: "t1", contentType: { apiId: "services" }, workspace: { slug: "acme" } };

    it("mints a token bound to the entry's type and slug", async () => {
        const { token } = await run(entry, null);
        expect(token).toMatch(/^\d+\.[\w-]+$/);
        expect(verifyPreviewToken(await secretOf(), "acme", "services", "well-pump-repair", token)).toBe(true);
    });
    it("is not found for an entry outside the workspace, forbidden for a role that cannot read the type", async () => {
        await expect(run(null, null)).rejects.toBeInstanceOf(NotFoundException);
        await expect(run(entry, ["other"])).rejects.toBeInstanceOf(ForbiddenException);
    });
});
