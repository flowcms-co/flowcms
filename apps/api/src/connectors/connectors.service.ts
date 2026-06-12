import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Integration } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LicenseService } from "../license/license.service";
import { assertPublicUrl, safeFetch } from "../common/ssrf";

/** Content events a connector can relay. */
export const CONNECTOR_EVENTS = [
    "content.created",
    "content.updated",
    "content.published",
    "content.scheduled",
    "content.unpublished",
    "content.deleted",
] as const;
export type ConnectorEvent = (typeof CONNECTOR_EVENTS)[number];

export type ConnectorProvider = "slack" | "zapier";

const PROVIDER_META: Record<ConnectorProvider, { name: string; feature: string | null; defaultEvents: ConnectorEvent[] }> = {
    // Slack is a Pro entitlement (formatted notifications); Zapier rides the same
    // free webhook plumbing as the Webhooks tab, so it stays in Community.
    slack: {
        name: "Slack",
        feature: "slack",
        defaultEvents: ["content.published", "content.scheduled", "content.unpublished"],
    },
    zapier: {
        name: "Zapier",
        feature: null,
        defaultEvents: ["content.created", "content.updated", "content.published", "content.scheduled", "content.unpublished", "content.deleted"],
    },
};

const VERB: Record<string, string> = {
    "content.created": "created",
    "content.updated": "updated",
    "content.published": "published",
    "content.scheduled": "scheduled",
    "content.unpublished": "unpublished",
    "content.deleted": "deleted",
};

type ConnectorConfig = { events?: string[]; host?: string; lastError?: string | null };

/** Public shape — never includes the stored webhook URL (it's a secret). */
function sanitize(i: Integration) {
    const cfg = (i.config ?? {}) as ConnectorConfig;
    return {
        id: i.id,
        provider: i.provider,
        label: i.label,
        status: i.status,
        connected: i.status === "CONNECTED",
        events: cfg.events ?? [],
        host: cfg.host ?? null,
        hasUrl: !!i.encryptedSecret,
        lastError: cfg.lastError ?? null,
        lastCheckedAt: i.lastCheckedAt,
        updatedAt: i.updatedAt,
    };
}

/**
 * Automation connectors — Slack & Zapier. Each stores its (secret) incoming
 * webhook / catch-hook URL AES-256-GCM-encrypted, and relays content events:
 * Slack gets a formatted message, Zapier gets the structured event JSON. All
 * outbound posts go through the SSRF guard (no private/internal targets, no
 * redirect-follow). Deliveries are best-effort and never block a content write.
 */
@Injectable()
export class ConnectorsService {
    private readonly logger = new Logger(ConnectorsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly license: LicenseService,
    ) {}

    private meta(provider: string) {
        const m = PROVIDER_META[provider as ConnectorProvider];
        if (!m) throw new BadRequestException(`Unknown connector: ${provider}`);
        return m;
    }

    async list(workspaceId: string) {
        const rows = await this.prisma.integration.findMany({
            where: { workspaceId, type: "AUTOMATION" },
            orderBy: { createdAt: "asc" },
        });
        return rows.map(sanitize);
    }

    /** Connect (or update) a Slack / Zapier connector. Validates + test-pings the URL. */
    async connect(workspaceId: string, input: { provider: string; url: string; events?: string[] }, userId: string) {
        const meta = this.meta(input.provider);
        if (meta.feature && !(await this.license.has(meta.feature))) {
            throw new ForbiddenException(`${meta.name} notifications require a Pro license.`);
        }

        let parsed: URL;
        try {
            parsed = await assertPublicUrl(input.url);
        } catch {
            throw new BadRequestException("That webhook URL is invalid or points to a non-public address.");
        }

        const events = (input.events?.length ? input.events : meta.defaultEvents).filter((e) =>
            (CONNECTOR_EVENTS as readonly string[]).includes(e),
        );

        // Verify the endpoint accepts a ping before we store it as connected.
        const ping = await this.post(input.provider, input.url, this.format(input.provider as ConnectorProvider, "ping", { title: "Flow CMS" }));

        const existing = await this.prisma.integration.findFirst({
            where: { workspaceId, type: "AUTOMATION", provider: input.provider },
        });
        const data = {
            type: "AUTOMATION" as const,
            provider: input.provider,
            label: meta.name,
            config: { events, host: parsed.host, lastError: ping.ok ? null : ping.error } as ConnectorConfig,
            encryptedSecret: encryptSecret(input.url),
            status: (ping.ok ? "CONNECTED" : "ERROR") as Integration["status"],
            lastCheckedAt: new Date(),
            createdById: userId,
        };
        const saved = existing
            ? await this.prisma.integration.update({ where: { id: existing.id }, data })
            : await this.prisma.integration.create({ data: { workspaceId, ...data } });
        return { connector: sanitize(saved), test: ping };
    }

    /** Re-send a test ping using the stored URL. */
    async test(workspaceId: string, id: string) {
        const row = await this.prisma.integration.findFirst({ where: { id, workspaceId, type: "AUTOMATION" } });
        if (!row || !row.encryptedSecret) throw new NotFoundException("Connector not found.");
        let url: string;
        try {
            url = decryptSecret(row.encryptedSecret);
        } catch {
            throw new BadRequestException("Stored connector URL is unreadable; reconnect it.");
        }
        const ping = await this.post(row.provider, url, this.format(row.provider as ConnectorProvider, "ping", { title: "Flow CMS" }));
        const cfg = (row.config ?? {}) as ConnectorConfig;
        const updated = await this.prisma.integration.update({
            where: { id },
            data: {
                status: (ping.ok ? "CONNECTED" : "ERROR") as Integration["status"],
                lastCheckedAt: new Date(),
                config: { ...cfg, lastError: ping.ok ? null : ping.error },
            },
        });
        return { connector: sanitize(updated), test: ping };
    }

    async remove(workspaceId: string, id: string) {
        const row = await this.prisma.integration.findFirst({ where: { id, workspaceId, type: "AUTOMATION" } });
        if (!row) throw new NotFoundException("Connector not found.");
        await this.prisma.integration.delete({ where: { id } });
        return { ok: true };
    }

    /** Relay a content event to every connected connector subscribed to it (best-effort, async). */
    async dispatch(workspaceId: string, event: ConnectorEvent, entry: unknown) {
        try {
            const rows = await this.prisma.integration.findMany({
                where: { workspaceId, type: "AUTOMATION", status: "CONNECTED" },
            });
            const targets = rows.filter((r) => ((r.config as ConnectorConfig)?.events ?? []).includes(event));
            if (!targets.length) return;
            await Promise.all(
                targets.map(async (r) => {
                    // A workspace that lost its Pro license shouldn't keep firing Slack.
                    const meta = PROVIDER_META[r.provider as ConnectorProvider];
                    if (meta?.feature && !(await this.license.has(meta.feature))) return;
                    if (!r.encryptedSecret) return;
                    let url: string;
                    try {
                        url = decryptSecret(r.encryptedSecret);
                    } catch {
                        this.logger.warn(`Connector ${r.id} has an unreadable URL; skipping.`);
                        return;
                    }
                    await this.post(r.provider, url, this.format(r.provider as ConnectorProvider, event, entry)).catch(() => {});
                }),
            );
        } catch (err) {
            this.logger.error(`Connector dispatch failed for ${event}`, err as Error);
        }
    }

    /** Build the request body for a provider. Slack wants a chat message; Zapier wants structured JSON. */
    private format(provider: ConnectorProvider, event: string, entry: unknown): unknown {
        const e = (entry ?? {}) as { id?: string; title?: string; slug?: string; status?: string; data?: { title?: string } };
        const title = e.title || e.data?.title || "Untitled";
        const verb = VERB[event] ?? event.replace("content.", "");
        if (provider === "slack") {
            const text = event === "ping" ? ":white_check_mark: Flow CMS is connected to this channel." : `:rocket: *${title}* was ${verb} in Flow CMS`;
            return { text };
        }
        // Zapier (and any raw consumer): a flat, automation-friendly event.
        return {
            event,
            title,
            id: e.id ?? null,
            slug: e.slug ?? null,
            status: e.status ?? null,
            at: new Date().toISOString(),
            source: "flowcms",
        };
    }

    /** SSRF-guarded POST with a short timeout; returns ok/status/error (never throws). */
    private async post(provider: string, url: string, body: unknown): Promise<{ ok: boolean; status: number | null; error?: string }> {
        try {
            const res = await safeFetch(
                url,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
                { timeoutMs: 10_000, maxRedirects: 0 },
            );
            return { ok: res.ok, status: res.status, error: res.ok ? undefined : `${provider} responded ${res.status}` };
        } catch (err) {
            return { ok: false, status: null, error: (err as Error).message };
        }
    }
}
