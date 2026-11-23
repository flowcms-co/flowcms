import { Inject, Injectable, Logger, Optional, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { CacheService } from "../cache/cache.service";
import { CONTENT_RULES_PORT, activeRules, type ContentRulesPort } from "./content-rules.port";
import { fieldsOf, validateEntryData, type ComponentMap } from "./entry-validation";

const TICK_MS = 60_000; // check every minute
const LOCK_MS = TICK_MS - 5_000; // lease shorter than the tick so the next tick can re-claim

/**
 * Auto-publish scheduler. Every minute (and once on boot) it flips any entry that
 * is SCHEDULED with a due `scheduledAt` to PUBLISHED, stamping `publishedAt`.
 * This is what makes the Publish Queue + Content Calendar "schedule" actually fire.
 * Implemented with a plain interval (no extra deps); single-flight guarded.
 */
@Injectable()
export class ContentSchedulerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ContentSchedulerService.name);
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly webhooks: WebhooksService,
        private readonly cache: CacheService,
        // EE `content_rules`; absent (rules never checked) in Community.
        @Optional() @Inject(CONTENT_RULES_PORT) private readonly contentRules?: ContentRulesPort,
    ) {}

    onModuleInit() {
        // First pass shortly after boot, then on a fixed interval.
        setTimeout(() => void this.publishDue(), 5_000);
        this.timer = setInterval(() => void this.publishDue(), TICK_MS);
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    /** Whether a due entry still meets its type's rules. When it does not, it goes back to draft
     *  (so it does not retry every minute) and the activity log says why. */
    private async passesRules(e: { id: string; slug: string | null; title?: string | null; data: unknown; workspaceId: string; contentType: { apiId: string; schema: unknown } }): Promise<boolean> {
        const comps = await this.prisma.contentType.findMany({ where: { workspaceId: e.workspaceId, kind: "COMPONENT" }, select: { apiId: true, schema: true } });
        const components: ComponentMap = {};
        for (const c of comps) components[c.apiId] = fieldsOf(c.schema);
        try {
            validateEntryData(fieldsOf(e.contentType.schema), (e.data ?? {}) as Record<string, unknown>, { enforceRequired: true, slug: e.slug, components, rules: await activeRules(this.contentRules, e.contentType.schema) });
            return true;
        } catch (err) {
            const detail = (err as { getResponse?: () => { message?: string } }).getResponse?.().message ?? "It no longer meets the formatting rules.";
            await this.prisma.contentEntry.update({ where: { id: e.id }, data: { status: "DRAFT", scheduledAt: null } });
            await this.prisma.auditLog
                .create({
                    data: {
                        workspaceId: e.workspaceId,
                        userId: null,
                        actorName: "Scheduled publish",
                        action: "content.publish_blocked",
                        resource: "ContentEntry",
                        resourceId: e.id,
                        entryType: e.contentType.apiId,
                        title: e.title ?? null,
                        slug: e.slug,
                        metadata: { reason: detail },
                    },
                })
                .catch(() => undefined);
            this.logger.warn(`Scheduled entry ${e.id} was not published and went back to draft: ${detail}`);
            return false;
        }
    }

    /** Publish all entries whose scheduled time has arrived. Returns the count. */
    async publishDue(): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        try {
            // Cluster-wide single-flight: only one instance publishes a given tick,
            // so a scheduled entry doesn't fire its content.published webhook twice.
            if (!(await this.redis.tryAcquire("sched:content-publish", LOCK_MS))) return 0;
            const now = new Date();
            const due = await this.prisma.contentEntry.findMany({
                where: { status: "SCHEDULED", scheduledAt: { not: null, lte: now } },
                select: { id: true, slug: true, title: true, data: true, workspaceId: true, scheduledAt: true, publishedAt: true, firstPublishedAt: true, contentType: { select: { apiId: true, schema: true } } },
            });
            if (due.length === 0) return 0;
            let published = 0;
            await Promise.all(
                due.map(async (e) => {
                    // The formatting rules are checked again at the moment of going live: a rule
                    // switched to "block", or an edit, since it was scheduled must not slip through.
                    if ((await activeRules(this.contentRules, e.contentType.schema)) && !(await this.passesRules(e))) return;
                    published++;
                    const at = e.scheduledAt ?? now;
                    // The schedule has happened: clear it, so the entry stops reading as
                    // "scheduled" forever. The first publish date is kept across re-publishes.
                    await this.prisma.contentEntry.update({
                        where: { id: e.id },
                        data: { status: "PUBLISHED", publishedAt: at, firstPublishedAt: e.firstPublishedAt ?? e.publishedAt ?? at, scheduledAt: null },
                    });
                    // A version for what went live, and the activity row: published by the
                    // scheduler, not by a person.
                    const last = await this.prisma.contentVersion.findFirst({ where: { entryId: e.id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
                    const versionAfter = (last?.versionNumber ?? 0) + 1;
                    await this.prisma.contentVersion
                        .create({ data: { entryId: e.id, data: (e.data ?? {}) as object, status: "PUBLISHED", versionNumber: versionAfter, actorName: "Scheduled publish", label: "published", note: "scheduled publish" } })
                        .catch(() => undefined);
                    await this.prisma.auditLog
                        .create({
                            data: {
                                workspaceId: e.workspaceId,
                                userId: null,
                                actorName: "Scheduled publish",
                                action: "content.publish",
                                resource: "ContentEntry",
                                resourceId: e.id,
                                entryType: e.contentType.apiId,
                                title: e.title,
                                slug: e.slug,
                                versionBefore: last?.versionNumber ?? null,
                                versionAfter,
                                metadata: { from: "SCHEDULED", to: "PUBLISHED", scheduledAt: e.scheduledAt },
                            },
                        })
                        .catch(() => undefined);
                    void this.cache.delByPrefix(`dash:${e.workspaceId}:`);
                    void this.webhooks.dispatch(e.workspaceId, "content.published", {
                        id: e.id,
                        slug: e.slug,
                        type: e.contentType.apiId,
                        status: "PUBLISHED",
                        publishedAt: e.scheduledAt ?? now,
                    });
                }),
            );
            if (published) this.logger.log(`Auto-published ${published} scheduled ${published === 1 ? "entry" : "entries"}.`);
            return published;
        } catch (err) {
            this.logger.error("Auto-publish pass failed", err as Error);
            return 0;
        } finally {
            this.running = false;
        }
    }
}
