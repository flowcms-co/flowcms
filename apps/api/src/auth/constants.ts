import type { CookieOptions } from "express";

export const SESSION_COOKIE = "flow_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days (absolute)

// Community idle timeout: a session unused for this long is expired even before the
// 30-day absolute TTL, so an abandoned/stolen browser session doesn't stay valid for
// a month (SECURITY_AUDIT_REPORT F-12). EE `ip_policies` overrides this when licensed.
// Override the day count with SESSION_IDLE_TTL_DAYS.
export const SESSION_IDLE_TTL_MS = Number(process.env.SESSION_IDLE_TTL_DAYS ?? 14) * 24 * 60 * 60 * 1000;

/** Base cookie options for the session cookie (httpOnly, same-site).
 *  `secure` defaults to on in production (cookie only sent over HTTPS). Override with
 *  COOKIE_SECURE=false when serving over plain http (e.g. a local all-in-one test on
 *  http://localhost, where a Secure cookie won't be stored) or when TLS is terminated
 *  upstream and the app sees plain http. Leave it unset/true for any real deployment. */
export function sessionCookieOptions(): CookieOptions {
    const secure =
        process.env.COOKIE_SECURE != null
            ? process.env.COOKIE_SECURE === "true"
            : process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: SESSION_TTL_MS,
    };
}
