import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * SSRF protection for every outbound request whose URL is influenced by user
 * input (webhooks, custom AI/keyword/AEO base URLs, importers, the SEO crawler).
 *
 *   - http/https only (no file:, gopher:, …)
 *   - the host is resolved ONCE; every resolved IP is checked against loopback,
 *     private (RFC1918), CGNAT, link-local (incl. the 169.254.169.254 cloud
 *     metadata endpoint), and reserved ranges — for IPv4, IPv6, and embedded
 *     IPv4 (IPv4-mapped ::ffff:, 6to4 2002::, NAT64 64:ff9b::)
 *   - the connection is PINNED to that validated IP via an undici dispatcher, so
 *     `fetch` can't re-resolve to a different (internal) address — closing the
 *     DNS-rebinding / TOCTOU window
 *   - each redirect hop is resolved, validated, and pinned again
 *
 * Self-hosters who must reach internal/localhost endpoints (a local Ollama /
 * LiteLLM, an intranet WordPress, internal webhooks) set ALLOW_PRIVATE_FETCH=true
 * to skip the private-address block (scheme checks still apply). Off by default.
 */
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_FETCH === "true";

function ipv4ToLong(ip: string): number {
    const p = ip.split(".").map(Number);
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function ipv4InRange(ip: string, base: string, bits: number): boolean {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipv4ToLong(ip) & mask) === (ipv4ToLong(base) & mask);
}

function isPrivateIpv4(ip: string): boolean {
    return (
        ipv4InRange(ip, "0.0.0.0", 8) ||
        ipv4InRange(ip, "10.0.0.0", 8) ||
        ipv4InRange(ip, "100.64.0.0", 10) ||
        ipv4InRange(ip, "127.0.0.0", 8) ||
        ipv4InRange(ip, "169.254.0.0", 16) ||
        ipv4InRange(ip, "172.16.0.0", 12) ||
        ipv4InRange(ip, "192.0.0.0", 24) ||
        ipv4InRange(ip, "192.0.2.0", 24) ||
        ipv4InRange(ip, "192.168.0.0", 16) ||
        ipv4InRange(ip, "198.18.0.0", 15) ||
        ipv4InRange(ip, "198.51.100.0", 24) ||
        ipv4InRange(ip, "203.0.113.0", 24) ||
        ipv4InRange(ip, "224.0.0.0", 4) ||
        ipv4InRange(ip, "240.0.0.0", 4)
    );
}

/** Expand any IPv6 literal (incl. `::` compression and embedded IPv4) to 8 groups. */
function expandIpv6(ip: string): number[] | null {
    let s = ip.split("%")[0].toLowerCase(); // drop zone id
    // Convert a trailing embedded IPv4 (e.g. ::ffff:127.0.0.1) to two hex groups.
    const v4 = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4) {
        const o = v4[2].split(".").map(Number);
        if (o.some((n) => n > 255)) return null;
        s = v4[1] + (((o[0] << 8) | o[1]) >>> 0).toString(16) + ":" + (((o[2] << 8) | o[3]) >>> 0).toString(16);
    }
    const halves = s.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
    if (fill < 0) return null;
    const groups = [...head, ...Array(fill).fill("0"), ...tail];
    if (groups.length !== 8) return null;
    const nums = groups.map((g) => (g === "" ? 0 : parseInt(g, 16)));
    if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
    return nums;
}

const v4From = (hi: number, lo: number) => `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;

/** Is the literal IP internal/private/reserved (v4 or v6, incl. embedded v4)? */
export function isPrivateIp(ip: string): boolean {
    const fam = isIP(ip);
    if (fam === 4) return isPrivateIpv4(ip);
    if (fam === 6) {
        const g = expandIpv6(ip);
        if (!g) return true; // unparseable → treat as unsafe
        const allZeroHead = g.slice(0, 7).every((x) => x === 0);
        if (allZeroHead && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
        if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) return isPrivateIpv4(v4From(g[6], g[7])); // ::ffff:v4
        if (g.slice(0, 6).every((x) => x === 0) && (g[6] !== 0 || g[7] > 1)) return isPrivateIpv4(v4From(g[6], g[7])); // ::v4 (deprecated)
        if (g[0] === 0x2002) return isPrivateIpv4(v4From(g[1], g[2])); // 6to4
        if (g[0] === 0x0064 && g[1] === 0xff9b) return isPrivateIpv4(v4From(g[6], g[7])); // NAT64
        if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
        if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
        if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
        return false;
    }
    return true; // not a valid IP literal → unsafe
}

type Addr = { address: string; family: number };

async function safeLookup(host: string): Promise<Addr[]> {
    try {
        const res = await lookup(host, { all: true });
        if (!res.length) throw new Error("empty");
        return res.map((r) => ({ address: r.address, family: r.family }));
    } catch {
        throw new BadRequestException("Could not resolve host.");
    }
}

/** Parse + scheme/name/IP validation, returning the URL and its validated addresses. */
async function resolveValidated(raw: string): Promise<{ url: URL; addresses: Addr[] }> {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new BadRequestException("Invalid URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new BadRequestException("Only http(s) URLs are allowed.");
    }
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase(); // drop [] + trailing dot
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "metadata.google.internal") {
        if (!ALLOW_PRIVATE) throw new ForbiddenException("That host is not allowed.");
    }
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await safeLookup(host);
    if (!ALLOW_PRIVATE) {
        for (const a of addresses) {
            if (isPrivateIp(a.address)) {
                throw new ForbiddenException("URL resolves to a private or internal address, which is not allowed.");
            }
        }
    }
    return { url, addresses };
}

/** Validate a user-influenced URL (http(s) + not internal). Throws 400/403. */
export async function assertPublicUrl(raw: string): Promise<URL> {
    const { url } = await resolveValidated(raw);
    return url;
}

/**
 * fetch() hardened against SSRF: validates the URL, PINS the connection to the
 * already-validated IP (no re-resolution → no DNS rebinding), enforces a timeout,
 * and re-validates every redirect hop. `maxRedirects` defaults to 0.
 */
export async function safeFetch(
    raw: string,
    init: RequestInit = {},
    opts: { timeoutMs?: number; maxRedirects?: number } = {},
) {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const maxRedirects = opts.maxRedirects ?? 0;
    let target = raw;

    for (let hop = 0; ; hop++) {
        const { url, addresses } = await resolveValidated(target);
        const pinned = addresses[0]; // every address was validated; connect to this one only
        const agent = new Agent({
            connect: {
                // Pin DNS to the validated IP. `any`-typed to satisfy undici's LookupFunction
                // overloads (single-address vs all:[] callback forms).
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                lookup: (_hostname: string, options: any, cb: any) => {
                    if (options && options.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
                    else cb(null, pinned.address, pinned.family);
                },
            },
        });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res = await undiciFetch(url.toString(), { ...(init as any), redirect: "manual", signal: controller.signal, dispatcher: agent });
        } catch (e) {
            clearTimeout(timer);
            void agent.destroy();
            throw e;
        }

        const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
        if (location && hop < maxRedirects) {
            clearTimeout(timer);
            void agent.destroy(); // headers already read; body of a redirect is unused
            target = new URL(location, url).toString();
            continue;
        }

        // Buffer the body BEFORE destroying the dispatcher. Destroying the undici
        // Agent tears down the socket, so reading the body afterwards yields an
        // empty stream (the bug that made every safeFetch response come back blank).
        // Return a standard Response so callers' res.json()/res.text()/res.ok work.
        try {
            const buf = await res.arrayBuffer();
            const headers = new Headers(res.headers as unknown as Headers);
            // The buffer is already-decoded bytes; drop framing headers that would
            // misdescribe it (content-encoding/length) so downstream decode is clean.
            headers.delete("content-encoding");
            headers.delete("content-length");
            return new Response(buf, { status: res.status, statusText: res.statusText, headers });
        } finally {
            clearTimeout(timer);
            void agent.destroy();
        }
    }
}
