import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Readable } from "node:stream";
import type { Response } from "express";

export type BackupManifest = { id: string; createdAt: string; version: string | null; dbBytes: number; mediaBytes: number; totalBytes: number };

/**
 * Thin client for the updater sidecar (deploy/updater). The updater is reachable
 * only on the internal docker network and authenticated with UPDATER_TOKEN; it is
 * the only component with Docker-socket access (backups now; upgrade/restore later).
 * Absent on non-compose deployments (managed PaaS / dev) — `available()` is false
 * and calls 503 with a clear message.
 */
@Injectable()
export class UpdaterClient {
    private readonly log = new Logger(UpdaterClient.name);
    private readonly url = process.env.UPDATER_URL || "";
    private readonly token = process.env.UPDATER_TOKEN || "";

    available(): boolean {
        return !!this.url && !!this.token;
    }

    private async req(method: string, p: string, body?: unknown): Promise<globalThis.Response> {
        if (!this.available()) throw new ServiceUnavailableException("The in-app updater isn't available on this deployment.");
        let res: globalThis.Response;
        try {
            res = await fetch(`${this.url}${p}`, {
                method,
                headers: { Authorization: `Bearer ${this.token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });
        } catch (e) {
            this.log.warn(`updater ${method} ${p} failed: ${e instanceof Error ? e.message : String(e)}`);
            throw new ServiceUnavailableException("Couldn't reach the updater service.");
        }
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new ServiceUnavailableException(`Updater error (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
        }
        return res;
    }

    async listBackups(): Promise<BackupManifest[]> {
        const json = (await (await this.req("GET", "/backups")).json()) as { backups: BackupManifest[] };
        return json.backups ?? [];
    }

    async createBackup(): Promise<BackupManifest> {
        return (await this.req("POST", "/backups")).json() as Promise<BackupManifest>;
    }

    async deleteBackup(id: string): Promise<void> {
        await this.req("DELETE", `/backups/${encodeURIComponent(id)}`);
    }

    async images(): Promise<{ api: string; studio: string }> {
        return (await this.req("GET", "/images")).json() as Promise<{ api: string; studio: string }>;
    }

    /** Kick off an upgrade (fire-and-forget; poll upgradeStatus). */
    async startUpgrade(toVersion?: string): Promise<unknown> {
        return (await this.req("POST", "/upgrade", { toVersion })).json();
    }

    /** Current/last upgrade job status (persisted by the updater, so it survives the
     *  api restart mid-upgrade). */
    async upgradeStatus(): Promise<unknown> {
        return (await this.req("GET", "/status")).json();
    }

    async restore(id: string, restoreEnv = false): Promise<void> {
        await this.req("POST", `/restore/${encodeURIComponent(id)}`, { restoreEnv });
    }

    /** Proxy a backup tarball download straight to the client. */
    async streamBackup(id: string, res: Response): Promise<void> {
        const upstream = await this.req("GET", `/backups/${encodeURIComponent(id)}/download`);
        res.setHeader("content-type", "application/gzip");
        res.setHeader("content-disposition", `attachment; filename="${id}.tar.gz"`);
        if (!upstream.body) {
            res.end();
            return;
        }
        Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    }
}
