import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Optional,
    UnauthorizedException,
} from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { decryptSecret, encryptSecret, generateToken, hashPassword, hashToken, verifyPassword } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { AvatarsService } from "../avatars/avatars.service";
import { AuditService } from "../audit/audit.service";
import { SESSION_IDLE_TTL_MS, SESSION_TTL_MS } from "./constants";
import { SigninDto, SignupDto, UpdateAvatarDto } from "./dto";
import { SESSION_POLICY_PORT, type SessionPolicyPort } from "./session-policy.port";
import type { AuthUser } from "./types";

const STUDIO = process.env.STUDIO_URL ?? "http://localhost:3000";
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Accept the previous/current/next TOTP step (±30s) to tolerate clock skew and
// the few seconds between reading a code and submitting it.
authenticator.options = { window: 1 };

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly avatars: AvatarsService,
        private readonly audit: AuditService,
        // EE `ip_policies`: IP allowlist + session policy. Absent (unenforced) in Community.
        @Optional() @Inject(SESSION_POLICY_PORT) private readonly sessionPolicy?: SessionPolicyPort,
    ) {}

    private async primaryWorkspaceId(userId: string): Promise<string | null> {
        const m = await this.prisma.membership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { workspaceId: true } });
        return m?.workspaceId ?? null;
    }

    /** Best-effort auth audit (no-ops if the user has no workspace yet). Never
     *  throws into the caller — a logging failure must not break the action it
     *  records (e.g. a transient DB error during the workspace lookup must not
     *  turn a successful signin into a 500). */
    private async auditAuth(userId: string, action: string, ip?: string, metadata?: Record<string, unknown>) {
        try {
            const workspaceId = await this.primaryWorkspaceId(userId);
            if (workspaceId) this.audit.record({ workspaceId, userId, action, resource: "User", resourceId: userId, ip, metadata });
        } catch {
            /* audit is best-effort */
        }
    }

    /** Update the current user's avatar vibe (style / presentation / color). */
    async updateAvatar(userId: string, dto: UpdateAvatarDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
        const profile = this.avatars.profileFrom({ style: dto.avatarStyle, gender: dto.gender, bg: dto.avatarBg, name: user?.name ?? null, email: user?.email ?? "" });
        await this.prisma.user.update({ where: { id: userId }, data: profile });
        return this.buildAuthUser(userId);
    }

    /** Update the signed-in user's display name + job title. */
    async updateProfile(userId: string, dto: { name?: string; title?: string }) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(dto.name !== undefined ? { name: dto.name.trim() || null } : {}),
                ...(dto.title !== undefined ? { title: dto.title.trim() || null } : {}),
            },
        });
        return this.buildAuthUser(userId);
    }

    /** Change the signed-in user's password, verifying the current one first. */
    async changePassword(userId: string, current: string, next: string, ip?: string) {
        if (!next || next.length < 12) throw new BadRequestException("New password must be at least 12 characters.");
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
        if (!user?.passwordHash || !verifyPassword(current, user.passwordHash)) {
            throw new BadRequestException("Your current password is incorrect.");
        }
        await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(next) } });
        await this.auditAuth(userId, "auth.password_changed", ip);
        return { ok: true };
    }

    /** Read the signed-in user's email-notification preferences. */
    async getNotificationPrefs(userId: string) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true, digestFrequency: true } });
        return { prefs: (u?.notificationPrefs ?? {}) as Record<string, boolean>, digestFrequency: u?.digestFrequency ?? "off" };
    }

    /** Persist per-event email toggles + (optionally) the digest frequency. */
    async setNotificationPrefs(userId: string, prefs: Record<string, boolean>, digestFrequency?: string) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                notificationPrefs: prefs as object,
                ...(digestFrequency && ["off", "daily", "weekly"].includes(digestFrequency) ? { digestFrequency } : {}),
            },
        });
        return { ok: true };
    }

    /** Delete the signed-in user's own account (password-confirmed). Refuses if
     *  they're the last owner of a workspace, so nothing is orphaned. */
    async deleteAccount(userId: string, password: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
        if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
            throw new BadRequestException("Password is incorrect.");
        }
        const owned = await this.prisma.membership.findMany({ where: { userId, role: { key: "super_admin" } }, select: { workspaceId: true } });
        for (const m of owned) {
            const owners = await this.prisma.membership.count({ where: { workspaceId: m.workspaceId, role: { key: "super_admin" } } });
            if (owners <= 1) {
                throw new BadRequestException("You're the only owner of a workspace. Transfer ownership or delete the workspace first.");
            }
        }
        // Deactivate + anonymize rather than hard-delete: a hard delete cascades the
        // user's Sessions and nulls their AuditLog rows, letting an insider erase their
        // own trail (SECURITY_AUDIT_REPORT F-04). The row is kept (audit integrity);
        // the email is released + scrubbed of PII and the login disabled.
        await this.prisma.session.deleteMany({ where: { userId } });
        await this.prisma.membership.deleteMany({ where: { userId } });
        await this.prisma.user.update({
            where: { id: userId },
            data: { isActive: false, email: `deleted_${userId}@deleted.invalid`, name: null, passwordHash: null, twoFactorSecret: null, twoFactorEnabled: false, twoFactorBackupCodes: [] },
        });
        return { ok: true };
    }

    private async defaultWorkspace() {
        const ws = await this.prisma.workspace.findUnique({ where: { slug: "default" } });
        if (!ws) {
            throw new InternalServerErrorException(
                "Default workspace not found. Run `npm run db:seed`.",
            );
        }
        return ws;
    }

    async signup(dto: SignupDto, meta?: { userAgent?: string; ip?: string }) {
        // Public self-registration is OFF by default (SECURITY_AUDIT_REPORT F-02):
        // every signup landed as an editor with media.manage + content.create, which
        // is an open door on a public CMS. Operators who want open signup opt in with
        // SIGNUP_ENABLED=true; otherwise users are added via admin invite, and the
        // very first admin is created through the /setup/welcome first-run flow.
        if (process.env.SIGNUP_ENABLED !== "true") {
            throw new ForbiddenException("Public registration is disabled. Ask an admin to invite you.");
        }
        const email = dto.email.toLowerCase().trim();
        if (await this.prisma.user.findUnique({ where: { email } })) {
            throw new ConflictException("An account with this email already exists.");
        }
        const ws = await this.defaultWorkspace();
        // New public signups land as Editors; an admin can elevate them later.
        const role = await this.prisma.role.findUnique({
            where: { workspaceId_key: { workspaceId: ws.id, key: "editor" } },
        });
        if (!role) {
            throw new InternalServerErrorException("Default role missing. Run `npm run db:seed`.");
        }
        const avatar = this.avatars.profileFrom({ style: dto.avatarStyle, gender: dto.gender, bg: dto.avatarBg, name: dto.name ?? null, email });
        const user = await this.prisma.user.create({
            data: {
                email,
                name: dto.name ?? null,
                passwordHash: hashPassword(dto.password),
                ...avatar,
                memberships: { create: { workspaceId: ws.id, roleId: role.id } },
            },
        });
        const token = await this.createSession(user.id, meta);
        return { token, user: await this.buildAuthUser(user.id) };
    }

    async signin(
        dto: SigninDto,
        meta?: { userAgent?: string; ip?: string },
    ): Promise<{ token: string; user: AuthUser } | { twoFactorRequired: true }> {
        const email = dto.email.toLowerCase().trim();
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash || !verifyPassword(dto.password, user.passwordHash)) {
            if (user) await this.auditAuth(user.id, "auth.signin_failed", meta?.ip, { reason: "bad_password" });
            throw new UnauthorizedException("Invalid email or password.");
        }
        if (!user.isActive) {
            await this.auditAuth(user.id, "auth.signin_failed", meta?.ip, { reason: "disabled" });
            throw new UnauthorizedException("This account is disabled.");
        }
        // Enterprise (ip_policies): refuse sign-in from a disallowed network up front,
        // so a blocked IP gets a clear message instead of a session it can't use.
        if (this.sessionPolicy) {
            const wsId = await this.primaryWorkspaceId(user.id);
            if (wsId) await this.sessionPolicy.assertRequestAllowed(wsId, { ip: meta?.ip, sessionCreatedAt: new Date(), lastSeenAt: new Date() });
        }
        // Second factor: ask for a code, then verify it (TOTP or a backup code).
        if (user.twoFactorEnabled) {
            if (!dto.code) return { twoFactorRequired: true };
            if (!(await this.verifyTwoFactor(user, dto.code))) {
                await this.auditAuth(user.id, "auth.signin_failed", meta?.ip, { reason: "bad_2fa" });
                throw new UnauthorizedException("Invalid verification code.");
            }
        }
        const token = await this.createSession(user.id, meta);
        await this.auditAuth(user.id, "auth.signin", meta?.ip, user.twoFactorEnabled ? { mfa: true } : undefined);
        return { token, user: await this.buildAuthUser(user.id) };
    }

    /** Build the public AuthUser shape for a user id. Thin public wrapper around
     *  buildAuthUser so other modules (e.g. the first-run setup claim) can return
     *  the same user payload the auth controller does. */
    async getAuthUser(userId: string, preferredWorkspaceId?: string | null): Promise<AuthUser> {
        return this.buildAuthUser(userId, preferredWorkspaceId);
    }

    async createSession(userId: string, meta?: { userAgent?: string; ip?: string }) {
        const { token, hash } = generateToken("sess");
        await this.prisma.session.create({
            data: {
                userId,
                tokenHash: hash,
                expiresAt: new Date(Date.now() + SESSION_TTL_MS),
                userAgent: meta?.userAgent,
                ip: meta?.ip,
            },
        });
        return token;
    }

    async validate(token: string, ip?: string): Promise<AuthUser | null> {
        const session = await this.prisma.session.findUnique({
            where: { tokenHash: hashToken(token) },
        });
        if (!session || session.expiresAt < new Date()) return null;
        let user: AuthUser;
        try {
            user = await this.buildAuthUser(session.userId, session.activeWorkspaceId);
        } catch {
            return null;
        }
        // Enterprise (ip_policies): IP allowlist + session age/idle. The port throws
        // (403 IP / 401 expired-idle) on violation — propagates to the guard as the
        // right status. No-op unless licensed. (Runs outside the try/catch so its
        // ForbiddenException isn't swallowed into a generic 401.)
        const now = Date.now();
        if (this.sessionPolicy) {
            await this.sessionPolicy.assertRequestAllowed(user.workspaceId, {
                ip,
                sessionCreatedAt: session.createdAt,
                lastSeenAt: session.lastSeenAt,
            });
        } else if (session.lastSeenAt && now - session.lastSeenAt.getTime() > SESSION_IDLE_TTL_MS) {
            // Community idle expiry (F-12). EE ip_policies handles this above when licensed.
            await this.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
            return null;
        }
        // Track activity (throttled to one write/minute) so the idle check above and
        // the EE session policy both have a fresh lastSeenAt.
        if (!session.lastSeenAt || now - session.lastSeenAt.getTime() > 60_000) {
            void this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
        }
        return user;
    }

    async signout(token: string) {
        const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, select: { userId: true } });
        await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
        if (session) await this.auditAuth(session.userId, "auth.signout");
    }

    /** Email a password-reset link. Always returns ok (never reveals if the email exists). */
    async forgotPassword(email: string) {
        const e = email.toLowerCase().trim();
        const user = await this.prisma.user.findUnique({
            where: { email: e },
            include: { memberships: { take: 1 } },
        });
        const membership = user?.memberships[0];
        if (user && membership) {
            // Bind the token to the current password (fingerprint). Once the password
            // changes, the fingerprint stops matching → the link is single-use and any
            // older outstanding links are invalidated too.
            const fp = user.passwordHash ? hashToken(user.passwordHash).slice(0, 16) : "none";
            const token = this.signResetToken({ uid: user.id, exp: Date.now() + RESET_TTL_MS, fp });
            const ws = await this.prisma.workspace.findUnique({ where: { id: membership.workspaceId }, select: { name: true } });
            await this.mail.sendTemplate(membership.workspaceId, "reset_password", e, {
                name: user.name ?? "there",
                workspace: ws?.name ?? "Flow CMS",
                link: `${STUDIO}/reset-password?token=${token}`,
            });
        }
        return { ok: true };
    }

    /** Secret for password-reset token HMAC. Prefers JWT_SECRET (so reset tokens
     *  no longer share the secrets-vault key — a vault-key leak can't forge reset
     *  links, SECURITY_AUDIT_REPORT F-05 — and JWT_SECRET is finally used, F-06).
     *  Falls back to the vault key only if JWT_SECRET is unset (dev). */
    private resetSecret(): string {
        return process.env.JWT_SECRET || process.env.SECRETS_ENCRYPTION_KEY || "flowcms.dev.reset";
    }

    /** Sign a reset payload: base64url(json).base64url(HMAC-SHA256). Tamper-evident
     *  and non-forgeable without the secret (vs. the old reversible encryption). */
    private signResetToken(payload: { uid: string; exp: number; fp: string }): string {
        const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
        const sig = createHmac("sha256", this.resetSecret()).update(body).digest("base64url");
        return `${body}.${sig}`;
    }

    private verifyResetToken(token: string): { uid?: string; exp?: number; fp?: string } | null {
        const dot = token.indexOf(".");
        if (dot < 0) return null;
        const body = token.slice(0, dot);
        const sig = token.slice(dot + 1);
        const expected = createHmac("sha256", this.resetSecret()).update(body).digest("base64url");
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
        try {
            return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        } catch {
            return null;
        }
    }

    /** Consume a reset token + set a new password (invalidates all sessions). */
    async resetPassword(token: string, newPassword: string) {
        const payload = this.verifyResetToken(token);
        if (!payload) {
            throw new BadRequestException("Invalid or expired reset link.");
        }
        if (!payload.uid || !payload.exp || payload.exp < Date.now()) {
            throw new BadRequestException("This reset link has expired. Request a new one.");
        }
        if (newPassword.length < 12) throw new BadRequestException("Password must be at least 12 characters.");
        // Single-use check: the fingerprint must still match the user's current
        // password. After any reset the hash changes, so a used/old link fails here.
        const target = await this.prisma.user.findUnique({ where: { id: payload.uid }, select: { passwordHash: true } });
        const fp = target?.passwordHash ? hashToken(target.passwordHash).slice(0, 16) : "none";
        if ((payload.fp ?? "") !== fp) {
            throw new BadRequestException("This reset link has already been used or expired. Request a new one.");
        }
        await this.prisma.user.update({ where: { id: payload.uid }, data: { passwordHash: hashPassword(newPassword) } });
        await this.prisma.session.deleteMany({ where: { userId: payload.uid } });
        await this.auditAuth(payload.uid, "auth.password_reset");
        return { ok: true };
    }

    // ─── Two-factor authentication (TOTP) ────────────────────────────────────

    /** Begin enrolment: make a secret (stored encrypted, not yet active) + a QR. */
    async startTwoFactor(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user) throw new UnauthorizedException();
        const secret = authenticator.generateSecret();
        await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: encryptSecret(secret) } });
        const otpauth = authenticator.keyuri(user.email, "Flow CMS", secret);
        const qr = await QRCode.toDataURL(otpauth);
        return { secret, otpauth, qr };
    }

    /** Confirm a code against the pending secret, activate 2FA, return backup codes once. */
    async enableTwoFactor(userId: string, code: string, ip?: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user?.twoFactorSecret) throw new BadRequestException("Start 2FA setup first.");
        if (user.twoFactorEnabled) throw new BadRequestException("Two-factor is already enabled.");
        const secret = decryptSecret(user.twoFactorSecret);
        if (!authenticator.verify({ token: code.replace(/\D/g, ""), secret })) {
            throw new BadRequestException("That code didn't match. Check your authenticator app and try again.");
        }
        const { plain, hashed } = this.makeBackupCodes();
        await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, twoFactorBackupCodes: hashed } });
        await this.auditAuth(userId, "auth.2fa_enabled", ip);
        return { enabled: true, backupCodes: plain };
    }

    /** Turn 2FA off — requires a current code (TOTP or backup), then wipes the secret. */
    async disableTwoFactor(userId: string, code: string, ip?: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user?.twoFactorEnabled) {
            // Clear any abandoned pending-enrolment secret so it doesn't linger.
            if (user?.twoFactorSecret) await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: null } });
            return { enabled: false };
        }
        if (!(await this.verifyTwoFactor(user, code))) throw new BadRequestException("Invalid verification code.");
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
        });
        await this.auditAuth(userId, "auth.2fa_disabled", ip);
        return { enabled: false };
    }

    /** Issue a fresh set of backup codes (invalidates the old ones); requires a code. */
    async regenerateBackupCodes(userId: string, code: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user?.twoFactorEnabled) throw new BadRequestException("Two-factor is not enabled.");
        if (!(await this.verifyTwoFactor(user, code))) throw new BadRequestException("Invalid verification code.");
        const { plain, hashed } = this.makeBackupCodes();
        await this.prisma.user.update({ where: { id: userId }, data: { twoFactorBackupCodes: hashed } });
        await this.auditAuth(userId, "auth.2fa_backup_regenerated");
        return { backupCodes: plain };
    }

    /** True if `code` is a valid TOTP for the secret OR an unused backup code (which it then consumes). */
    private async verifyTwoFactor(
        user: { id: string; twoFactorSecret: string | null; twoFactorBackupCodes: unknown },
        code: string,
    ): Promise<boolean> {
        const cleaned = code.replace(/[^a-zA-Z0-9]/g, "");
        if (user.twoFactorSecret) {
            try {
                if (authenticator.verify({ token: cleaned.replace(/\D/g, ""), secret: decryptSecret(user.twoFactorSecret) })) return true;
            } catch {
                /* fall through to backup codes */
            }
        }
        // Backup code: consume atomically so two concurrent logins can't both
        // spend the same one-time code (serializable txn — the loser aborts).
        const h = hashToken(cleaned.toUpperCase());
        try {
            return await this.prisma.$transaction(
                async (tx) => {
                    const fresh = await tx.user.findUnique({ where: { id: user.id }, select: { twoFactorBackupCodes: true } });
                    const codes = (fresh?.twoFactorBackupCodes as string[]) ?? [];
                    const idx = codes.indexOf(h);
                    if (idx < 0) return false;
                    codes.splice(idx, 1);
                    await tx.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: codes } });
                    return true;
                },
                { isolationLevel: "Serializable" },
            );
        } catch {
            return false; // serialization conflict → the other request already spent it
        }
    }

    private makeBackupCodes(): { plain: string[]; hashed: string[] } {
        // 64-bit codes (16 hex chars) — well beyond brute-forcing under the per-IP throttle.
        const plain = Array.from({ length: 10 }, () => randomBytes(8).toString("hex").toUpperCase());
        return { plain, hashed: plain.map((c) => hashToken(c)) };
    }

    private async buildAuthUser(userId: string, preferredWorkspaceId?: string | null): Promise<AuthUser> {
        // Resolve the active workspace: the session's chosen one when the user is
        // genuinely a member of it (a switched workspace), otherwise their first
        // membership. Re-validating membership here means a stale activeWorkspaceId
        // (e.g. access was revoked) safely falls back instead of leaking.
        const membership =
            (preferredWorkspaceId
                ? await this.prisma.membership.findFirst({
                      where: { userId, workspaceId: preferredWorkspaceId },
                      include: { user: true, role: true },
                  })
                : null) ??
            (await this.prisma.membership.findFirst({
                where: { userId },
                orderBy: { createdAt: "asc" }, // deterministic: the user's primary (oldest) workspace
                include: { user: true, role: true },
            }));
        if (!membership) throw new UnauthorizedException("No workspace membership.");
        const { user, role } = membership;
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            title: user.title,
            avatarUrl: user.avatarUrl,
            avatarStyle: user.avatarStyle,
            avatarBg: user.avatarBg,
            twoFactorEnabled: user.twoFactorEnabled,
            workspaceId: membership.workspaceId,
            role: {
                id: role.id,
                key: role.key,
                name: role.name,
                permissions: (role.permissions as string[]) ?? [],
                dashboard: role.dashboard,
                lockSeoMeta: role.lockSeoMeta,
                allowedTypeIds: (role.allowedTypeIds as string[]) ?? [],
            },
        };
    }
}
