import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { generateToken } from "@flowcms/shared";
import { Public } from "../../auth/decorators";
import { SESSION_COOKIE, sessionCookieOptions } from "../../auth/constants";
import { SsoService, SsoTwoFactorRequiredError } from "./sso.service";

const STATE_COOKIE = "flow_sso_state";
const WS_COOKIE = "flow_sso_ws";
const studioUrl = () => (process.env.STUDIO_URL || "http://localhost:3000").replace(/\/$/, "");
const stateCookie = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 10 * 60 * 1000 });

/**
 * Public OIDC login flow (the session guard is skipped). `/auth/sso/start`
 * redirects to the IdP; `/auth/sso/callback` finishes the exchange and sets the
 * Flow session cookie. Both are inert unless SSO is licensed + configured (the
 * service enforces `sso`), so exposing them on Community is harmless.
 */
@Public()
@Controller("auth/sso")
export class SsoAuthController {
    constructor(private readonly sso: SsoService) {}

    /** The IdP redirects back here — must match what the IdP has registered. Prefer
     *  the configured public base URL over request headers, so a spoofed Host /
     *  X-Forwarded-Proto can't poison the OIDC redirect_uri (SECURITY_AUDIT_REPORT
     *  F-19). Falls back to the trust-proxy-aware protocol + host only when unset. */
    private callbackUrl(req: Request) {
        const base = (process.env.API_URL || process.env.STUDIO_URL || "").replace(/\/$/, "");
        if (base) return `${base}/api/auth/sso/callback`;
        return `${req.protocol}://${req.get("host")}/api/auth/sso/callback`;
    }

    /** Login page asks "is SSO available?" to decide whether to show the button. */
    @Get("available")
    available(@Query("ws") ws?: string) {
        return this.sso.availableFor(ws);
    }

    /** Kick off login: stash anti-CSRF state + target workspace, 302 to the IdP. */
    @Get("start")
    async start(@Req() req: Request, @Res() res: Response, @Query("ws") ws?: string) {
        try {
            const state = generateToken("ssost").token;
            const { url, slug } = await this.sso.authorizeUrl(ws, state, this.callbackUrl(req));
            res.cookie(STATE_COOKIE, state, stateCookie());
            res.cookie(WS_COOKIE, slug, stateCookie());
            return res.redirect(url);
        } catch {
            return res.redirect(`${studioUrl()}/login?error=sso_unavailable`);
        }
    }

    /** IdP redirect target: validate state, exchange the code, set the session. */
    @Get("callback")
    async callback(@Req() req: Request, @Res() res: Response, @Query("code") code?: string, @Query("state") state?: string) {
        const cookies = (req.cookies ?? {}) as Record<string, string>;
        const expected = cookies[STATE_COOKIE];
        const ws = cookies[WS_COOKIE];
        res.clearCookie(STATE_COOKIE, { path: "/" });
        res.clearCookie(WS_COOKIE, { path: "/" });
        if (!code || !state || !expected || state !== expected || !ws) {
            return res.redirect(`${studioUrl()}/login?error=sso_state`);
        }
        try {
            // req.ip is trust-proxy-aware (honours TRUST_PROXY); don't read the raw
            // X-Forwarded-For header, which a client can spoof into the audit log (F-19).
            const token = await this.sso.completeLogin(ws, code, this.callbackUrl(req), { userAgent: req.get("user-agent") ?? undefined, ip: req.ip });
            res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
            return res.redirect(`${studioUrl()}/`);
        } catch (e) {
            // A 2FA-enabled account that came through a single-factor IdP login: send a
            // specific signal so the login page can tell them to use password + 2FA.
            if (e instanceof SsoTwoFactorRequiredError) {
                return res.redirect(`${studioUrl()}/login?error=sso_2fa`);
            }
            return res.redirect(`${studioUrl()}/login?error=sso_failed`);
        }
    }
}
