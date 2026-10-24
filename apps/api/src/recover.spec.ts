import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@flowcms/shared";
import type { PrismaClient } from "@flowcms/db";
import { AuthService } from "./auth/auth.service";
import { applyEnvRecovery, issueRecoveryLink, setRecoveryPassword } from "./recover";

/** Just enough Prisma for the recovery path and AuthService.resetPassword. */
function fakeDb() {
    const user = { id: "u1", email: "admin@x.com", isActive: true, passwordHash: hashPassword("old-password-123"), memberships: [{ workspaceId: "w1" }] };
    const audits: { action: string; actorName?: string; metadata: Record<string, unknown> }[] = [];
    let sessions = 2;
    const db = {
        user: {
            findUnique: async ({ where }: { where: { id?: string; email?: string } }) => (where.id === user.id || where.email === user.email ? user : null),
            update: async ({ data }: { data: { passwordHash: string } }) => Object.assign(user, data),
        },
        session: { deleteMany: async () => ((sessions = 0), { count: 2 }) },
        membership: { findFirst: async () => ({ workspaceId: "w1" }) },
        auditLog: {
            create: async ({ data }: { data: (typeof audits)[number] }) => audits.push(data),
            findFirst: async ({ where }: { where: { metadata: { equals: string } } }) => audits.find((a) => a.metadata.marker === where.metadata.equals) ?? null,
        },
    };
    return { db, prisma: db as unknown as PrismaClient, user, audits, sessions: () => sessions };
}

describe("admin recovery", () => {
    it("prints a link that the normal reset flow accepts once", async () => {
        const { prisma, user, audits, sessions } = fakeDb();
        const link = await issueRecoveryLink(prisma, "Admin@X.com");
        const token = new URL(link).searchParams.get("token")!;
        // A drift from signResetToken's format makes this reset fail.
        const auth = new AuthService(prisma as never, {} as never, {} as never, { record: () => {} } as never);
        await expect(auth.resetPassword(token, "brand-new-password-1")).resolves.toEqual({ ok: true });
        expect(verifyPassword("brand-new-password-1", user.passwordHash)).toBe(true);
        expect(sessions()).toBe(0);
        expect(audits[0]).toMatchObject({ action: "auth.password_reset_cli", actorName: "Server recovery (CLI)" });
        await expect(auth.resetPassword(token, "another-password-12")).rejects.toThrow(/already been used/);
    });

    it("sets a password directly and refuses short or unknown input", async () => {
        const { prisma, user } = fakeDb();
        await expect(setRecoveryPassword(prisma, "admin@x.com", "short", "cli")).rejects.toThrow(/12 characters/);
        await expect(setRecoveryPassword(prisma, "nobody@x.com", "long-enough-pass", "cli")).rejects.toThrow(/No user/);
        await setRecoveryPassword(prisma, "admin@x.com", "long-enough-pass", "cli");
        expect(verifyPassword("long-enough-pass", user.passwordHash)).toBe(true);
    });

    it("applies the env fallback once per password", async () => {
        const { prisma, user, audits } = fakeDb();
        const log = { warn: () => {}, error: (m: string) => { throw new Error(m); } };
        process.env.FLOWCMS_RECOVERY_EMAIL = "admin@x.com";
        process.env.FLOWCMS_RECOVERY_PASSWORD = "env-password-1234";
        try {
            await applyEnvRecovery(prisma, log);
            expect(verifyPassword("env-password-1234", user.passwordHash)).toBe(true);
            user.passwordHash = hashPassword("changed-after-login"); // the admin changes it in Studio
            await applyEnvRecovery(prisma, log); // a restart with the vars still set
            expect(verifyPassword("changed-after-login", user.passwordHash)).toBe(true);
            expect(audits).toHaveLength(1);
        } finally {
            delete process.env.FLOWCMS_RECOVERY_EMAIL;
            delete process.env.FLOWCMS_RECOVERY_PASSWORD;
        }
    });
});
