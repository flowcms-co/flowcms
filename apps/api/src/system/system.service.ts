import { Injectable, Logger } from "@nestjs/common";

export type UpdatesInfo = {
    /** The version this instance is running (from the baked FLOWCMS_VERSION, or a dev fallback). */
    current: string;
    /** Latest published release tag (stripped of a leading "v"), or null if unknown. */
    latest: string | null;
    updateAvailable: boolean;
    notes: string | null;
    releaseUrl: string | null;
    channel: "stable";
    /** How this instance is deployed — drives whether the in-app upgrade is offered. */
    deployment: "compose" | "aio" | "unknown";
    /** Detected managed host (Railway/Render), so the UI can show platform-specific
     *  update steps. Null on self-host or when the host can't be identified. */
    platform: "railway" | "render" | null;
    checkedAt: string;
    error?: string;
};

const FALLBACK_VERSION = "0.1.0";
const RELEASES_URL = "https://api.github.com/repos/flowcms-co/flowcms/releases/latest";
const CHECK_TTL_MS = 60 * 60 * 1000; // cache the upstream release check for an hour

/** Compare semver-ish "a.b.c" strings. >0 when a is newer than b. Tolerant of a
 *  leading "v" and pre-release suffixes (compared on the numeric core only). */
function semverCmp(a: string, b: string): number {
    const core = (s: string) => s.replace(/^v/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
    const x = core(a);
    const y = core(b);
    for (let i = 0; i < 3; i++) {
        const d = (x[i] ?? 0) - (y[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
}

/**
 * System info for the self-host "Updates" panel: the running version, and whether a
 * newer release is published. The version is baked into the image at build
 * (FLOWCMS_VERSION); the latest is read from the GitHub releases of the repo and
 * cached for an hour. Read-only — the actual upgrade is performed by the updater
 * sidecar (later phases).
 */
@Injectable()
export class SystemService {
    private readonly log = new Logger(SystemService.name);
    private cached: { at: number; data: UpdatesInfo } | null = null;

    version(): string {
        return (process.env.FLOWCMS_VERSION || FALLBACK_VERSION).replace(/^v/, "");
    }

    deployment(): "compose" | "aio" | "unknown" {
        const d = (process.env.FLOWCMS_DEPLOYMENT || "").toLowerCase();
        return d === "compose" || d === "aio" ? d : "unknown";
    }

    /** Best-effort managed-host detection from the platform's own runtime env vars.
     *  Railway injects RAILWAY_* on every service; Render injects RENDER_*. */
    platform(): "railway" | "render" | null {
        if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PUBLIC_DOMAIN) return "railway";
        if (process.env.RENDER || process.env.RENDER_SERVICE_ID) return "render";
        return null;
    }

    async updates(force = false): Promise<UpdatesInfo> {
        if (!force && this.cached && Date.now() - this.cached.at < CHECK_TTL_MS) return this.cached.data;

        const current = this.version();
        const data: UpdatesInfo = {
            current,
            latest: null,
            updateAvailable: false,
            notes: null,
            releaseUrl: null,
            channel: "stable",
            deployment: this.deployment(),
            platform: this.platform(),
            checkedAt: new Date().toISOString(),
        };

        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch(RELEASES_URL, {
                headers: { Accept: "application/vnd.github+json", "User-Agent": "flowcms" },
                signal: ctrl.signal,
            }).finally(() => clearTimeout(timer));
            if (res.ok) {
                const j = (await res.json()) as { tag_name?: string; body?: string; html_url?: string };
                const latest = (j.tag_name || "").replace(/^v/, "") || null;
                data.latest = latest;
                data.notes = j.body ? j.body.slice(0, 4000) : null;
                data.releaseUrl = j.html_url ?? null;
                data.updateAvailable = !!latest && semverCmp(latest, current) > 0;
            } else if (res.status !== 404) {
                // 404 = no releases published yet; treat as "nothing newer", not an error.
                data.error = `Update check returned ${res.status}.`;
            }
        } catch (e) {
            data.error = "Couldn't reach the update server.";
            this.log.warn(`update check failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        this.cached = { at: Date.now(), data };
        return data;
    }
}
