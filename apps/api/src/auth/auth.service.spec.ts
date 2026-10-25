import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authenticator } from "otplib";

vi.mock("@flowcms/shared", async (orig) => {
    const real = await orig<typeof import("@flowcms/shared")>();
    return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

import { encryptSecret, hashToken, verifyPassword } from "@flowcms/shared";
import { AuthService, LOCK_MS, MAX_FAILED_LOGINS, maskEmail } from "./auth.service";

process.env.SECRETS_ENCRYPTION_KEY = "test-vault-key-0123456789";

// Old-format (pre N=2^17) hash: fast to verify in tests, and should be upgraded on login.
function legacyHash(pw: string) {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`;
}

type U = Record<string, unknown> & { id: string; email: string };

function setup(overrides: Partial<U> = {}) {
    const user: U = {
        id: "u1",
        email: "a@x.com",
        passwordHash: legacyHash("right-password"),
        isActive: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
        failedLoginCount: 0,
        lockedUntil: null,
        totpLastStep: null,
        ...overrides,
    };
    let sessions: { id: string; userId: string; tokenHash: string; expiresAt: Date; createdAt: Date; lastSeenAt: Date | null; activeWorkspaceId: null }[] = [];
    const apply = (data: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === "object" && "increment" in v) user[k] = (user[k] as number) + (v as { increment: number }).increment;
            else user[k] = v;
        }
        return user;
    };
    const prisma = {
        user: {
            findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => (where.id === user.id || where.email === user.email ? { ...user } : null)),
            update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...apply(data) })),
            updateMany: vi.fn(async ({ where, data }: { where: { OR: [unknown, { totpLastStep: { lt: number } }] }; data: Record<string, unknown> }) => {
                const last = user.totpLastStep as number | null;
                if (last !== null && !(last < where.OR[1].totpLastStep.lt)) return { count: 0 };
                apply(data);
                return { count: 1 };
            }),
        },
        session: {
            create: vi.fn(async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
                sessions.push({ id: `s${sessions.length}`, createdAt: new Date(), lastSeenAt: new Date(), activeWorkspaceId: null, ...data });
            }),
            findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => sessions.find((s) => s.tokenHash === where.tokenHash) ?? null),
            update: vi.fn(async () => ({})),
            delete: vi.fn(async () => ({})),
            deleteMany: vi.fn(async ({ where }: { where: { userId: string; NOT?: { tokenHash: string } } }) => {
                sessions = sessions.filter((s) => s.userId !== where.userId || (where.NOT && s.tokenHash === where.NOT.tokenHash));
                return { count: 0 };
            }),
        },
        membership: {
            findFirst: vi.fn(async () => ({ workspaceId: "w1", user: { ...user }, role: { id: "r1", key: "editor", name: "Editor", permissions: [], dashboard: null, lockSeoMeta: false, allowedTypeIds: [] } })),
        },
    };
    const svc = new AuthService(prisma as never, {} as never, {} as never, { record: vi.fn() } as never);
    return { svc, user, prisma, sessions: () => sessions };
}

const signin = (svc: AuthService, password: string, code?: string) => svc.signin({ email: "a@x.com", password, code } as never);

describe("sign-in lockout", () => {
    it(`locks after ${MAX_FAILED_LOGINS} failures with the generic error, even for the right password`, async () => {
        const { svc, user } = setup();
        for (let i = 0; i < MAX_FAILED_LOGINS; i++) await expect(signin(svc, "wrong")).rejects.toThrow("Invalid email or password.");
        expect((user.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now() + LOCK_MS - 5_000);
        await expect(signin(svc, "right-password")).rejects.toThrow("Invalid email or password.");
    });

    it("unlocks after the lock expires and resets the count on success", async () => {
        const { svc, user } = setup({ failedLoginCount: 4, lockedUntil: new Date(Date.now() - 1000) });
        await signin(svc, "right-password");
        expect(user.failedLoginCount).toBe(0);
        expect(user.lockedUntil).toBeNull();
    });

    it("counts bad 2FA codes too", async () => {
        const secret = authenticator.generateSecret();
        const { svc, user } = setup({ twoFactorEnabled: true, twoFactorSecret: encryptSecret(secret) });
        await expect(signin(svc, "right-password", "000000")).rejects.toThrow();
        expect(user.failedLoginCount).toBe(1);
    });

    it("spends a scrypt verify on an unknown email (uniform timing)", async () => {
        const { svc } = setup();
        const before = vi.mocked(verifyPassword).mock.calls.length;
        await expect(svc.signin({ email: "nobody@x.com", password: "whatever" } as never)).rejects.toThrow("Invalid email or password.");
        expect(vi.mocked(verifyPassword).mock.calls.length - before).toBe(1);
    });

    it("rehashes an old-params hash on a good login", async () => {
        const { svc, user } = setup();
        await signin(svc, "right-password");
        expect(user.passwordHash).toMatch(/^scrypt\$N=131072,r=8,p=1\$/);
    });
});

describe("TOTP replay guard", () => {
    it("refuses the same code twice", async () => {
        const secret = authenticator.generateSecret();
        const { svc } = setup({ twoFactorEnabled: true, twoFactorSecret: encryptSecret(secret) });
        const code = authenticator.generate(secret);
        await expect(signin(svc, "right-password", code)).resolves.toHaveProperty("token");
        await expect(signin(svc, "right-password", code)).rejects.toThrow("Invalid verification code.");
    });
});

describe("sessions", () => {
    it("validate rejects an inactive user's session", async () => {
        const { svc, user } = setup();
        const { token } = (await signin(svc, "right-password")) as { token: string };
        expect(await svc.validate(token)).not.toBeNull();
        user.isActive = false;
        expect(await svc.validate(token)).toBeNull();
    });

    it("changePassword ends other sessions and keeps the current one", async () => {
        const { svc, sessions } = setup();
        const a = (await signin(svc, "right-password")) as { token: string };
        await signin(svc, "right-password");
        expect(sessions()).toHaveLength(2);
        await svc.changePassword("u1", "right-password", "a-brand-new-password", undefined, a.token);
        expect(sessions().map((s) => s.tokenHash)).toEqual([hashToken(a.token)]);
    });
});

describe("maskEmail", () => {
    it("masks the local part", () => {
        expect(maskEmail("jane.doe@domain.com")).toBe("j***@domain.com");
        expect(maskEmail("nope")).toBe("***");
    });
});
