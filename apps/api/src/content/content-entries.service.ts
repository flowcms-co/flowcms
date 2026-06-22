import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ContentEntry, ContentStatus, Prisma, ReviewDecision } from "@flowcms/db";
import { PERMISSIONS } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WebhooksService, type WebhookEvent } from "../webhooks/webhooks.service";
import { ConnectorsService, type ConnectorEvent } from "../connectors/connectors.service";
import { PluginsService } from "../plugins/plugins.service";
import { APPROVAL_PORT, type ApprovalPort } from "./approval.port";
import { RBAC_PORT, type RbacPort, type RoleRules } from "./rbac.port";
import { CreateEntryDto, UpdateEntryDto } from "./entries.dto";
import { fieldsOf, validateEntryData, type ComponentMap } from "./entry-validation";
import { entryPath } from "./route-path";

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
        // Provided by the EE `approval_workflows` module when present; absent (and
        // so unenforced) in Community.
        @Optional() @Inject(APPROVAL_PORT) private readonly approvals?: ApprovalPort,
        // EE `advanced_rbac` field-level rules; absent (unenforced) in Community.
        @Optional() @Inject(RBAC_PORT) private readonly rbac?: RbacPort,
    ) {}

    /** Best-effort outbound fan-out for a content event: webhooks + Slack/Zapier connectors. */
    private fire(workspaceId: string, event: WebhookEvent, entry: Shaped) {
        void this.webhooks.dispatch(workspaceId, event, entry);
        void this.connectors.dispatch(workspaceId, event as ConnectorEvent, entry);
        // Bust cached dashboard aggregates for the workspace (content changed).
        void this.cache.delByPrefix(`dash:${workspaceId}:`);
    }

    /** How many full-body version snapshots to retain per entry. Each snapshot
     *  stores a complete copy of the entry data, so unbounded growth is a real
     *  storage cost on heavily-edited entries; we keep the most recent N. */
    private static readonly VERSION_RETENTION = 10;

    /** Append a version snapshot of the entry's current data + status, then prune
     *  older snapshots beyond the retention window. */
    private async snapshot(entryId: string, data: unknown, status: ContentStatus, createdById?: string | null) {
        const last = await this.prisma.contentVersion.findFirst({
            where: { entryId },
            orderBy: { versionNumber: "desc" },
            select: { versionNumber: true },
        });
        const versionNumber = (last?.versionNumber ?? 0) + 1;
        await this.prisma.contentVersion.create({
            data: {
                entryId,
                data: (data ?? {}) as object,
                status,
                versionNumber,
                createdById: createdById ?? null,
            },
        });
        // Prune snapshots older than the retention window (keep the newest N).
        const cutoff = versionNumber - ContentEntriesService.VERSION_RETENTION;
        if (cutoff > 0) {
            await this.prisma.contentVersion
                .deleteMany({ where: { entryId, versionNumber: { lte: cutoff } } })
                .catch(() => undefined);
        }
    }

    /** Version history for an entry (newest first), with author display names. */
    async versions(workspaceId: string, entryId: string) {
        const entry = await this.prisma.contentEntry.findFirst({ where: { id: entryId, workspaceId }, select: { id: true } });
        if (!entry) throw new NotFoundException("Entry not found.");
        const rows = await this.prisma.contentVersion.findMany({ where: { entryId }, orderBy: { versionNumber: "desc" }, take: ContentEntriesService.VERSION_RETENTION });
        const ids = [...new Set(rows.map((r) => r.createdById).filter(Boolean) as string[])];
        const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
        const nameOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? null : null);
        return rows.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            status: v.status,
            title: ((v.data as { title?: string })?.title) ?? "Untitled",
            author: nameOf(v.createdById),
            createdAt: v.createdAt,
        }));
    }

    /** Restore an entry's data to a past version (records a new version). */
    async restore(workspaceId: string, entryId: string, versionId: string, actorId?: string) {
        const version = await this.prisma.contentVersion.findUnique({ where: { id: versionId }, include: { entry: { select: { workspaceId: true, status: true } } } });
        if (!version || version.entryId !== entryId || version.entry.workspaceId !== workspaceId) {
            throw new NotFoundException("Version not found.");
        }
        const e = await this.prisma.contentEntry.update({
            where: { id: entryId },
            data: { data: version.data as Prisma.InputJsonValue },
            include: { contentType: { select: CT_SELECT } },
        });
        await this.snapshot(entryId, version.data, e.status, actorId);
        const shaped = this.shape(e);
        this.fire(workspaceId, "content.updated", shaped);
        return shaped;
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
        };
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

        if (decision === "request_changes") {
            if (entry.status !== "DRAFT") await this.prisma.contentEntry.update({ where: { id: entryId }, data: { status: "DRAFT" } });
            if (entry.authorId && entry.authorId !== reviewerId) {
                try {
                    await this.notifications.create(workspaceId, entry.authorId, {
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
        if (entry.status === "IN_REVIEW" && approvals >= required) {
            const e = await this.prisma.contentEntry.update({
                where: { id: entryId },
                data: { status: "APPROVED" },
                include: { contentType: { select: CT_SELECT } },
            });
            await this.snapshot(entryId, entry.data, "APPROVED", reviewerId);
            await this.notifyTransition(workspaceId, reviewerId, entry, this.title(e), "IN_REVIEW", "APPROVED");
            this.fire(workspaceId, "content.updated", this.shape(e));
        }
        return this.listReviews(workspaceId, entryId);
    }

    /** Fire notifications for a status transition (best-effort, never blocks the write). */
    private async notifyTransition(
        workspaceId: string,
        actorId: string,
        entry: { id: string; authorId: string | null },
        title: string,
        from: ContentStatus,
        to: ContentStatus,
    ) {
        if (from === to) return;
        const href = `/content/editor?id=${entry.id}`;
        const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } });
        const who = actor?.name ?? actor?.email ?? "Someone";
        try {
            if (to === "IN_REVIEW") {
                const reviewers = await this.notifications.reviewers(workspaceId, actorId);
                await this.notifications.createMany(workspaceId, reviewers, {
                    type: "review_requested",
                    title: "Content submitted for review",
                    body: `${who} submitted “${title}” for review.`,
                    href: "/content?status=review",
                });
            } else if (to === "APPROVED" && entry.authorId && entry.authorId !== actorId) {
                await this.notifications.create(workspaceId, entry.authorId, { type: "approved", title: "Your content was approved", body: `“${title}” was approved by ${who}.`, href });
            } else if (to === "PUBLISHED" && entry.authorId && entry.authorId !== actorId) {
                await this.notifications.create(workspaceId, entry.authorId, { type: "published", title: "Your content was published", body: `“${title}” is now live.`, href });
            } else if (to === "SCHEDULED" && entry.authorId && entry.authorId !== actorId) {
                await this.notifications.create(workspaceId, entry.authorId, { type: "scheduled", title: "Your content was scheduled", body: `“${title}” was scheduled by ${who}.`, href });
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
    private async componentMap(workspaceId: string): Promise<ComponentMap> {
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
            path: entryPath(e.contentType, e.slug),
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

    async list(workspaceId: string, opts: { typeId?: string; status?: string; q?: string; locale?: string; authorId?: string; limit?: number; offset?: number }, role?: RoleRules) {
        const where: Prisma.ContentEntryWhereInput = { workspaceId };
        if (opts.typeId) where.contentTypeId = opts.typeId;
        if (opts.status) where.status = opts.status as ContentStatus;
        if (opts.locale) where.locale = opts.locale;
        if (opts.authorId) where.authorId = opts.authorId;
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
            orderBy: { updatedAt: "desc" },
            take,
            skip,
        });
        // Resolve author display details (name + title + avatar for richer lists
        // like the Publish Queue, which shows the author's role and picture).
        const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean) as string[])];
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
        const q = opts.q?.toLowerCase().trim();
        return rows
            .map((r) => {
                const s = this.shape(r, nameOf(r.authorId));
                const u = r.authorId ? userById.get(r.authorId) : null;
                return {
                    ...s,
                    author: s.author
                        ? { id: r.authorId, name: s.author.name, title: u?.title ?? null, avatarUrl: u?.avatarUrl ?? null, avatarStyle: u?.avatarStyle ?? null }
                        : null,
                };
            })
            .filter((r) => !q || r.title.toLowerCase().includes(q) || (r.slug ?? "").toLowerCase().includes(q));
    }

    async get(workspaceId: string, id: string) {
        const e = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: CT_SELECT } },
        });
        if (!e) throw new NotFoundException("Entry not found.");
        // The editor edits the draft overlay when one exists (a published entry with
        // pending changes); otherwise it edits the live data directly. The public
        // delivery API still reads `data`, so the last-published copy stays live.
        if (e.draftData != null) {
            const draft = (e.draftData ?? {}) as { title?: string };
            return { ...this.shape(e), data: e.draftData, title: draft.title ?? "Untitled" };
        }
        return this.shape(e);
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

    async create(workspaceId: string, userId: string | null, dto: CreateEntryDto, role?: RoleRules) {
        const type = await this.prisma.contentType.findFirst({
            where: { id: dto.contentTypeId, workspaceId },
        });
        if (!type) throw new BadRequestException("Unknown content type.");
        const locale = dto.locale || "en";
        // One slug per page: reject a slug already taken within this type + locale.
        await this.assertSlugFree(workspaceId, type.id, dto.slug, locale);
        let data: Record<string, unknown> = { ...(dto.data ?? {}), title: dto.title ?? "Untitled" };
        // advanced_rbac (Pro): block disallowed types + drop fields the role can't edit.
        if (this.rbac && role) {
            const allowed = await this.rbac.allowedTypeIds(role);
            if (allowed && !allowed.includes(type.id)) throw new ForbiddenException("Your role can't create content of this type.");
            data = (await this.rbac.stripLockedFields(role, data)) as Record<string, unknown>;
            if (data.title === undefined) data.title = dto.title ?? "Untitled";
        }
        // New entries are drafts — type-check values but don't require completeness yet.
        validateEntryData(fieldsOf(type.schema), data, { enforceRequired: false, slug: dto.slug ?? null, components: await this.componentMap(workspaceId) });
        // Plugin hooks may augment the data (reading time, word count, excerpt…).
        data = await this.plugins.runBeforeSave(workspaceId, { data, title: String(data.title ?? ""), status: "DRAFT" });
        this.syncMetaTitle(data);
        const e = await this.prisma.contentEntry.create({
            data: {
                workspaceId,
                contentTypeId: type.id,
                data: data as Prisma.InputJsonValue,
                slug: dto.slug ?? null,
                locale,
                status: "DRAFT",
                authorId: userId ?? null,
            },
            include: { contentType: { select: CT_SELECT } },
        });
        await this.snapshot(e.id, data, "DRAFT", userId);
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
            // Type-check, but don't enforce completeness on a draft (autosave-friendly).
            validateEntryData(fieldsOf(existing.contentType.schema), draft, {
                enforceRequired: false,
                slug: dto.slug !== undefined ? dto.slug : existing.slug,
                components: await this.componentMap(workspaceId),
            });
            draft = await this.plugins.runBeforeSave(workspaceId, { data: draft, title: String(draft.title ?? ""), status: existing.status });
            this.syncMetaTitle(draft, (existing.draftData ?? existing.data ?? {}) as Record<string, unknown>);
            const patch: Prisma.ContentEntryUpdateInput = { draftData: draft as Prisma.InputJsonValue, draftApproved: false };
            // Slug is a structural column (the live URL); apply it directly.
            if (dto.slug !== undefined) patch.slug = dto.slug;
            const updated = await this.prisma.contentEntry.update({
                where: { id },
                data: patch,
                include: { contentType: { select: CT_SELECT } },
            });
            await this.snapshot(updated.id, draft, existing.status, actorId);
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
        }

        const e = await this.prisma.contentEntry.update({
            where: { id },
            data,
            include: { contentType: { select: CT_SELECT } },
        });
        if (actorId && targetStatus !== existing.status) {
            await this.notifyTransition(workspaceId, actorId, existing, this.title(e), existing.status, targetStatus);
        }
        // A new review cycle: clear prior sign-offs when (re-)entering review.
        if (targetStatus === "IN_REVIEW" && existing.status !== "IN_REVIEW") {
            await this.prisma.contentReview.deleteMany({ where: { entryId: id } });
        }
        await this.snapshot(e.id, merged, targetStatus, actorId);
        const shaped = this.shape(e);
        this.fire(workspaceId, "content.updated", shaped);
        if (targetStatus !== existing.status) {
            if (targetStatus === "PUBLISHED") this.fire(workspaceId, "content.published", shaped);
            else if (targetStatus === "SCHEDULED") this.fire(workspaceId, "content.scheduled", shaped);
        }
        return shaped;
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
            data: { status, publishedAt },
            include: { contentType: { select: CT_SELECT } },
        });
        if (actorId && status !== existing.status) {
            await this.notifyTransition(workspaceId, actorId, existing, this.title(e), existing.status, status);
        }
        if (status !== existing.status) await this.snapshot(e.id, existing.data, status, actorId);
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
            if (!existing.draftApproved) throw new BadRequestException("Approve the draft changes before publishing them.");
            const promoted = (existing.draftData ?? {}) as Record<string, unknown>;
            validateEntryData(fieldsOf(existing.contentType.schema), promoted, { enforceRequired: true, slug: existing.slug, components: await this.componentMap(workspaceId) });
            const e = await this.prisma.contentEntry.update({
                where: { id },
                data: { data: existing.draftData as Prisma.InputJsonValue, draftData: Prisma.DbNull, draftApproved: false, status: "PUBLISHED", publishedAt: new Date() },
                include: { contentType: { select: CT_SELECT } },
            });
            await this.snapshot(e.id, promoted, "PUBLISHED", actorId);
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
            await this.snapshot(e.id, e.data, "DRAFT", actorId);
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
        const draft = (e.draftData ?? {}) as { title?: string };
        return { ...this.shape(e), data: e.draftData, title: draft.title ?? "Untitled" };
    }

    /** Discard a published entry's pending draft and revert to the live version. */
    async discardDraft(workspaceId: string, id: string) {
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
        return this.shape(e);
    }

    async remove(workspaceId: string, id: string) {
        const existing = await this.prisma.contentEntry.findFirst({
            where: { id, workspaceId },
            include: { contentType: { select: CT_SELECT } },
        });
        if (!existing) throw new NotFoundException("Entry not found.");
        // deleteMany with workspaceId is defence-in-depth: even if the ownership
        // check above were ever weakened, the delete itself stays tenant-scoped.
        await this.prisma.contentEntry.deleteMany({ where: { id, workspaceId } });
        void this.webhooks.dispatch(workspaceId, "content.deleted", {
            id: existing.id,
            slug: existing.slug,
            type: existing.contentType.apiId,
            path: entryPath(existing.contentType, existing.slug),
            title: this.title(existing),
        });
        return { ok: true };
    }
}
