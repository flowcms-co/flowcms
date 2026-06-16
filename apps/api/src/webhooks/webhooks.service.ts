import { createHmac } from "node:crypto";
import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions, type Job as BullJob } from "bullmq";
import { Webhook } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { assertPublicUrl, safeFetch } from "../common/ssrf";

/** Events an outbound webhook can subscribe to. */
export const WEBHOOK_EVENTS = [
    "content.created",
    "content.updated",
    "content.published",
    "content.unpublished",
    "content.scheduled",
    "content.deleted",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type UpsertWebhookInput = {
    name?: string;
    url?: string;
    events?: string[];
    secret?: string;
    enabled?: boolean;
};

const WH_QUEUE = "flowcms-webhooks";
const MAX_ATTEMPTS = 5; // total tries before giving up
const BASE_BACKOFF_MS = 5_000; // exponential: 5s, 10s, 20s, 40s ...
const IN_PROCESS_CAP_MS = 5 * 60_000; // cap the no-Redis fallback backoff

type DeliveryJob = { webhookId: string; event: string; payload: unknown };

@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(WebhooksService.name);
    private queue: Queue<DeliveryJob> | null = null;
    private worker: Worker<DeliveryJob> | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
    ) {}

    onModuleInit() {
        // When Redis is present, deliveries run through BullMQ with native retries
        // + exponential backoff (durable, multi-instance) — the same pattern the
        // jobs runner uses. Without Redis, dispatch() retries in-process instead.
        if (this.redis.enabled && this.redis.client) {
            const connection = this.redis.client as unknown as ConnectionOptions;
            this.queue = new Queue<DeliveryJob>(WH_QUEUE, { connection });
            this.worker = new Worker<DeliveryJob>(
                WH_QUEUE,
                async (job: BullJob<DeliveryJob>) => {
                    const hook = await this.prisma.webhook.findUnique({ where: { id: job.data.webhookId } });
                    if (!hook || !hook.enabled || hook.deletedAt) return; // deleted/disabled mid-flight: stop retrying
                    const res = await this.deliver(hook, job.data.event, job.data.payload, job.attemptsMade + 1);
                    // Throw on failure so BullMQ schedules the next backoff attempt.
                    if (!res.success) throw new Error(`webhook ${hook.id} delivery failed (status ${res.statusCode ?? "none"})`);
                },
                { connection, concurrency: 5 },
            );
            this.worker.on("failed", (_j, err) => this.logger.warn(`Webhook delivery attempt failed: ${err?.message}`));
            this.logger.log("Webhooks: BullMQ delivery with retries (Redis).");
        } else {
            this.logger.log("Webhooks: in-process delivery with retries (no Redis).");
        }
    }

    async onModuleDestroy() {
        await this.worker?.close().catch(() => undefined);
        await this.queue?.close().catch(() => undefined);
    }

    private shape(w: Webhook & { _count?: { deliveries: number } }) {
        return {
            id: w.id,
            name: w.name,
            url: w.url,
            events: (w.events as string[]) ?? [],
            enabled: w.enabled,
            hasSecret: !!w.secret,
            createdAt: w.createdAt,
            deliveries: w._count?.deliveries ?? 0,
        };
    }

    async list(workspaceId: string) {
        const rows = await this.prisma.webhook.findMany({
            where: { workspaceId, deletedAt: null },
            include: { _count: { select: { deliveries: true } } },
            orderBy: { createdAt: "desc" },
        });
        return rows.map((w) => this.shape(w));
    }

    async create(workspaceId: string, input: UpsertWebhookInput) {
        if (input.url) await assertPublicUrl(input.url); // reject private/internal targets up-front
        const w = await this.prisma.webhook.create({
            data: {
                workspaceId,
                name: input.name?.trim() || "Endpoint",
                url: input.url ?? "",
                events: (input.events ?? []) as object,
                secret: input.secret?.trim() ? encryptSecret(input.secret.trim()) : null,
                enabled: input.enabled ?? true,
            },
        });
        return this.shape(w);
    }

    async update(workspaceId: string, id: string, input: UpsertWebhookInput) {
        const existing = await this.prisma.webhook.findFirst({ where: { id, workspaceId, deletedAt: null } });
        if (!existing) throw new NotFoundException("Webhook not found.");
        if (input.url) await assertPublicUrl(input.url); // reject private/internal targets up-front
        const data: Record<string, unknown> = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.url !== undefined) data.url = input.url;
        if (input.events !== undefined) data.events = input.events;
        if (input.enabled !== undefined) data.enabled = input.enabled;
        if (input.secret !== undefined) data.secret = input.secret.trim() ? encryptSecret(input.secret.trim()) : null;
        const w = await this.prisma.webhook.update({ where: { id }, data });
        return this.shape(w);
    }

    async remove(workspaceId: string, id: string) {
        // Soft-delete (no hard delete): stamp deletedAt. Hidden from list(), never
        // dispatched, but the row + its delivery history are preserved.
        const existing = await this.prisma.webhook.findFirst({ where: { id, workspaceId, deletedAt: null } });
        if (!existing) throw new NotFoundException("Webhook not found.");
        await this.prisma.webhook.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
        return { ok: true };
    }

    async deliveries(workspaceId: string, id: string) {
        const existing = await this.prisma.webhook.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Webhook not found.");
        return this.prisma.webhookDelivery.findMany({
            where: { webhookId: id },
            orderBy: { createdAt: "desc" },
            take: 25,
        });
    }

    /** POST a payload to one webhook and record the delivery. */
    private async deliver(webhook: Webhook, event: string, payload: unknown, attempt = 1) {
        const body = JSON.stringify({ event, payload, at: new Date().toISOString() });
        const headers: Record<string, string> = { "Content-Type": "application/json", "X-FlowCMS-Event": event };
        // Secrets are stored AES-256-GCM-encrypted; decrypt only to sign (fail
        // closed — if decryption fails we send unsigned rather than leak/guess).
        let signingSecret: string | null = null;
        if (webhook.secret) {
            try {
                signingSecret = decryptSecret(webhook.secret);
            } catch {
                this.logger.warn(`Webhook ${webhook.id} has an unreadable secret; sending unsigned.`);
            }
        }
        if (signingSecret) {
            headers["X-FlowCMS-Signature"] = "sha256=" + createHmac("sha256", signingSecret).update(body).digest("hex");
        }
        let statusCode: number | null = null;
        let success = false;
        let responseBody = "";
        try {
            // SSRF-guarded: rejects private/internal targets, no redirect-follow.
            const res = await safeFetch(webhook.url, { method: "POST", headers, body }, { timeoutMs: 10_000, maxRedirects: 0 });
            statusCode = res.status;
            success = res.ok;
            responseBody = (await res.text().catch(() => "")).slice(0, 2000);
        } catch (err) {
            responseBody = (err as Error).message;
        }
        await this.prisma.webhookDelivery.create({
            data: { webhookId: webhook.id, event, payload: payload as object, statusCode, success, responseBody, attempt },
        });
        return { success, statusCode };
    }

    /** Fire an event to all enabled webhooks subscribed to it, with retries. */
    async dispatch(workspaceId: string, event: WebhookEvent, payload: unknown) {
        try {
            const hooks = await this.prisma.webhook.findMany({ where: { workspaceId, enabled: true, deletedAt: null } });
            const targets = hooks.filter((h) => ((h.events as string[]) ?? []).includes(event));
            for (const h of targets) {
                if (this.queue) {
                    await this.queue.add(
                        "deliver",
                        { webhookId: h.id, event, payload },
                        {
                            attempts: MAX_ATTEMPTS,
                            backoff: { type: "exponential", delay: BASE_BACKOFF_MS },
                            removeOnComplete: 1000,
                            removeOnFail: 1000,
                        },
                    );
                } else {
                    void this.deliverWithRetry(h, event, payload, 1);
                }
            }
        } catch (err) {
            this.logger.error(`Webhook dispatch failed for ${event}`, err as Error);
        }
    }

    /** No-Redis fallback: retry a delivery in-process with exponential backoff.
     *  Best-effort (scheduled retries are lost on restart, like in-process jobs). */
    private deliverWithRetry(webhook: Webhook, event: string, payload: unknown, attempt: number) {
        void this.deliver(webhook, event, payload, attempt)
            .then((res) => {
                if (!res.success && attempt < MAX_ATTEMPTS) {
                    const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), IN_PROCESS_CAP_MS);
                    setTimeout(() => this.deliverWithRetry(webhook, event, payload, attempt + 1), delay).unref?.();
                }
            })
            .catch(() => {});
    }

    /** Send a sample ping to verify an endpoint. */
    async test(workspaceId: string, id: string) {
        const webhook = await this.prisma.webhook.findFirst({ where: { id, workspaceId } });
        if (!webhook) throw new NotFoundException("Webhook not found.");
        return this.deliver(webhook, "ping", { message: "Test delivery from Flow CMS", workspaceId });
    }

    /** Re-send a past delivery's payload. */
    async resend(workspaceId: string, deliveryId: string) {
        const delivery = await this.prisma.webhookDelivery.findUnique({
            where: { id: deliveryId },
            include: { webhook: true },
        });
        if (!delivery || delivery.webhook.workspaceId !== workspaceId) throw new NotFoundException("Delivery not found.");
        return this.deliver(delivery.webhook, delivery.event, delivery.payload, delivery.attempt + 1);
    }
}
