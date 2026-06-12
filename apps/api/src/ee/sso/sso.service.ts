import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { decryptSecret, encryptSecret, generateToken } from "@flowcms/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { LicenseService } from "../../license/license.service";
import { SESSION_TTL_MS } from "../../auth/constants";
import { safeFetch } from "../../common/ssrf";

const b64urlJson = (s: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
const ALG: Record<string, string> = { RS256: "RSA-SHA256", RS384: "RSA-SHA384", RS512: "RSA-SHA512" };

/** Thrown when an SSO login resolves to a user with Flow 2FA enabled but the IdP
 *  did not assert a second factor — the controller maps this to a specific message
 *  instead of the generic SSO failure (SECURITY_AUDIT_REPORT F-16). */
export class SsoTwoFactorRequiredError extends UnauthorizedException {
    constructor() {
        super("Two-factor authentication is required. Sign in with your email and password.");
    }
}

type SetSsoDto = {
    enabled?: boolean;
    issuer?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    jwksUri?: string;
    clientId?: string;
    clientSecret?: string;
    autoProvision?: boolean;
    allowedDomain?: string;
};

/**
 * EE (Enterprise) — OIDC single sign-on. Stores a per-workspace OIDC config
 * (clientSecret AES-encrypted), builds the authorize redirect, and on callback
 * exchanges the code, verifies the id_token (signature via the IdP's JWKS + iss /
 * aud / exp), then finds or provisions the Flow user and mints a session. All gated
 * by `sso`.
 */
@Injectable()
export class SsoService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly license: LicenseService,
    ) {}

    async getConfig(workspaceId: string) {
        const c = await this.prisma.ssoConfig.findUnique({ where: { workspaceId } });
        return {
            enabled: c?.enabled ?? false,
            issuer: c?.issuer ?? "",
            authorizationUrl: c?.authorizationUrl ?? "",
            tokenUrl: c?.tokenUrl ?? "",
            jwksUri: c?.jwksUri ?? "",
            clientId: c?.clientId ?? "",
            clientSecretSet: !!c?.clientSecret, // never return the secret
            autoProvision: c?.autoProvision ?? false,
            allowedDomain: c?.allowedDomain ?? "",
        };
    }

    async setConfig(workspaceId: string, dto: SetSsoDto) {
        const data: Record<string, unknown> = {};
        const s = (v?: string) => (typeof v === "string" ? v.trim() || null : undefined);
        if (dto.enabled !== undefined) data.enabled = !!dto.enabled;
        if (dto.issuer !== undefined) data.issuer = s(dto.issuer);
        if (dto.authorizationUrl !== undefined) data.authorizationUrl = s(dto.authorizationUrl);
        if (dto.tokenUrl !== undefined) data.tokenUrl = s(dto.tokenUrl);
        if (dto.jwksUri !== undefined) data.jwksUri = s(dto.jwksUri);
        if (dto.clientId !== undefined) data.clientId = s(dto.clientId);
        if (dto.autoProvision !== undefined) data.autoProvision = !!dto.autoProvision;
        if (dto.allowedDomain !== undefined) data.allowedDomain = s(dto.allowedDomain)?.toLowerCase().replace(/^@/, "") ?? null;
        // Only overwrite the secret when a new non-empty value is provided.
        if (dto.clientSecret && dto.clientSecret.trim()) data.clientSecret = encryptSecret(dto.clientSecret.trim());
        await this.prisma.ssoConfig.upsert({ where: { workspaceId }, update: data, create: { workspaceId, ...data } });
        return this.getConfig(workspaceId);
    }

    /** Resolve which workspace an SSO login targets: an explicit slug, else the
     *  first workspace with SSO enabled (single-tenant installs need no slug). */
    private async resolveWorkspace(slug?: string) {
        if (slug) return this.prisma.workspace.findUnique({ where: { slug }, select: { id: true, slug: true } });
        const c = await this.prisma.ssoConfig.findFirst({ where: { enabled: true }, select: { workspace: { select: { id: true, slug: true } } } });
        return c?.workspace ?? null;
    }

    /** Is SSO usable right now (enabled, configured, licensed)? Slug optional. */
    async availableFor(slug?: string) {
        if (!(await this.license.has("sso"))) return { available: false, slug: slug ?? null };
        const ws = await this.resolveWorkspace(slug);
        if (!ws) return { available: false, slug: slug ?? null };
        const c = await this.prisma.ssoConfig.findUnique({ where: { workspaceId: ws.id } });
        const ok = !!(c?.enabled && c.authorizationUrl && c.clientId && c.tokenUrl);
        return { available: ok, slug: ws.slug };
    }

    /** Build the OIDC authorize redirect. Returns the URL + the resolved slug
     *  (so the caller can pin it in a cookie for the callback). Throws if not ready. */
    async authorizeUrl(slug: string | undefined, state: string, redirectUri: string) {
        if (!(await this.license.has("sso"))) throw new BadRequestException("SSO is not enabled.");
        const ws = await this.resolveWorkspace(slug);
        if (!ws) throw new BadRequestException("SSO is not configured.");
        const c = await this.prisma.ssoConfig.findUnique({ where: { workspaceId: ws.id } });
        if (!c?.enabled || !c.authorizationUrl || !c.clientId) throw new BadRequestException("SSO is not configured for this workspace.");
        const u = new URL(c.authorizationUrl);
        u.searchParams.set("response_type", "code");
        u.searchParams.set("client_id", c.clientId);
        u.searchParams.set("redirect_uri", redirectUri);
        u.searchParams.set("scope", "openid email profile");
        u.searchParams.set("state", state);
        return { url: u.toString(), slug: ws.slug };
    }

    /** Complete the OIDC login: exchange code, verify the id_token, find/provision
     *  the user, and create a session. Returns the raw session token. */
    async completeLogin(slug: string, code: string, redirectUri: string, meta?: { userAgent?: string; ip?: string }) {
        if (!(await this.license.has("sso"))) throw new UnauthorizedException("SSO is not enabled.");
        const ws = await this.resolveWorkspace(slug);
        if (!ws) throw new UnauthorizedException("Unknown workspace.");
        const c = await this.prisma.ssoConfig.findUnique({ where: { workspaceId: ws.id } });
        if (!c?.enabled || !c.tokenUrl || !c.clientId || !c.clientSecret) throw new UnauthorizedException("SSO is not configured.");

        // 1. Exchange the authorization code (back-channel, authenticated with the secret).
        // safeFetch pins the validated public IP and re-validates redirects, so an
        // admin-configured tokenUrl can't be pointed at an internal/metadata host.
        const tokenRes = await safeFetch(c.tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
                client_id: c.clientId,
                client_secret: decryptSecret(c.clientSecret),
            }).toString(),
        });
        if (!tokenRes.ok) throw new UnauthorizedException("SSO token exchange failed.");
        const tokens = (await tokenRes.json()) as { id_token?: string };
        if (!tokens.id_token) throw new UnauthorizedException("No id_token from the identity provider.");

        // 2. Verify the id_token (signature + iss / aud / exp).
        const payload = await this.verifyIdToken(tokens.id_token, { issuer: c.issuer, jwksUri: c.jwksUri, clientId: c.clientId });
        const email = String(payload.email ?? "").toLowerCase().trim();
        if (!email) throw new UnauthorizedException("The identity provider didn't return an email.");
        const name = (payload.name as string) || (payload.given_name ? `${payload.given_name} ${payload.family_name ?? ""}`.trim() : null);

        // 3. Find the user (must be a member) or auto-provision (if allowed for the domain).
        let user = await this.prisma.user.findUnique({ where: { email } });
        let member = user ? await this.prisma.membership.findFirst({ where: { userId: user.id, workspaceId: ws.id } }) : null;
        if (!member) {
            const domainOk = !c.allowedDomain || email.endsWith(`@${c.allowedDomain}`);
            if (!c.autoProvision || !domainOk) throw new UnauthorizedException("No access for this account. Ask an admin to invite you.");
            if (!user) user = await this.prisma.user.create({ data: { email, name, emailVerifiedAt: new Date() } });
            const editor = await this.prisma.role.findUnique({ where: { workspaceId_key: { workspaceId: ws.id, key: "editor" } } });
            if (!editor) throw new UnauthorizedException("Workspace has no default role to assign.");
            member = await this.prisma.membership.create({ data: { userId: user.id, workspaceId: ws.id, roleId: editor.id } });
        }
        if (!user!.isActive) throw new UnauthorizedException("This account is disabled.");

        // 3b. Never silently bypass a user's enrolled 2FA (F-16). If the account has
        // TOTP enabled, only accept the SSO login when the IdP itself asserted a
        // second factor (amr/acr). Otherwise the password+2FA path must be used, so a
        // single-factor IdP login can't sidestep the user's second factor.
        if (user!.twoFactorEnabled && !this.idpAssertedMfa(payload)) {
            throw new SsoTwoFactorRequiredError();
        }

        // 4. Mint a Flow session pinned to this workspace.
        const { token, hash } = generateToken("sess");
        await this.prisma.session.create({
            data: { userId: user!.id, tokenHash: hash, activeWorkspaceId: ws.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS), userAgent: meta?.userAgent, ip: meta?.ip },
        });
        return token;
    }

    /** Did the IdP assert a second factor in the id_token? Checks the standard
     *  `amr` (authentication methods) and `acr` (context class) claims. */
    private idpAssertedMfa(payload: Record<string, unknown>): boolean {
        const amr = payload.amr;
        if (Array.isArray(amr)) {
            const mfaMethods = new Set(["mfa", "otp", "totp", "hwk", "swk", "pop", "sms", "fido", "u2f", "phr", "phrh"]);
            if (amr.some((m) => typeof m === "string" && mfaMethods.has(m.toLowerCase()))) return true;
        }
        const acr = payload.acr;
        // Common MFA/step-up signals: NIST AAL2/AAL3, or a vendor URN containing "mfa"/"multi".
        if (typeof acr === "string" && /mfa|aal2|aal3|multi|loa[23]/i.test(acr)) return true;
        return false;
    }

    private async verifyIdToken(idToken: string, cfg: { issuer: string | null; jwksUri: string | null; clientId: string }) {
        const [h, p, sig] = idToken.split(".");
        if (!h || !p || !sig) throw new UnauthorizedException("Malformed id_token.");
        const header = b64urlJson(h) as { kid?: string; alg?: string };
        const payload = b64urlJson(p) as Record<string, unknown>;
        const nodeAlg = ALG[header.alg ?? ""];
        if (!nodeAlg) throw new UnauthorizedException(`Unsupported id_token alg: ${header.alg}`);
        if (!cfg.jwksUri) throw new UnauthorizedException("No JWKS URI configured.");
        // safeFetch pins the validated public IP + re-validates redirects (SSRF guard).
        const jwks = (await safeFetch(cfg.jwksUri, { headers: { Accept: "application/json" } }).then((r) => r.json())) as { keys?: Array<Record<string, unknown> & { kid?: string }> };
        const jwk = (jwks.keys ?? []).find((k) => k.kid === header.kid) ?? jwks.keys?.[0];
        if (!jwk) throw new UnauthorizedException("No matching JWKS signing key.");
        const key = createPublicKey({ key: jwk, format: "jwk" } as unknown as Parameters<typeof createPublicKey>[0]);
        const ok = cryptoVerify(nodeAlg, Buffer.from(`${h}.${p}`), key, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
        if (!ok) throw new UnauthorizedException("Invalid id_token signature.");
        const now = Math.floor(Date.now() / 1000);
        if (cfg.issuer && payload.iss !== cfg.issuer) throw new UnauthorizedException("id_token issuer mismatch.");
        const aud = Array.isArray(payload.aud) ? (payload.aud as string[]) : [payload.aud as string];
        if (!aud.includes(cfg.clientId)) throw new UnauthorizedException("id_token audience mismatch.");
        if (typeof payload.exp === "number" && payload.exp < now) throw new UnauthorizedException("id_token expired.");
        return payload;
    }
}
