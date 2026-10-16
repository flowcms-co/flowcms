import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ContentEntry, ContentStatus, Prisma, ReviewDecision } from "@flowcms/db";
import { PERMISSIONS, sameContent, slugify } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WebhooksService, type WebhookEvent } from "../webhooks/webhooks.service";
import { ConnectorsService, type ConnectorEvent } from "../connectors/connectors.service";
import { PluginsService } from "../plugins/plugins.service";
import { APPROVAL_PORT, type ApprovalPort } from "./approval.port";
import { RBAC_PORT, type RbacPort, type RoleRules } from "./rbac.port";
import { CreateEntryDto, UpdateEntryDto } from "./entries.dto";
import { fieldsOf, validateEntryData, type ComponentMap, type SchemaField } from "./entry-validation";
import { RelationSyncService, refIds, reverseDelta, applyForwardValue } from "./relation-sync.service";
import { entryPath } from "./route-path";
import { authorWhere, autoAuthorId, effectiveAuthorId } from "./author";
import { keepStoredShape } from "./component-shape";
import { placeholdersIn, resolvePlaceholders, slugFromPattern } from "./slug-pattern";
import { draftDiff, getPath, pickPaths, setPaths, type FieldChange } from "./draft-diff";
import { eventForStatusChange, type ContentEvent } from "./content-events";
import { AuditService } from "../audit/audit.service";
import { currentActor } from "../common/request-context";
import { apiActorAt } from "../common/token-at";

/** The content-type columns every entry read needs: identity + the schema JSON,
 *  which carries the page type that `entryPath` uses to build the public path
 *  (a "static" type routes to /<slug>, not /<apiId>/<slug>). `schema` is used only
 *  to compute the path — it is never returned in the entry response (see shape()). */
const CT_SELECT = { id: true, name: true, apiId: true, pluralApiId: true, schema: true } as const;

type EntryWithType = ContentEntry & {
    contentType: { id: string; name: string; apiId: string; pluralApiId?: string | null; schema?: Prisma.JsonValue };
};
type Shaped = ReturnType<ContentEntriesService["shape"]>;

/** Statuses for which all required fields must be present. */
const REQUIRE_COMPLETE = new Set<ContentStatus>(["PUBLISHED", "SCHEDULED", "APPROVED"]);

/** Statuses an actor may only move INTO with publish rights. Reaching APPROVED is
 *  otherwise reserved to the reviewer flow (recordReview); SCHEDULED/PUBLISHED to a
 *  publisher. This stops a content.update-only actor from PATCHing straight to
 *  APPROVED and then publishing (approval-workflow bypass). */
const PUBLISH_STATES = new Set<string>(["APPROVED", "SCHEDULED", "PUBLISHED"]);

/** The top-level field a path starts in ("heroSection" for "heroSection.subheadline"). */
const pathKeysTop = (path: string) => path.split(/[.[]/)[0];

/** The events the Review tab's sign-off log shows. */
const SIGNOFF_ACTIONS = ["content.submit", "content.approve", "content.request_changes", "content.schedule", "content.publish", "content.unpublish", "content.restore"] as const;

/** Does this actor's permission/scope set grant publish? `undefined` = trusted
 *  internal caller (scheduler, review flow) → allowed. */
const grantsPublish = (perms?: string[]): boolean =>
    !perms || perms.includes("*") || perms.includes(PERMISSIONS.CONTENT_PUBLISH);

@Injectable()
export class ContentEntriesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cache: CacheService,
        private readonly notifications: NotificationsService,
        private readonly webhooks: WebhooksService,
        private readonly connectors: ConnectorsService,
        private readonly plugins: PluginsService,
        private readonly relations: RelationSyncService,
        // Provided by the EE `approval_workflows` module when present; absent (and
        // so unenforced) in Community.
        @Optional() @Inject(APPROVAL_PORT) private readonly approvals?: ApprovalPort,
        // EE `advanced_rbac` field-level rules; absent (unenforced) in Community.
        @Optional() @Inject(RBAC_PORT) private readonly rbac?: RbacPort,
        @Optional() private readonly audit?: AuditService,
    ) {}

    private readonly logger = new Logger(ContentEntriesService.name);

    // ── Reverse (bidirectional) relation helpers ───────────────────────────────────
    // A reverse Reference field (mappedByField set) is derived from the other side, so
    // it's never stored on the entry. These helpers keep it out of the data blob, fill
    // it in for the editor, and propagate edits made from the reverse side onto the
    // owning entries' forward field (reusing update() so all the usual rules apply).

    /** Reverse Reference fields declared on a content type's schema. */
    private reverseFields(schema: unknown): SchemaField[] {
        return fieldsOf(schema).filter((f) => f.type === "Reference" && !!f.mappedByField && !!f.referencedTypeId);
    }

    /** A copy of `data` with every reverse-field key removed (they're derived). */
    private stripReverse(schema: unknown, data: Record<string, unknown>): Record<string, unknown> {
        const reverse = this.reverseFields(schema);
        if (!reverse.length) return data;
        const out = { ...data };
        for (const f of reverse) delete out[f.name];
        return out;
    }

    /** Fill an entry's reverse fields with their current linked ids (from the join
     *  table) so the editor can show + round-trip them. Best-effort. */
    private async withReverseIds(workspaceId: string, entryId: string, schema: unknown, data: Record<string, unknown>): Promise<Record<string, unknown>> {
        const reverse = this.reverseFields(schema);
        if (!reverse.length) return data;
        const out = { ...data };
        try {
            for (const f of reverse) {
                const rels = await this.prisma.entryRelation.findMany({
                    where: { workspaceId, toId: entryId, fromTypeId: f.referencedTypeId!, fromField: f.mappedByField! },
                    orderBy: { order: "asc" },
                    select: { fromId: true },
                });
                const ids = rels.map((r) => r.fromId);
                out[f.name] = f.multiple ? ids : (ids[0] ?? null);
            }
        } catch (err) {
            this.logger.warn(`Reverse-id fill failed for entry ${entryId}: ${(err as Error).message}`);
        }
        return out;
    }

    /** Propagate a reverse-side relation edit onto the owning entries: for each owner
     *  newly linked / unlinked, set its forward field via update() (so draft overlay,
     *  validation, RBAC and join-table sync all apply). Best-effort: an owner that
     *  can't be edited is logged and skipped, never failing the originating save. */
    private async propagateReverse(
        workspaceId: string,
        entryId: string,
        schema: unknown,
        submitted: Record<string, unknown>,
        ctx: { actorId?: string; role?: RoleRules; actorPermissions?: string[] },
    ): Promise<void> {
        for (const f of this.reverseFields(schema)) {
            if (!(f.name in submitted)) continue; // not submitted → leave links untouched
            const ownerTypeId = f.referencedTypeId!;
            const forwardField = f.mappedByField!;
            const desired = refIds(submitted[f.name]);
            const prev = await this.prisma.entryRelation.findMany({
                where: { workspaceId, toId: entryId, fromTypeId: ownerTypeId, fromField: forwardField },
                select: { fromId: true },
            });
            const { add, remove } = reverseDelta(prev.map((r) => r.fromId), desired);
            if (!add.length && !remove.length) continue;

            const ownerType = await this.prisma.contentType.findFirst({ where: { id: ownerTypeId, workspaceId }, select: { schema: true } });
            const forwardMultiple = !!fieldsOf(ownerType?.schema).find((x) => x.name === forwardField)?.multiple;

            const ops: [string, "add" | "remove"][] = [...add.map((id) => [id, "add"] as [string, "add"]), ...remove.map((id) => [id, "remove"] as [string, "remove"])];
            for (const [ownerId, op] of ops) {
                try {
                    const owner = await this.prisma.contentEntry.findFirst({ where: { id: ownerId, workspaceId }, select: { data: true, draftData: true } });
                    if (!owner) continue;
                    const cur = (owner.draftData ?? owner.data ?? {}) as Record<string, unknown>;
                    const next = applyForwardValue(cur[forwardField], entryId, op, forwardMultiple);
                    await this.update(workspaceId, ownerId, { data: { [forwardField]: next } } as UpdateEntryDto, ctx.actorId, ctx.role, ctx.actorPermissions);
                } catch (err) {
                    this.logger.warn(`Reverse propagation to owner ${ownerId} failed: ${(err as Error).message}`);
                }
            }
        }
    }

    /** Record who did what to an entry in the activity log, with the entry's title,
     *  slug and type as they are now, the field-level changes and the version
     *  numbers. Every real save is its own row (no-op saves never get here). */
    private async logEvent(
        workspaceId: string,
        actorId: string | null | undefined,
        action: ContentEvent,
        entryId: string,
        extra: { changes?: FieldChange[]; versions?: { before: number | null; after: number | null }; metadata?: Record<string, unknown> } = {},
    ) {
        if (!this.audit) return;
        const e = await this.prisma.contentEntry.findFirst({
            where: { id: entryId },
            select: { slug: true, data: true, draftData: true, contentType: { select: { apiId: true } } },
        });
        const changes = extra.changes?.map((c) => ({ path: c.path, before: c.before, after: c.after, ...(c.formattingOnly ? { formattingOnly: true } : {}) }));
        await this.audit.log({
            workspaceId,
            // No actor passed: the request's user (or null for an API token).
            ...(actorId ? { userId: actorId } : {}),
            action,
            resource: "ContentEntry",
            resourceId: entryId,
            entryType: e?.contentType.apiId ?? null,
            title: e ? this.title({ data: e.draftData ?? e.data } as ContentEntry) : null,
            slug: e?.slug ?? null,
            versionBefore: extra.versions?.before ?? null,
            versionAfter: extra.versions?.after ?? null,
            metadata: changes?.length || extra.metadata ? { ...(changes?.length ? { changes } : {}), ...(extra.metadata ?? {}) } : null,
        });
    }

    /** Best-effort outbound fan-out for a content event: webhooks + Slack/Zapier connectors. */
    private fire(workspaceId: string, event: WebhookEvent, entry: Shaped) {
        void this.webhooks.dispatch(workspaceId, event, entry);
        void this.connectors.dispatch(workspaceId, event as ConnectorEvent, entry);
        // Bust cached dashboard aggregates for the workspace (content changed).
        void this.cache.delByPrefix(`dash:${workspaceId}:`);
    }

    /** How many full-body version snapshots to retain per entry. Each stores a
     *  complete copy of the entry data, so growth is bounded; drafts merge (below),
     *  so most of these are publishes, restores and status changes. */
    private static readonly VERSION_RETENTION = 50;
    /** One person's autosaves to a draft within this window are one version. */
    private static readonly DRAFT_MERGE_MS = 10 * 60_000;

    /** The display name for a version's author: the request's actor when it's them
     *  (or an API token), otherwise the named user. */
    private async actorNameFor(createdById?: string | null): Promise<string | null> {
        const who = currentActor();
        if (!createdById || createdById === who.userId || who.tokenId) return who.name;
        const u = await this.prisma.user.findUnique({ where: { id: createdById }, select: { name: true, email: true } });
        return u ? u.name || u.email : who.name;
    }

    /** Append a version snapshot (label "published" when it is what went live,
     *  "draft" otherwise), then prune past the retention window. Repeated draft
     *  saves by one person update their open draft version instead of adding one, so
     *  autosave doesn't push real history out. Returns the version numbers before
     *  and after. */
    private async snapshot(
        entryId: string,
        data: unknown,
        status: ContentStatus,
        createdById?: string | null,
        opts: { label?: "draft" | "published"; note?: string } = {},
    ): Promise<{ before: number | null; after: number }> {
        const label = opts.label ?? (status === "PUBLISHED" ? "published" : "draft");
        const actorName = await this.actorNameFor(createdById);
        const last = await this.prisma.contentVersion.findFirst({
            where: { entryId },
            orderBy: { versionNumber: "desc" },
            select: { id: true, versionNumber: true, label: true, note: true, createdById: true, actorName: true, updatedAt: true },
        });
        if (
            last &&
            label === "draft" &&
            !opts.note &&
            last.label === "draft" &&
            !last.note &&
            (last.createdById ?? null) === (createdById ?? null) &&
            last.actorName === actorName &&
            Date.now() - last.updatedAt.getTime() < ContentEntriesService.DRAFT_MERGE_MS
        ) {
            await this.prisma.contentVersion.update({ where: { id: last.id }, data: { data: (data ?? {}) as object, status } });
            return { before: last.versionNumber, after: last.versionNumber };
        }
        const versionNumber = (last?.versionNumber ?? 0) + 1;
        await this.prisma.contentVersion.create({
            data: {
                entryId,
                data: (data ?? {}) as object,
                status,
                versionNumber,
                createdById: createdById ?? currentActor().userId ?? null,
                actorName,
                label,
                note: opts.note ?? null,
            },
        });
        // Prune snapshots older than the retention window (keep the newest N).
        const cutoff = versionNumber - ContentEntriesService.VERSION_RETENTION;
        if (cutoff > 0) {
            await this.prisma.contentVersion
                .deleteMany({ where: { entryId, versionNumber: { lte: cutoff } } })
                .catch(() => undefined);
        }
        return { before: last?.versionNumber ?? null, after: versionNumber };
    }

    /** Version history for an entry (newest first): who made each, whether it was a
     *  draft or what went live, and any note ("restored from v41"). */
    async versions(workspaceId: string, entryId: string) {
        const entry = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId }, select: { id: true, workspaceId: true } });
        if (!entry) throw new NotFoundException("Entry not found.");
        const rows = await this.prisma.contentVersion.findMany({ where: { entryId }, orderBy: { versionNumber: "desc" }, take: ContentEntriesService.VERSION_RETENTION });
        // Versions from before authors were stored by name: look the user up.
        const ids = [...new Set(rows.filter((r) => !r.actorName).map((r) => r.createdById).filter(Boolean) as string[])];
        const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
        const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? null) : null);
        // No author stored: an API write from before names were recorded.
        const tokens = rows.some((r) => !r.actorName && !r.createdById)
            ? await this.prisma.apiToken.findMany({ where: { workspaceId, type: { in: ["AGENT", "ADMIN"] } }, select: { name: true, createdAt: true, revokedAt: true } })
            : [];
        const authorOf = (v: (typeof rows)[number]) => v.actorName ?? (v.createdById ? (nameOf(v.createdById) ?? "Former member") : apiActorAt(tokens, v.createdAt));
        return rows.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            status: v.status,
            label: v.label,
            note: v.note,
            title: ((v.data as { title?: string })?.title) ?? "Untitled",
            author: authorOf(v),
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
        }));
    }

    /** A version by its id or its number ("41" or "v41"), within the workspace. */
    private async findVersion(workspaceId: string, entryId: string, ref: string) {
        const n = /^v?\d+$/i.test(ref) ? Number(ref.replace(/^v/i, "")) : null;
        const version = await this.prisma.contentVersion.findFirst({
            where: { entryId, entry: { workspaceId }, ...(n != null ? { versionNumber: n } : { id: ref }) },
        });
        if (!version) throw new NotFoundException("Version not found.");
        return version;
    }

    /** One version with its full content, and what it differs by from the live
     *  version (and from the pending draft, when there is one): changed fields only. */
    async version(workspaceId: string, entryId: string, ref: string) {
        const entry = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId }, select: { data: true, draftData: true, status: true } });
        if (!entry) throw new NotFoundException("Entry not found.");
        const v = await this.findVersion(workspaceId, entryId, ref);
        const [meta] = (await this.versions(workspaceId, entryId)).filter((x) => x.id === v.id);
        const live = entry.status === "PUBLISHED" ? entry.data : null;
        return {
            ...(meta ?? { id: v.id, versionNumber: v.versionNumber, status: v.status, label: v.label, note: v.note, author: v.actorName, createdAt: v.createdAt }),
            data: v.data,
            // What restoring this version would change on the live page (null when the
            // entry isn't live), and in the content being edited.
            diffFromLive: live ? draftDiff(live, v.data) : null,
            diffFromCurrent: draftDiff(entry.draftData ?? entry.data, v.data),
        };
    }

    /**
     * Restore a past version. Never overwrites history: the result is a new version
     * noted "restored from vN", logged with the actor and reason.
     *  - `mode: "draft"` (default) puts the restored content up for review: on a live
     *    entry it becomes the pending draft (the live page is unchanged until it is
     *    approved and published); otherwise the entry goes back to draft.
     *  - `mode: "publish"` makes it live now and fires content.published, so the site
     *    refreshes. Needs publish rights.
     *  - `fields` restores only those field paths (`faq`, `sections[2]`), keeping
     *    every other field as it is.
     */
    async restore(
        workspaceId: string,
        entryId: string,
        versionRef: string,
        actorId?: string,
        opts: { mode?: "draft" | "publish"; reason?: string; fields?: string[]; actorPermissions?: string[] } = {},
    ) {
        const existing = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId }, include: { contentType: { select: CT_SELECT } } });
        if (!existing) throw new NotFoundException("Entry not found.");
        const version = await this.findVersion(workspaceId, entryId, versionRef);
        const mode = opts.mode ?? "draft";
        if (mode === "publish" && !grantsPublish(opts.actorPermissions)) throw new ForbiddenException("Restoring and publishing needs publish rights. Restore as a draft instead.");
        const reason = opts.reason?.trim().slice(0, 1000) || undefined;
        const fields = (opts.fields ?? []).map((f) => f.trim()).filter(Boolean);

        const live = (existing.data ?? {}) as Record<string, unknown>;
        const base = (existing.draftData ?? existing.data ?? {}) as Record<string, unknown>;
        let restored: Record<string, unknown>;
        try {
            restored = fields.length ? pickPaths(base, version.data, fields) : structuredClone((version.data ?? {}) as Record<string, unknown>);
        } catch (e) {
            throw new BadRequestException((e as Error).message);
        }
        const schema = existing.contentType.schema;
        validateEntryData(fieldsOf(schema), restored, { enforceRequired: mode === "publish", slug: existing.slug, components: await this.componentMap(workspaceId) });

        const note = `restored from v${version.versionNumber}${fields.length ? ` (${fields.join(", ")})` : ""}`;
        const isLive = existing.status === "PUBLISHED";
        let e: EntryWithType;
        let changes: FieldChange[];
        let versions: { before: number | null; after: number };
        if (mode === "publish") {
            const now = new Date();
            e = await this.prisma.contentEntry.update({
                where: { id: entryId },
                data: {
                    data: restored as Prisma.InputJsonValue,
                    draftData: Prisma.DbNull,
                    draftApproved: false,
                    status: "PUBLISHED",
                    publishedAt: now,
                    firstPublishedAt: existing.firstPublishedAt ?? existing.publishedAt ?? now,
                    scheduledAt: null,
                    ...(actorId ? { lastEditorId: actorId } : {}),
                },
                include: { contentType: { select: CT_SELECT } },
            });
            changes = draftDiff(isLive ? live : base, restored);
            versions = await this.snapshot(entryId, restored, "PUBLISHED", actorId, { label: "published", note });
        } else if (isLive) {
            e = await this.prisma.contentEntry.update({
                where: { id: entryId },
                data: { draftData: restored as Prisma.InputJsonValue, draftApproved: false, ...(actorId ? { lastEditorId: actorId } : {}) },
                include: { contentType: { select: CT_SELECT } },
            });
            changes = draftDiff(base, restored);
            versions = await this.snapshot(entryId, restored, "PUBLISHED", actorId, { label: "draft", note });
        } else {
            e = await this.prisma.contentEntry.update({
                where: { id: entryId },
                data: { data: restored as Prisma.InputJsonValue, status: "DRAFT", scheduledAt: null, ...(actorId ? { lastEditorId: actorId } : {}) },
                include: { contentType: { select: CT_SELECT } },
            });
            changes = draftDiff(base, restored);
            versions = await this.snapshot(entryId, restored, "DRAFT", actorId, { label: "draft", note });
        }
        if (mode === "publish" || !isLive) await this.relations.syncEntry(workspaceId, e.id, e.contentTypeId, e.contentType.schema, restored);
        await this.logEvent(workspaceId, actorId, "content.restore", entryId, {
            changes,
            versions,
            metadata: { fromVersion: version.versionNumber, mode, ...(fields.length ? { fields } : {}), ...(reason ? { reason } : {}) },
        });
        const shaped = this.shape(e);
        const out = mode === "draft" && isLive ? { ...shaped, data: e.draftData, title: String((e.draftData as { title?: unknown })?.title ?? shaped.title) } : shaped;
        this.fire(workspaceId, "content.updated", shaped);
        void this.webhooks.dispatch(workspaceId, "content.restored", { ...shaped, restoredFrom: version.versionNumber, version: versions.after, mode });
        if (mode === "publish") this.fire(workspaceId, "content.published", shaped);
        return { ...out, versionNumber: versions.after, restoredFrom: version.versionNumber };
    }

    /** A restore attempt the actor wasn't allowed to make, kept in the log. */
    async logDeniedRestore(workspaceId: string, entryId: string, versionRef: string, reason: string) {
        await this.logEvent(workspaceId, undefined, "content.restore", entryId, { metadata: { denied: true, version: versionRef, reason } });
    }

    /** Reviewers' sign-off decisions for an entry's current cycle + the policy. */
    async listReviews(workspaceId: string, entryId: string) {
        const entry = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId }, select: { id: true, status: true } });
        if (!entry) throw new NotFoundException("Entry not found.");
        const rows = await this.prisma.contentReview.findMany({ where: { entryId }, orderBy: { createdAt: "desc" } });
        const ids = [...new Set(rows.map((r) => r.reviewerId))];
        const users = ids.length
            ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
            : [];
        const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? "Reviewer";
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { approvalsRequired: true } });
        const required = ws?.approvalsRequired ?? 1;
        const approvals = rows.filter((r) => r.decision === "APPROVED").length;
        const enforced = this.approvals ? await this.approvals.isEnforced(workspaceId) : false;
        return {
            status: entry.status,
            approvalsRequired: required,
            approvals,
            isApproved: entry.status === "APPROVED" || approvals >= required,
            // Approval is only required (so the UI shows "Submit for approval") when
            // the workspace is licensed for it.
            enforced,
            reviews: rows.map((r) => ({ reviewer: nameOf(r.reviewerId), decision: r.decision, note: r.note, at: r.createdAt })),
            // The full sign-off log across every cycle: each submit, decision, publish
            // and restore with who did it and the version it produced.
            history: await this.signoffHistory(workspaceId, entryId),
        };
    }

    private async signoffHistory(workspaceId: string, entryId: string) {
        const rows = await this.prisma.auditLog.findMany({
            where: { workspaceId, resourceId: entryId, action: { in: [...SIGNOFF_ACTIONS] } },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: { id: true, action: true, actorName: true, userId: true, createdAt: true, versionAfter: true, metadata: true, user: { select: { name: true, email: true } } },
        });
        return rows.flatMap((r) => {
            const m = (r.metadata ?? {}) as { note?: string; reason?: string; fromVersion?: number; denied?: boolean };
            if (m.denied) return []; // refused attempts are in the activity log, not the sign-off log
            return [{
                id: r.id,
                action: r.action,
                actor: r.actorName ?? r.user?.name ?? r.user?.email ?? (r.userId ? "Former member" : "System"),
                at: r.createdAt,
                version: r.versionAfter,
                note: m.note ?? m.reason ?? null,
                fromVersion: m.fromVersion ?? null,
            }];
        });
    }

    /** Record a reviewer's decision. Enough APPROVED → flip to APPROVED; a
     *  CHANGES_REQUESTED sends the entry back to DRAFT and pings the author. */
    async recordReview(workspaceId: string, entryId: string, reviewerId: string, decision: "approve" | "request_changes", note?: string) {
        const entry = await this.prisma.contentEntry.findFirst({
            where: { id: entryId, workspaceId },
            include: { contentType: { select: CT_SELECT } },
        });
        if (!entry) throw new NotFoundException("Entry not found.");
        const d: ReviewDecision = decision === "approve" ? "APPROVED" : "CHANGES_REQUESTED";
        await this.prisma.contentReview.upsert({
            where: { entryId_reviewerId: { entryId, reviewerId } },
            update: { decision: d, note: note?.trim() || null },
            create: { entryId, reviewerId, decision: d, note: note?.trim() || null },
        });
        const reviewer = await this.prisma.user.findUnique({ where: { id: reviewerId }, select: { name: true, email: true } });
        const who = reviewer?.name ?? reviewer?.email ?? "A reviewer";
        const href = `/content/editor?id=${entryId}`;
        const reviewed = await this.prisma.contentVersion.findFirst({ where: { entryId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
        const at = reviewed ? { before: reviewed.versionNumber, after: reviewed.versionNumber } : undefined;

        if (decision === "request_changes") {
            await this.logEvent(workspaceId, reviewerId, "content.request_changes", entryId, { versions: at, metadata: note?.trim() ? { note: note.trim() } : undefined });
            if (entry.status !== "DRAFT") await this.prisma.contentEntry.update({ where: { id: entryId }, data: { status: "DRAFT" } });
            const authorId = effectiveAuthorId(entry, await this.authorMode(workspaceId));
            if (authorId && authorId !== reviewerId) {
                try {
                    await this.notifications.create(workspaceId, authorId, {
                        type: "changes_requested",
                        title: "Changes requested",
                        body: `${who} requested changes on “${this.title(entry)}”.`,
                        href,
                    });
                } catch {
                    /* best-effort */
                }
            }
            return this.listReviews(workspaceId, entryId);
        }

        // Approve: flip to APPROVED once distinct approvals meet the policy threshold.
        const approvals = await this.prisma.contentReview.count({ where: { entryId, decision: "APPROVED" } });
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { approvalsRequired: true } });
        const required = ws?.approvalsRequired ?? 1;
        const flips = entry.status === "IN_REVIEW" && approvals >= required;
        if (!flips) await this.logEvent(workspaceId, reviewerId, "content.approve", entryId, { versions: at, metadata: { approvals, required, ...(note?.trim() ? { note: note.trim() } : {}) } });
        if (flips) {
            const e = await this.prisma.contentEntry.update({
                where: { id: entryId },
                data: { status: "APPROVED" },
                include: { contentType: { select: CT_SELECT } },
            });
            const versions = await this.snapshot(entryId, entry.data, "APPROVED", reviewerId);
            await this.logEvent(workspaceId, reviewerId, "content.approve", entryId, { versions, metadata: { approvals, required, ...(note?.trim() ? { note: note.trim() } : {}) } });
            await this.notifyTransition(workspaceId, reviewerId, entry, this.title(e), "IN_REVIEW", "APPROVED");
            this.fire(workspaceId, "content.updated", this.shape(e));
        }
        return this.listReviews(workspaceId, entryId);
    }

    /** Fire notifications for a status transition (best-effort, never blocks the write). */
    private async notifyTransition(
        workspaceId: string,
        actorId: string,
        entry: { id: string; authorId: string | null; lastEditorId: string | null; authorOverrideId: string | null },
        title: string,
        from: ContentStatus,
        to: ContentStatus,
    ) {
        if (from === to) return;
        const href = `/content/editor?id=${entry.id}`;
        const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } });
        const who = actor?.name ?? actor?.email ?? "Someone";
        try {
            // "Your content was ..." goes to the entry's author as the workspace defines it.
            const authorId = effectiveAuthorId(entry, await this.authorMode(workspaceId));
            if (to === "IN_REVIEW") {
                const reviewers = await this.notifications.reviewers(workspaceId, actorId);
                await this.notifications.createMany(workspaceId, reviewers, {
                    type: "review_requested",
                    title: "Content submitted for review",
                    body: `${who} submitted “${title}” for review.`,
                    href: "/content?status=review",
                });
            } else if (to === "APPROVED" && authorId && authorId !== actorId) {
                await this.notifications.create(workspaceId, authorId, { type: "approved", title: "Your content was approved", body: `“${title}” was approved by ${who}.`, href });
            } else if (to === "PUBLISHED" && authorId && authorId !== actorId) {
                await this.notifications.create(workspaceId, authorId, { type: "published", title: "Your content was published", body: `“${title}” is now live.`, href });
            } else if (to === "SCHEDULED" && authorId && authorId !== actorId) {
                await this.notifications.create(workspaceId, authorId, { type: "scheduled", title: "Your content was scheduled", body: `“${title}” was scheduled by ${who}.`, href });
            }
        } catch {
            /* notifications are best-effort */
        }
    }

    private title(e: ContentEntry) {
        const d = (e.data ?? {}) as { title?: string };
        return d.title ?? "Untitled";
    }

    /** Reusable-component definitions for the workspace (apiId → field defs), used
     *  to resolve component references + validate dynamic-zone sections. Reusable
     *  components are content types of kind COMPONENT. */
    async componentMap(workspaceId: string): Promise<ComponentMap> {
        const comps = await this.prisma.contentType.findMany({
            where: { workspaceId, kind: "COMPONENT" },
            select: { apiId: true, schema: true },
        });
        const map: ComponentMap = {};
        for (const c of comps) map[c.apiId] = fieldsOf(c.schema);
        return map;
    }

    /** Keep the SEO meta title linked to the entry title unless the user set a custom
     *  one. `prev` is the entry data before this edit (undefined on create). A meta
     *  title becomes a deliberate override once it's non-empty and differs from the
     *  title it was saved alongside; from then on, title edits don't overwrite it. An
     *  empty meta title always falls back to the title. Mutates `next`. */
    private syncMetaTitle(next: Record<string, unknown>, prev?: Record<string, unknown>) {
        const s = (v: unknown) => (typeof v === "string" ? v : "");
        const newTitle = s(next.title);
        const nextMeta = s(next.metaTitle).trim();
        const prevTitle = s(prev?.title);
        const prevMeta = s(prev?.metaTitle).trim();
        if (!nextMeta) {
            next.metaTitle = newTitle; // empty meta title always tracks the page title
            return;
        }
        const customBefore = !!prevMeta && prevMeta !== prevTitle;
        const customNow = nextMeta !== newTitle && nextMeta !== prevMeta;
        if (!customBefore && !customNow) next.metaTitle = newTitle;
    }

    private shape(e: EntryWithType, authorName?: string) {
        return {
            id: e.id,
            title: this.title(e),
            slug: e.slug,
            status: e.status,
            locale: e.locale,
            // Identity only — the type's `schema` is selected for path derivation
            // (entryPath, below) but intentionally not exposed in the entry payload.
            contentType: { id: e.contentType.id, name: e.contentType.name, apiId: e.contentType.apiId, pluralApiId: e.contentType.pluralApiId },
            // Site-relative path the entry lives at on the public frontend, derived
            // from the content type's route prefix: "/services/<slug>", "/blogs/<slug>",
            // or "/" for a homepage type. Lets the studio preview the right page and
            // gives webhook consumers the URL to revalidate.
            path: entryPath(e.contentType, e.slug, { locale: e.locale }),
            author: authorName ? { name: authorName } : null,
            publishedAt: e.publishedAt,
            scheduledAt: e.scheduledAt,
            updatedAt: e.updatedAt,
            data: e.data,
            // Draft-over-published overlay state (false/absent for entries edited in place).
            hasDraft: e.draftData != null,
            draftApproved: e.draftApproved,
        };
    }

    /** The type's slug pattern ("{service.slug}-{city.slug}"), or "" when slugs are typed. */
    private slugPatternOf(schema: unknown): string {
        const p = (schema as { slugPattern?: unknown } | null)?.slugPattern;
        return typeof p === "string" ? p.trim() : "";
    }

    /** Values for every placeholder the type's slug, URL and preview patterns use,
     *  from this entry's data (own fields, and the slug/title of referenced entries). */
    private async patternValues(workspaceId: string, schema: unknown, data: Record<string, unknown>): Promise<Record<string, string>> {
        const s = (schema ?? {}) as { slugPattern?: string; routePattern?: string; previewUrl?: string };
        const keys = placeholdersIn([s.slugPattern, s.routePattern, s.previewUrl].filter((x): x is string => typeof x === "string").join(" "));
        if (!keys.length) return {};
        return resolvePlaceholders(fieldsOf(schema), data, keys, async (id) => {
            const r = await this.prisma.contentEntry.findFirst({ where: { id, workspaceId }, select: { slug: true, title: true } });
            return r ? { slug: r.slug, title: r.title ?? "Untitled" } : null;
        });
    }

    /** The slug a patterned type gives this entry, made unique within the type and
     *  locale; null when the type has no pattern or a placeholder is still empty. */
    private async derivedSlug(workspaceId: string, contentTypeId: string, schema: unknown, data: Record<string, unknown>, locale: string, excludeId?: string): Promise<string | null> {
        const pattern = this.slugPatternOf(schema);
        if (!pattern) return null;
        const wanted = slugFromPattern(pattern, await this.patternValues(workspaceId, schema, data));
        return wanted ? this.uniqueSlug(workspaceId, contentTypeId, wanted, locale, excludeId) : null;
    }

    private async authorMode(workspaceId: string): Promise<string> {
        const w = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { authorMode: true } });
        return w?.authorMode ?? "creator";
    }

    /** Did a save actually change the content? Autosave and re-saves of identical
     *  data must not make the saver the entry's last editor. */
    /** The live version and the pending draft side by side, with what the draft
     *  changes. `draftData` is null and `changes` empty when nothing is pending. */
    async liveAndDraft(workspaceId: string, id: string) {
        const e = await this.prisma.contentEntry.findFirst({ where: { id, workspaceId }, select: { data: true, draftData: true, draftApproved: true, status: true } });
        if (!e) throw new NotFoundException("Entry not found.");
        const changes = e.draftData != null ? draftDiff(e.data, e.draftData) : [];
        return {
            hasDraft: e.draftData != null,
            draftApproved: e.draftApproved,
            liveData: e.data,
            draftData: e.draftData ?? null,
            changes,
            // True when publishing the draft would change nothing a reader sees.
            formattingOnly: changes.length > 0 && changes.every((c) => c.formattingOnly),
        };
    }

    /** The entry as it stands, for a save that changed nothing. */
    private async unchanged(workspaceId: string, id: string) {
        const e = await this.prisma.contentEntry.findFirstOrThrow({ where: { id, workspaceId }, include: { contentType: { select: CT_SELECT } } });
        const shaped = this.shape(e);
        return e.draftData != null ? { ...shaped, data: e.draftData, title: String((e.draftData as { title?: unknown }).title ?? shaped.title) } : shaped;
    }

    /** Pending drafts that differ from the live version only by how a rich text
     *  editor re-wrote the HTML (link target/rel it added, paragraphs inside list
     *  items, an empty trailing paragraph, `&amp;` for `&`): nobody typed them, and
     *  publishing one would ship `nofollow` on the page's internal links. */
    async formattingOnlyDrafts(workspaceId: string) {
        const rows = await this.prisma.contentEntry.findMany({
            where: { workspaceId, status: "PUBLISHED", draftData: { not: Prisma.DbNull } },
            select: { id: true, title: true, slug: true, data: true, draftData: true, contentType: { select: { name: true } } },
            orderBy: { id: "asc" },
        });
        return rows.filter((r) => sameContent(r.data, r.draftData)).map((r) => ({ id: r.id, title: r.title || "Untitled", slug: r.slug, type: r.contentType.name }));
    }

    /** Discard those drafts. Each is re-checked first, so a draft someone has really
     *  edited in the meantime is never thrown away. */
    async discardFormattingOnlyDrafts(workspaceId: string) {
        const drafts = await this.formattingOnlyDrafts(workspaceId);
        for (const d of drafts) await this.discardDraft(workspaceId, d.id);
        return { discarded: drafts.length };
    }

    private changed(before: unknown, after: unknown): boolean {
        return JSON.stringify(before ?? {}) !== JSON.stringify(after ?? {});
    }

    /** The entry's author for the editor's picker: the current choice, what the
     *  workspace setting would pick on its own, and the members to choose from. */
    async author(workspaceId: string, id: string) {
        const e = await this.prisma.contentEntry.findFirst({ where: { id, workspaceId }, select: { authorId: true, lastEditorId: true, authorOverrideId: true } });
        if (!e) throw new NotFoundException("Entry not found.");
        const members = await this.prisma.membership.findMany({ where: { workspaceId }, select: { user: { select: { id: true, name: true, email: true } } } });
        const list = members.map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email })).sort((a, b) => a.name.localeCompare(b.name));
        const autoId = autoAuthorId(e, await this.authorMode(workspaceId));
        return { overrideId: e.authorOverrideId, autoName: list.find((m) => m.id === autoId)?.name ?? null, members: list };
    }

    /** Hand-pick an entry's author (any workspace member); null hands it back to the workspace setting. */
    async setAuthor(workspaceId: string, id: string, authorId: string | null) {
        const e = await this.prisma.contentEntry.findFirst({ where: { id, workspaceId }, select: { id: true } });
        if (!e) throw new NotFoundException("Entry not found.");
        if (authorId && !(await this.prisma.membership.findFirst({ where: { workspaceId, userId: authorId }, select: { userId: true } }))) {
            throw new BadRequestException("The author must be a member of this workspace.");
        }
        await this.prisma.contentEntry.update({ where: { id }, data: { authorOverrideId: authorId } });
        return this.author(workspaceId, id);
    }

    /** Full entries (with their bodies), newest first, at most 500 per call. List
     *  screens use ContentListService.page instead, which scales to large workspaces. */
    async list(workspaceId: string, opts: { typeId?: string; status?: string; q?: string; locale?: string; authorId?: string; limit?: number; offset?: number }, role?: RoleRules) {
        const where: Prisma.ContentEntryWhereInput = { workspaceId };
        if (opts.typeId) where.contentTypeId = opts.typeId;
        if (opts.status) where.status = opts.status as ContentStatus;
        if (opts.locale) where.locale = opts.locale;
        const mode = await this.authorMode(workspaceId);
        const and: Prisma.ContentEntryWhereInput[] = [];
        if (opts.authorId) and.push(authorWhere(opts.authorId, mode));
        // Search runs in the database, over every entry, not over one page of results.
        const q = opts.q?.trim();
        if (q) and.push({ OR: [{ slug: { contains: q, mode: "insensitive" } }, { data: { path: ["title"], string_contains: q, mode: "insensitive" } }] });
        if (and.length) where.AND = and;
        // advanced_rbac (Pro): scope a role to its allowed content types.
        const allowed = this.rbac && role ? await this.rbac.allowedTypeIds(role) : null;
        if (allowed) {
            where.contentTypeId = opts.typeId
                ? allowed.includes(opts.typeId)
                    ? opts.typeId
                    : " none" // a filtered type the role can't see → no results
                : { in: allowed };
        }
        // Bounded by default (take: 500); callers (e.g. the agent API) may page with
        // limit/offset. Clamped to [1, 500] so a caller can't request an unbounded set.
        const take = opts.limit != null ? Math.min(Math.max(1, Math.floor(opts.limit)), 500) : 500;
        const skip = opts.offset != null ? Math.max(0, Math.floor(opts.offset)) : 0;
        const rows = await this.prisma.contentEntry.findMany({
            where,
            include: { contentType: { select: CT_SELECT } },
            // Tie-break on id so paging is stable when entries share a timestamp
            // (bulk imports), and no entry is skipped or repeated between pages.
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take,
            skip,
        });
        // Resolve author display details (name + title + avatar for richer lists
        // like the Publish Queue, which shows the author's role and picture).
        const authorIds = [...new Set(rows.map((r) => effectiveAuthorId(r, mode)).filter(Boolean) as string[])];
        const users = authorIds.length
            ? await this.prisma.user.findMany({
                  where: { id: { in: authorIds } },
                  select: { id: true, name: true, email: true, title: true, avatarUrl: true, avatarStyle: true },
              })
            : [];
        const userById = new Map(users.map((u) => [u.id, u]));
        const nameOf = (id: string | null) => {
            if (!id) return undefined;
            const u = userById.get(id);
            return u ? (u.name ?? u.email ?? undefined) : undefined;
        };
        return rows.map((r) => {
                const authorId = effectiveAuthorId(r, mode);
                const s = this.shape(r, nameOf(authorId));
                const u = authorId ? userById.get(authorId) : null;
                return {
                    ...s,
                    author: s.author
                        ? { id: authorId, name: s.author.name, title: u?.title ?? null, avatarUrl: u?.avatarUrl ?? null, avatarStyle: u?.avatarStyle ?? null }
                        : null,
                };
            });
    }

    async get(workspaceId: string, id: string) {
        const e = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: CT_SELECT } },
        });
        if (!e) throw new NotFoundException("Entry not found.");
        // The editor edits the draft overlay when one exists (a published entry with
        // pending changes); otherwise it edits the live data directly. The public
        // delivery API still reads `data`, so the last-published copy stays live. Either
        // way, fill reverse-relation fields with their current linked ids so the editor
        // can show + round-trip them (they're not stored in the data blob).
        const raw = ((e.draftData ?? e.data) ?? {}) as Record<string, unknown>;
        const data = await this.withReverseIds(workspaceId, e.id, e.contentType.schema, raw);
        // {field} / {ref.slug} values for the type's URL and preview patterns, and the
        // entry's path with them filled in, so the preview can open the right page.
        const placeholders = await this.patternValues(workspaceId, e.contentType.schema, raw);
        const path = entryPath(e.contentType, e.slug, { locale: e.locale, values: placeholders });
        const draft = e.draftData != null ? ((e.draftData ?? {}) as { title?: string }) : null;
        return { ...this.shape(e), path, placeholders, slugPattern: this.slugPatternOf(e.contentType.schema) || null, data, ...(draft ? { title: draft.title ?? "Untitled" } : {}) };
    }

    /** Is `slug` already taken by another entry of the same type + locale? A page's
     *  public URL is /<type>/<slug>, so a slug only collides within its own content
     *  type and locale (the same slug under a different type is a different URL, and
     *  a localized twin legitimately shares it). Empty/absent slugs never collide. */
    private async slugConflict(
        workspaceId: string,
        contentTypeId: string,
        slug: string | null | undefined,
        locale: string,
        excludeId?: string,
    ): Promise<boolean> {
        const s = (slug ?? "").trim();
        if (!s) return false;
        const hit = await this.prisma.contentEntry.findFirst({
            where: { workspaceId, contentTypeId, locale, slug: s, ...(excludeId ? { id: { not: excludeId } } : {}) },
            select: { id: true },
        });
        return !!hit;
    }

    /** Reject a write whose slug is already used by a sibling entry. */
    private async assertSlugFree(
        workspaceId: string,
        contentTypeId: string,
        slug: string | null | undefined,
        locale: string,
        excludeId?: string,
    ): Promise<void> {
        if (await this.slugConflict(workspaceId, contentTypeId, slug, locale, excludeId)) {
            throw new BadRequestException(
                `The slug “${(slug ?? "").trim()}” is already used by another page. Choose a different one.`,
            );
        }
    }

    /** Find the first free slug at or after `base` by appending -2, -3, … (used to
     *  suggest an alternative inline, and to keep duplicated pages unique). */
    private async uniqueSlug(
        workspaceId: string,
        contentTypeId: string,
        base: string,
        locale: string,
        excludeId?: string,
    ): Promise<string> {
        const root = (base ?? "").trim();
        if (!root) return root;
        // Append a zero-padded counter on collision: foo, foo-01, foo-02, …
        let candidate = root;
        let n = 1;
        while (await this.slugConflict(workspaceId, contentTypeId, candidate, locale, excludeId)) {
            candidate = `${root}-${String(n).padStart(2, "0")}`;
            n++;
        }
        return candidate;
    }

    /** Inline availability check for the studio's slug input: returns whether the
     *  slug is free for the given type + locale and, if not, a free suggestion. */
    async slugAvailability(workspaceId: string, contentTypeId: string, slug: string, locale: string, excludeId?: string) {
        const s = (slug ?? "").trim();
        if (!contentTypeId || !s) return { available: true as const };
        const taken = await this.slugConflict(workspaceId, contentTypeId, s, locale, excludeId);
        if (!taken) return { available: true as const };
        return { available: false as const, suggestion: await this.uniqueSlug(workspaceId, contentTypeId, s, locale, excludeId) };
    }

    /** An entry of this type + locale whose title matches `text` (case-insensitive,
     *  trimmed) or whose slug is the one `text` would produce. Searches the whole type,
     *  so a match is found however many entries it holds. */
    async exactMatch(workspaceId: string, contentTypeId: string, text: string, locale = "en", db: Prisma.TransactionClient = this.prisma) {
        const t = (text ?? "").trim();
        if (!contentTypeId || !t) return null;
        const slug = slugify(t) || null;
        const [hit] = await db.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "ContentEntry"
            WHERE "workspaceId" = ${workspaceId} AND "contentTypeId" = ${contentTypeId} AND "locale" = ${locale}
              AND (lower(btrim("title")) = lower(${t}) OR "slug" = ${slug})
            ORDER BY (lower(btrim("title")) = lower(${t})) DESC, "createdAt" ASC
            LIMIT 1`;
        if (!hit) return null;
        return db.contentEntry.findUnique({ where: { id: hit.id }, include: { contentType: { select: CT_SELECT } } });
    }

    /** The picker's exact-match lookup: the matching entry, shaped, or null. */
    async match(workspaceId: string, contentTypeId: string, text: string, locale = "en") {
        const e = await this.exactMatch(workspaceId, contentTypeId, text, locale);
        return { entry: e ? this.shape(e) : null };
    }

    async create(workspaceId: string, userId: string | null, dto: CreateEntryDto, role?: RoleRules) {
        const type = await this.prisma.contentType.findFirst({
            where: { id: dto.contentTypeId, workspaceId },
        });
        if (!type) throw new BadRequestException("Unknown content type.");
        const locale = dto.locale || "en";
        // Reverse-relation fields are derived, not stored: keep the submitted values
        // to propagate onto the owning entries after save, but strip them from the blob.
        const submittedReverse = { ...(dto.data ?? {}) };
        let data: Record<string, unknown> = this.stripReverse(type.schema, { ...(dto.data ?? {}), title: dto.title ?? "Untitled" });
        // advanced_rbac (Pro): block disallowed types + drop fields the role can't edit.
        if (this.rbac && role) {
            const allowed = await this.rbac.allowedTypeIds(role);
            if (allowed && !allowed.includes(type.id)) throw new ForbiddenException("Your role can't create content of this type.");
            data = (await this.rbac.stripLockedFields(role, data)) as Record<string, unknown>;
            if (data.title === undefined) data.title = dto.title ?? "Untitled";
        }
        // Quick-create: an entry that already has this name wins over a new one.
        const reuse = !!dto.reuseExisting && !!dto.title?.trim();
        if (reuse) {
            const hit = await this.exactMatch(workspaceId, type.id, dto.title!, locale);
            if (hit) return { ...this.shape(hit), existing: true };
        }
        // One slug per page: reject a slug already taken within this type + locale.
        // A patterned type ignores a typed slug: its slug is derived below.
        // A reuse create checks under its lock below, after the last match check.
        const patterned = !!this.slugPatternOf(type.schema);
        if (!patterned && !reuse) await this.assertSlugFree(workspaceId, type.id, dto.slug, locale);
        // New entries are drafts — type-check values but don't require completeness yet.
        validateEntryData(fieldsOf(type.schema), data, { enforceRequired: false, slug: dto.slug ?? null, components: await this.componentMap(workspaceId) });
        // Plugin hooks may augment the data (reading time, word count, excerpt…).
        data = await this.plugins.runBeforeSave(workspaceId, { data, title: String(data.title ?? ""), status: "DRAFT" });
        this.syncMetaTitle(data);
        const slug = patterned ? await this.derivedSlug(workspaceId, type.id, type.schema, data, locale) : (dto.slug ?? null);
        const insert = (db: Prisma.TransactionClient) =>
            db.contentEntry.create({
                data: {
                    workspaceId,
                    contentTypeId: type.id,
                    data: data as Prisma.InputJsonValue,
                    slug,
                    locale,
                    status: "DRAFT",
                    authorId: userId ?? null,
                },
                include: { contentType: { select: CT_SELECT } },
            });
        let e: Awaited<ReturnType<typeof insert>>;
        if (reuse) {
            // Two editors creating the same name at once: serialize on type + name and
            // re-check under the lock, so the second one gets the first one's entry.
            const key = `${type.id}:${locale}:${slugify(dto.title!) || dto.title!.trim().toLowerCase()}`;
            const r = await this.prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
                const hit = await this.exactMatch(workspaceId, type.id, dto.title!, locale, tx);
                if (hit) return { hit };
                if (!patterned) await this.assertSlugFree(workspaceId, type.id, dto.slug, locale);
                return { created: await insert(tx) };
            });
            if (r.hit) return { ...this.shape(r.hit), existing: true };
            e = r.created!;
        } else {
            e = await insert(this.prisma);
        }
        const versions = await this.snapshot(e.id, data, "DRAFT", userId, { note: "created" });
        await this.logEvent(workspaceId, userId, "content.create", e.id, { versions });
        await this.relations.syncEntry(workspaceId, e.id, e.contentTypeId, e.contentType.schema, data);
        await this.propagateReverse(workspaceId, e.id, e.contentType.schema, submittedReverse, { actorId: userId ?? undefined, role });
        const shaped = this.shape(e);
        this.fire(workspaceId, "content.created", shaped);
        return shaped;
    }

    async update(workspaceId: string, id: string, dto: UpdateEntryDto, actorId?: string, role?: RoleRules, actorPermissions?: string[]) {
        const existing = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: { schema: true } } },
        });
        if (!existing) throw new NotFoundException("Entry not found.");

        // One slug per page: a changed slug must be free within this type + locale.
        // A patterned type ignores a typed slug: its slug is derived from the content.
        const patterned = !!this.slugPatternOf(existing.contentType.schema);
        if (patterned) delete dto.slug;
        if (dto.slug !== undefined) {
            await this.assertSlugFree(workspaceId, existing.contentTypeId, dto.slug, existing.locale, id);
        }

        // Authorization: only a publisher may move an entry INTO a sign-off / live
        // state. Editors reach these only through the reviewer flow (submit → a
        // reviewer approves via /review → editor publishes via /publish). Without this
        // a content.update-only actor (session OR agent token) could PATCH status
        // straight to APPROVED/SCHEDULED and bypass the approval workflow.
        if (dto.status !== undefined && dto.status !== existing.status && PUBLISH_STATES.has(dto.status) && !grantsPublish(actorPermissions)) {
            throw new ForbiddenException("Only a reviewer can approve, schedule, or publish content. Submit it for approval instead.");
        }

        // advanced_rbac (Pro): block editing disallowed types + ignore writes to
        // fields the role can't edit (existing values are preserved).
        let incoming = (dto.data ?? {}) as Record<string, unknown>;
        // Reverse-relation fields are derived, not stored: keep the submitted values to
        // propagate onto the owning entries after save, but strip them from the blob.
        const submittedReverse = { ...(dto.data ?? {}) };
        incoming = this.stripReverse(existing.contentType.schema, incoming);
        // A component field stored in the other shape than its schema (a list under a
        // single field) shows as one empty block in the editor; saving that must not
        // wipe the stored blocks. Only an empty, wrong-shaped value is put back.
        incoming = keepStoredShape(fieldsOf(existing.contentType.schema), existing.status === "PUBLISHED" ? (existing.draftData ?? existing.data) : existing.data, incoming);
        if (this.rbac && role) {
            const allowed = await this.rbac.allowedTypeIds(role);
            if (allowed && !allowed.includes(existing.contentTypeId)) throw new ForbiddenException("Your role can't edit content of this type.");
            incoming = await this.rbac.stripLockedFields(role, incoming);
        }

        const isContentEdit = dto.data !== undefined || dto.title !== undefined;
        const isStatusChange = dto.status !== undefined && dto.status !== existing.status;

        // ── Draft-over-published: a content edit to a LIVE entry stages into
        //    `draftData` instead of mutating the live `data`, so the public API keeps
        //    serving the last-published copy until Approve → Publish promotes it. Any
        //    fresh edit resets approval (re-approve before publishing). ──────────────
        if (existing.status === "PUBLISHED" && isContentEdit && !isStatusChange) {
            const base = (existing.draftData ?? existing.data ?? {}) as Record<string, unknown>;
            let draft = { ...base, ...incoming };
            if (dto.title !== undefined) draft.title = dto.title;
            // A save that changes nothing (an editor opened and closed, an autosave of
            // untouched content) is not an edit: no draft, no new version, no
            // `updatedAt` bump, and a pending approval stays as it is. Checked on what
            // was sent, before save hooks and the meta title sync add their own values.
            if (!this.changed(base, draft) && (dto.slug === undefined || dto.slug === existing.slug)) return this.unchanged(workspaceId, id);
            // Type-check, but don't enforce completeness on a draft (autosave-friendly).
            validateEntryData(fieldsOf(existing.contentType.schema), draft, {
                enforceRequired: false,
                slug: dto.slug !== undefined ? dto.slug : existing.slug,
                components: await this.componentMap(workspaceId),
            });
            draft = await this.plugins.runBeforeSave(workspaceId, { data: draft, title: String(draft.title ?? ""), status: existing.status });
            this.syncMetaTitle(draft, (existing.draftData ?? existing.data ?? {}) as Record<string, unknown>);
            const patch: Prisma.ContentEntryUpdateInput = { draftData: draft as Prisma.InputJsonValue, draftApproved: false };
            if (actorId && this.changed(base, draft)) patch.lastEditorId = actorId;
            // Slug is a structural column (the live URL); apply it directly.
            if (dto.slug !== undefined) patch.slug = dto.slug;
            if (patterned) {
                const derived = await this.derivedSlug(workspaceId, existing.contentTypeId, existing.contentType.schema, draft, existing.locale, id);
                if (derived && derived !== existing.slug) patch.slug = derived;
            }
            const updated = await this.prisma.contentEntry.update({
                where: { id },
                data: patch,
                include: { contentType: { select: CT_SELECT } },
            });
            const versions = await this.snapshot(updated.id, draft, existing.status, actorId, { label: "draft" });
            if (this.changed(base, draft)) await this.logEvent(workspaceId, actorId, "content.edit", id, { changes: draftDiff(base, draft), versions, metadata: { draft: true } });
            if (updated.slug !== existing.slug) await this.logEvent(workspaceId, actorId, "content.slug_change", id, { changes: [{ path: "slug", before: existing.slug, after: updated.slug, formattingOnly: false }], versions });
            await this.propagateReverse(workspaceId, updated.id, existing.contentType.schema, submittedReverse, { actorId, role, actorPermissions });
            const shaped = { ...this.shape(updated), data: updated.draftData, title: String(draft.title ?? "Untitled") };
            this.fire(workspaceId, "content.updated", shaped);
            return shaped;
        }

        const data: Prisma.ContentEntryUpdateInput = {};
        if (dto.slug !== undefined) data.slug = dto.slug;
        if (dto.status !== undefined) data.status = dto.status;
        if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

        // Merged view of the data after this update (for validation).
        let merged = { ...((existing.data ?? {}) as Record<string, unknown>), ...incoming };
        if (dto.title !== undefined) merged.title = dto.title;
        const dataChanged = dto.data !== undefined || dto.title !== undefined;
        // Same rule for entries edited in place: content sent back unchanged, with no
        // slug, status or schedule change alongside, writes nothing.
        const structural = (dto.slug !== undefined && dto.slug !== existing.slug) || (dto.status !== undefined && dto.status !== existing.status) || dto.scheduledAt !== undefined;
        if (dataChanged && !structural && !this.changed(existing.data, merged)) return this.unchanged(workspaceId, id);

        const targetStatus = (dto.status ?? existing.status) as ContentStatus;
        const targetSlug = dto.slug !== undefined ? dto.slug : existing.slug;
        // Enforce required fields only when THIS update transitions the entry INTO a
        // complete-required state (publish / schedule / approve). Plain content edits —
        // including edits to an entry that's already published/scheduled — must not
        // re-enforce, or routine saves + autosave would 400 on any not-yet-complete
        // draft. The dedicated publish/schedule path (setStatus) enforces on its own.
        const enteringComplete =
            dto.status !== undefined && dto.status !== existing.status && REQUIRE_COMPLETE.has(dto.status as ContentStatus);
        validateEntryData(fieldsOf(existing.contentType.schema), merged, {
            enforceRequired: enteringComplete,
            slug: targetSlug,
            components: await this.componentMap(workspaceId),
        });
        // Approval gate (Pro `approval_workflows`): block publish/schedule until the
        // entry is signed off. No-op unless the EE port is present + licensed.
        if (this.approvals && targetStatus !== existing.status) {
            await this.approvals.assertCanPublish(workspaceId, { id: existing.id, status: existing.status }, targetStatus);
        }
        // Re-run plugin hooks when the content body/title changes.
        if (dataChanged) {
            merged = await this.plugins.runBeforeSave(workspaceId, { data: merged, title: String(merged.title ?? ""), status: targetStatus });
            this.syncMetaTitle(merged, (existing.data ?? {}) as Record<string, unknown>);
            data.data = merged as Prisma.InputJsonValue;
            if (patterned) {
                const derived = await this.derivedSlug(workspaceId, existing.contentTypeId, existing.contentType.schema, merged, existing.locale, id);
                if (derived && derived !== existing.slug) data.slug = derived;
            }
            if (actorId && this.changed(existing.data, merged)) data.lastEditorId = actorId;
        }

        const e = await this.prisma.contentEntry.update({
            where: { id },
            data,
            include: { contentType: { select: CT_SELECT } },
        });
        if (dataChanged) {
            await this.relations.syncEntry(workspaceId, e.id, e.contentTypeId, e.contentType.schema, merged);
        }
        await this.propagateReverse(workspaceId, e.id, e.contentType.schema, submittedReverse, { actorId, role, actorPermissions });
        if (actorId && targetStatus !== existing.status) {
            await this.notifyTransition(workspaceId, actorId, existing, this.title(e), existing.status, targetStatus);
        }
        // A new review cycle: clear prior sign-offs when (re-)entering review.
        if (targetStatus === "IN_REVIEW" && existing.status !== "IN_REVIEW") {
            await this.prisma.contentReview.deleteMany({ where: { entryId: id } });
        }
        const versions = await this.snapshot(e.id, merged, targetStatus, actorId);
        const changes = dataChanged ? draftDiff(existing.data, merged) : [];
        if (targetStatus !== existing.status) {
            await this.logEvent(workspaceId, actorId, eventForStatusChange(existing.status, targetStatus), id, { changes, versions, metadata: { from: existing.status, to: targetStatus } });
        } else if (changes.length) await this.logEvent(workspaceId, actorId, "content.edit", id, { changes, versions });
        if (e.slug !== existing.slug) await this.logEvent(workspaceId, actorId, "content.slug_change", id, { changes: [{ path: "slug", before: existing.slug, after: e.slug, formattingOnly: false }], versions });
        const shaped = this.shape(e);
        this.fire(workspaceId, "content.updated", shaped);
        if (targetStatus !== existing.status) {
            if (targetStatus === "PUBLISHED") this.fire(workspaceId, "content.published", shaped);
            else if (targetStatus === "SCHEDULED") this.fire(workspaceId, "content.scheduled", shaped);
        }
        return shaped;
    }

    /** Most entries one bulk field update may touch. */
    static readonly BULK_MAX = 500;

    /**
     * Set field paths (`heroSection.subheadline`) on every matching entry of one type.
     * Each entry goes through update(), exactly like a single PATCH: a live entry gets
     * the change on its draft (its live data and other pending edits untouched), any
     * other entry is edited in place, status never changes, and versions, the
     * activity log and webhooks follow. Entries whose values already match are
     * skipped. `dryRun` reports each change and writes nothing.
     * ponytail: one entry at a time, like the single update (no cross-entry
     * transaction); a failure is reported for that entry and the rest go on.
     */
    async bulkSet(
        workspaceId: string,
        contentTypeId: string,
        opts: { where?: { slug?: string[]; id?: string[]; status?: string }; set: Record<string, unknown>; dryRun?: boolean },
        actorPermissions?: string[],
        role?: RoleRules,
    ) {
        const paths = Object.keys(opts.set ?? {});
        if (!paths.length) throw new BadRequestException("`set` needs at least one field path.");
        if (paths.length > 50) throw new BadRequestException("`set` takes at most 50 field paths.");
        try {
            setPaths({}, opts.set); // reject a malformed path before reading anything
        } catch (e) {
            throw new BadRequestException((e as Error).message);
        }
        const w = opts.where ?? {};
        const where: Prisma.ContentEntryWhereInput = { workspaceId, contentTypeId };
        if (w.slug) where.slug = { in: w.slug };
        if (w.id) where.id = { in: w.id };
        if (w.status) where.status = w.status as ContentStatus;
        const rows = await this.prisma.contentEntry.findMany({ where, orderBy: { id: "asc" }, take: ContentEntriesService.BULK_MAX + 1, select: { id: true, slug: true, status: true, data: true, draftData: true } });
        if (rows.length > ContentEntriesService.BULK_MAX) throw new BadRequestException(`More than ${ContentEntriesService.BULK_MAX} entries match. Narrow \`where\` (by slug, id or status) and send several requests.`);

        const entries: { id: string; slug: string | null; status: ContentStatus; changes: { path: string; old: unknown; new: unknown }[] }[] = [];
        const failed: { id: string; slug: string | null; error: string }[] = [];
        let updated = 0;
        let skipped = 0;
        for (const r of rows) {
            // The working copy: a live entry's pending draft, or else its data.
            const base = (r.status === "PUBLISHED" ? (r.draftData ?? r.data) : r.data) as Record<string, unknown>;
            const changes = paths
                .map((path) => ({ path, old: getPath(base, path) ?? null, new: opts.set[path] }))
                .filter((c) => JSON.stringify(c.old) !== JSON.stringify(c.new));
            if (!changes.length) {
                skipped++;
                continue;
            }
            entries.push({ id: r.id, slug: r.slug, status: r.status, changes });
            if (opts.dryRun) continue;
            try {
                const next = setPaths(base, opts.set);
                // Send whole top-level values (update() merges one level deep).
                const tops = [...new Set(changes.map((c) => pathKeysTop(c.path)))];
                await this.update(workspaceId, r.id, { data: Object.fromEntries(tops.map((k) => [k, next[k]])) } as UpdateEntryDto, undefined, role, actorPermissions);
                updated++;
            } catch (e) {
                failed.push({ id: r.id, slug: r.slug, error: e instanceof Error ? e.message : String(e) });
            }
        }
        return { matched: rows.length, ...(opts.dryRun ? { dryRun: true, wouldUpdate: entries.length } : { updated }), skipped, failed, entries };
    }

    private async setStatus(workspaceId: string, id: string, status: ContentStatus, publishedAt: Date | null, actorId?: string) {
        const existing = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: { schema: true } } },
        });
        if (!existing) throw new NotFoundException("Entry not found.");
        // Approval gate (Pro): same rule as update() — covers the publish/agent paths.
        if (this.approvals && status !== existing.status) {
            await this.approvals.assertCanPublish(workspaceId, { id: existing.id, status: existing.status }, status);
        }
        if (REQUIRE_COMPLETE.has(status)) {
            validateEntryData(fieldsOf(existing.contentType.schema), (existing.data ?? {}) as Record<string, unknown>, {
                enforceRequired: true,
                slug: existing.slug,
                components: await this.componentMap(workspaceId),
            });
        }
        const e = await this.prisma.contentEntry.update({
            where: { id },
            // Going live keeps the first publish date (re-publishing never moves it)
            // and drops the schedule, which has now happened.
            data: { status, publishedAt, ...(status === "PUBLISHED" ? { firstPublishedAt: existing.firstPublishedAt ?? existing.publishedAt ?? publishedAt, scheduledAt: null } : {}) },
            include: { contentType: { select: CT_SELECT } },
        });
        if (actorId && status !== existing.status) {
            await this.notifyTransition(workspaceId, actorId, existing, this.title(e), existing.status, status);
        }
        if (status !== existing.status) {
            const versions = await this.snapshot(e.id, existing.data, status, actorId);
            await this.logEvent(workspaceId, actorId, eventForStatusChange(existing.status, status), id, { versions, metadata: { from: existing.status, to: status } });
        }
        const shaped = this.shape(e);
        if (status === "PUBLISHED") this.fire(workspaceId, "content.published", shaped);
        else if (status === "DRAFT" && existing.status === "PUBLISHED") this.fire(workspaceId, "content.unpublished", shaped);
        return shaped;
    }

    async publish(workspaceId: string, id: string, actorId?: string, actorPermissions?: string[]) {
        const existing = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: { schema: true } } },
        });
        if (!existing) throw new NotFoundException("Entry not found.");
        // An actor without CONTENT_PUBLISH (e.g. an Editor) may only do the FINAL
        // publish of content a reviewer has already approved — never push unapproved
        // content live. Both unapproved paths are rejected explicitly. This holds
        // regardless of license tier (it does not depend on the EE approval gate).
        if (!grantsPublish(actorPermissions)) {
            if (existing.draftData != null) {
                if (!existing.draftApproved) throw new ForbiddenException("These changes must be approved by a reviewer before publishing.");
            } else if (existing.status !== "APPROVED") {
                throw new ForbiddenException("This content must be approved by a reviewer before you can publish it.");
            }
        }
        // Promote a pending draft (edits made to an already-live entry): the draft
        // becomes the new live `data` and the overlay is cleared. Enforce the two-step
        // Approve → Publish gate on the SERVER (not just the studio UI) so the direct
        // API, the agent API and bulk publish can't push unapproved changes live.
        if (existing.draftData != null) {
            // Someone allowed to publish approves by publishing, the same as pressing
            // Approve then Publish. Anyone else was already stopped above.
            if (!existing.draftApproved && !grantsPublish(actorPermissions)) throw new BadRequestException("Approve the draft changes before publishing them.");
            const promoted = (existing.draftData ?? {}) as Record<string, unknown>;
            validateEntryData(fieldsOf(existing.contentType.schema), promoted, { enforceRequired: true, slug: existing.slug, components: await this.componentMap(workspaceId) });
            const e = await this.prisma.contentEntry.update({
                where: { id },
                data: { data: existing.draftData as Prisma.InputJsonValue, draftData: Prisma.DbNull, draftApproved: false, status: "PUBLISHED", publishedAt: new Date(), firstPublishedAt: existing.firstPublishedAt ?? existing.publishedAt ?? new Date(), scheduledAt: null },
                include: { contentType: { select: CT_SELECT } },
            });
            const versions = await this.snapshot(e.id, promoted, "PUBLISHED", actorId, { label: "published" });
            await this.logEvent(workspaceId, actorId, "content.publish", id, { changes: draftDiff(existing.data, promoted), versions, metadata: { from: "PUBLISHED", to: "PUBLISHED", draftPublished: true } });
            await this.relations.syncEntry(workspaceId, e.id, e.contentTypeId, e.contentType.schema, promoted);
            const shaped = this.shape(e);
            this.fire(workspaceId, "content.published", shaped);
            return shaped;
        }
        return this.setStatus(workspaceId, id, "PUBLISHED", new Date(), actorId);
    }

    async unpublish(workspaceId: string, id: string, actorId?: string) {
        const existing = await this.prisma.contentEntry.findFirst({ where: { id, workspaceId } });
        if (!existing) throw new NotFoundException("Entry not found.");
        // Taking a live entry offline: fold any pending draft into the entry's data so
        // in-progress edits aren't lost, then drop to DRAFT.
        if (existing.draftData != null) {
            const e = await this.prisma.contentEntry.update({
                where: { id },
                data: { data: existing.draftData as Prisma.InputJsonValue, draftData: Prisma.DbNull, draftApproved: false, status: "DRAFT", publishedAt: null },
                include: { contentType: { select: CT_SELECT } },
            });
            const versions = await this.snapshot(e.id, e.data, "DRAFT", actorId);
            await this.logEvent(workspaceId, actorId, "content.unpublish", id, { changes: draftDiff(existing.data, e.data), versions, metadata: { from: "PUBLISHED", to: "DRAFT" } });
            await this.relations.syncEntry(workspaceId, e.id, e.contentTypeId, e.contentType.schema, (e.data ?? {}) as Record<string, unknown>);
            const shaped = this.shape(e);
            this.fire(workspaceId, "content.unpublished", shaped);
            return shaped;
        }
        return this.setStatus(workspaceId, id, "DRAFT", null, actorId);
    }

    /** Approve a published entry's pending draft (step 1 of the two-step Approve →
     *  Publish promotion). Rejects an incomplete draft so Publish can't 400 later. */
    async approveDraft(workspaceId: string, id: string, actorId?: string) {
        const existing = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: CT_SELECT } },
        });
        if (!existing) throw new NotFoundException("Entry not found.");
        if (existing.draftData == null) throw new BadRequestException("No draft changes to approve.");
        validateEntryData(fieldsOf(existing.contentType.schema), (existing.draftData ?? {}) as Record<string, unknown>, { enforceRequired: true, slug: existing.slug, components: await this.componentMap(workspaceId) });
        const e = await this.prisma.contentEntry.update({
            where: { id },
            data: { draftApproved: true },
            include: { contentType: { select: CT_SELECT } },
        });
        const v = await this.prisma.contentVersion.findFirst({ where: { entryId: id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
        await this.logEvent(workspaceId, actorId, "content.approve", id, {
            changes: draftDiff(existing.data, existing.draftData),
            versions: v ? { before: v.versionNumber, after: v.versionNumber } : undefined,
            metadata: { draft: true },
        });
        // The "Ready to publish" count includes approved drafts of live pages.
        void this.cache.delByPrefix(`dash:${workspaceId}:`);
        const draft = (e.draftData ?? {}) as { title?: string };
        return { ...this.shape(e), data: e.draftData, title: draft.title ?? "Untitled" };
    }

    /** Discard a published entry's pending draft and revert to the live version. */
    async discardDraft(workspaceId: string, id: string, actorId?: string) {
        const existing = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: CT_SELECT } },
        });
        if (!existing) throw new NotFoundException("Entry not found.");
        if (existing.draftData == null) return this.shape(existing);
        const e = await this.prisma.contentEntry.update({
            where: { id },
            data: { draftData: Prisma.DbNull, draftApproved: false },
            include: { contentType: { select: CT_SELECT } },
        });
        await this.logEvent(workspaceId, actorId, "content.discard_draft", id, { changes: draftDiff(existing.draftData, existing.data) });
        return this.shape(e);
    }

    async duplicate(workspaceId: string, userId: string, id: string) {
        const src = await this.prisma.contentEntry.findFirst({ where: { id, workspaceId } });
        if (!src) throw new NotFoundException("Entry not found.");
        const data = { ...((src.data ?? {}) as { title?: string }) };
        data.title = `${data.title ?? "Untitled"} (Copy)`;
        // Keep the copy's slug unique within the type + locale: "-copy", then
        // "-copy-2", "-copy-3", … so two duplicates never collide.
        const slug = src.slug ? await this.uniqueSlug(workspaceId, src.contentTypeId, `${src.slug}-copy`, src.locale) : null;
        const e = await this.prisma.contentEntry.create({
            data: {
                workspaceId,
                contentTypeId: src.contentTypeId,
                data,
                slug,
                locale: src.locale,
                status: "DRAFT",
                authorId: userId,
            },
            include: { contentType: { select: CT_SELECT } },
        });
        await this.relations.syncEntry(workspaceId, e.id, e.contentTypeId, e.contentType.schema, data);
        const versions = await this.snapshot(e.id, data, "DRAFT", userId, { note: `copy of ${this.title(src)}` });
        await this.logEvent(workspaceId, userId, "content.create", e.id, { versions, metadata: { duplicatedFrom: src.id } });
        return this.shape(e);
    }

    /** How long a deleted entry or asset stays in "Deleted items" before it's purged. */
    static readonly TRASH_DAYS = 30;

    /**
     * Delete an entry into the "Deleted items" bin: the row, its versions and its
     * relation links are kept for 30 days, so restoreDeleted() can bring it back
     * whole under the same id. The live page goes away now (content.deleted fires).
     */
    async remove(workspaceId: string, id: string, actorId?: string) {
        const existing = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: CT_SELECT } },
        });
        if (!existing) throw new NotFoundException("Entry not found.");
        const [versions, relationsFrom, relationsTo] = await Promise.all([
            this.prisma.contentVersion.findMany({ where: { entryId: id } }),
            this.prisma.entryRelation.findMany({ where: { fromId: id } }),
            this.prisma.entryRelation.findMany({ where: { toId: id } }),
        ]);
        const { contentType, ...row } = existing;
        const who = currentActor();
        const deletedById = actorId ?? who.userId;
        await this.logEvent(workspaceId, actorId, "content.delete", id, { metadata: { status: existing.status, type: contentType.name } });
        await this.prisma.$transaction([
            this.prisma.deletedItem.create({
                data: {
                    workspaceId,
                    kind: "entry",
                    itemId: id,
                    title: this.title(existing),
                    detail: contentType.name,
                    payload: JSON.parse(JSON.stringify({ entry: row, versions, relationsFrom, relationsTo })) as Prisma.InputJsonValue,
                    deletedById,
                    deletedBy: await this.actorNameFor(deletedById),
                    purgeAt: new Date(Date.now() + ContentEntriesService.TRASH_DAYS * 86_400_000),
                },
            }),
            // deleteMany with workspaceId is defence-in-depth: even if the ownership
            // check above were ever weakened, the delete itself stays tenant-scoped.
            this.prisma.contentEntry.deleteMany({ where: { id, workspaceId } }),
        ]);
        void this.webhooks.dispatch(workspaceId, "content.deleted", {
            id: existing.id,
            slug: existing.slug,
            type: contentType.apiId,
            path: entryPath(contentType, existing.slug),
            title: this.title(existing),
        });
        void this.cache.delByPrefix(`dash:${workspaceId}:`);
        return { ok: true };
    }

    /** Bring a deleted entry back from the bin, with its versions and links, under
     *  its old id. It comes back as a draft (a live page needs publishing again), and
     *  with "-restored" on its slug if another page took the slug meanwhile. */
    async restoreDeleted(workspaceId: string, deletedId: string, actorId?: string) {
        const item = await this.prisma.deletedItem.findFirst({ where: { id: deletedId, workspaceId, kind: "entry" } });
        if (!item) throw new NotFoundException("Deleted item not found.");
        type Row = Record<string, unknown> & { id: string; contentTypeId: string; slug: string | null; locale: string; status: ContentStatus };
        const p = item.payload as { entry: Row; versions: Record<string, unknown>[]; relationsFrom: Record<string, unknown>[]; relationsTo: (Record<string, unknown> & { fromId: string })[] };
        const type = await this.prisma.contentType.findFirst({ where: { id: p.entry.contentTypeId, workspaceId }, select: { id: true } });
        if (!type) throw new BadRequestException("Its content type has been deleted, so this entry can't be restored.");
        if (await this.prisma.contentEntry.findUnique({ where: { id: p.entry.id }, select: { id: true } })) throw new BadRequestException("This entry already exists.");
        const slug = p.entry.slug && (await this.slugConflict(workspaceId, type.id, p.entry.slug, p.entry.locale)) ? await this.uniqueSlug(workspaceId, type.id, `${p.entry.slug}-restored`, p.entry.locale) : p.entry.slug;
        // The generated title column is never written.
        const { title: _title, ...entry } = p.entry;
        void _title;
        const wasLive = entry.status === "PUBLISHED" || entry.status === "SCHEDULED";
        const owners = p.relationsTo.length ? await this.prisma.contentEntry.findMany({ where: { id: { in: p.relationsTo.map((r) => r.fromId) }, workspaceId }, select: { id: true } }) : [];
        const ownerIds = new Set(owners.map((o) => o.id));
        await this.prisma.$transaction([
            this.prisma.contentEntry.create({
                data: {
                    ...(entry as unknown as Prisma.ContentEntryUncheckedCreateInput),
                    slug,
                    draftData: (entry.draftData ?? Prisma.DbNull) as Prisma.InputJsonValue,
                    ...(wasLive ? { status: "DRAFT", publishedAt: null, scheduledAt: null } : {}),
                },
            }),
            this.prisma.contentVersion.createMany({ data: p.versions as unknown as Prisma.ContentVersionCreateManyInput[] }),
            this.prisma.entryRelation.createMany({
                data: [...p.relationsFrom, ...p.relationsTo.filter((r) => ownerIds.has(r.fromId))] as unknown as Prisma.EntryRelationCreateManyInput[],
                skipDuplicates: true,
            }),
            this.prisma.deletedItem.delete({ where: { id: item.id } }),
        ]);
        const e = await this.prisma.contentEntry.findUniqueOrThrow({ where: { id: p.entry.id }, include: { contentType: { select: CT_SELECT } } });
        // Forward links to entries deleted meanwhile drop out here.
        await this.relations.syncEntry(workspaceId, e.id, e.contentTypeId, e.contentType.schema, (e.data ?? {}) as Record<string, unknown>);
        const versions = await this.snapshot(e.id, e.data, e.status, actorId, { note: "restored from Deleted items" });
        await this.logEvent(workspaceId, actorId, "content.restore_deleted", e.id, { versions, metadata: { deletedAt: item.deletedAt, deletedBy: item.deletedBy, ...(slug !== p.entry.slug ? { slugChanged: { from: p.entry.slug, to: slug } } : {}) } });
        const shaped = this.shape(e);
        this.fire(workspaceId, "content.created", shaped);
        return shaped;
    }
}
