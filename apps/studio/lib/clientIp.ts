"use client";

/**
 * The public IP the browser observes for itself, via ipify's free no-key API.
 * Recorded alongside the server-observed request IP as consent evidence (the
 * two can differ behind proxies or tunnels; keeping both makes the record
 * stronger). Strictly best-effort: a blocked or slow lookup returns null and
 * never delays the action it accompanies.
 */
export async function getClientIp(timeoutMs = 3500): Promise<string | null> {
    try {
        const res = await fetch("https://api.ipify.org?format=json", {
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { ip?: string };
        return typeof data.ip === "string" && data.ip.length <= 64 ? data.ip : null;
    } catch {
        return null;
    }
}
