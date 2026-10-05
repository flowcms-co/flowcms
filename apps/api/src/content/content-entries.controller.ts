import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { CreateEntryDto, SetAuthorDto, UpdateEntryDto } from "./entries.dto";
import { ContentEntriesService } from "./content-entries.service";
import { ContentListService, type EntryPageQuery } from "./content-list.service";
import { JobsService } from "../jobs/jobs.service";

class ReviewDto {
    @IsIn(["approve", "request_changes"]) decision!: "approve" | "request_changes";
    @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

class BulkIdsDto {
    @IsArray() @ArrayNotEmpty() @IsString({ each: true }) ids!: string[];
}

class BulkScheduleDto extends BulkIdsDto {
    /** When to publish, as an ISO date. */
    @IsDateString() scheduledAt!: string;
}

@Controller("entries")
export class ContentEntriesController {
    constructor(
        private readonly entries: ContentEntriesService,
        private readonly lists: ContentListService,
        private readonly jobs: JobsService,
    ) {}

    /** One page of entries for list screens: searched, filtered, sorted and paged in
     *  the database. Declared before the `:id` routes so it isn't matched as an id. */
    @Get("page")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    page(@CurrentUser() user: AuthUser, @Query() q: Record<string, string | undefined>) {
        return this.lists.page(user.workspaceId, this.pageQuery(user, q), user.role);
    }

    /** The id of every entry matching the same filters, for "select all" across pages. */
    @Get("page/ids")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    pageIds(@CurrentUser() user: AuthUser, @Query() q: Record<string, string | undefined>) {
        return this.lists.ids(user.workspaceId, this.pageQuery(user, q), user.role);
    }

    private pageQuery(user: AuthUser, q: Record<string, string | undefined>): EntryPageQuery {
        const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
        const int = (v?: string) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
        const date = (v?: string) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : undefined);
        return {
                q: q.q,
                typeIds: list(q.typeId),
                statuses: list(q.status),
                author: q.author === "me" ? user.id : q.author || undefined,
                locale: q.locale || undefined,
                ids: list(q.ids),
                from: date(q.from),
                to: date(q.to),
                scope: q.scope === "content" ? "content" : undefined,
                sort: q.sort,
                dir: q.dir === "asc" ? "asc" : "desc",
                page: int(q.page),
                pageSize: int(q.pageSize),
                facets: q.facets === "1",
        };
    }

    @Get()
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    list(
        @CurrentUser() user: AuthUser,
        @Query("typeId") typeId?: string,
        @Query("status") status?: string,
        @Query("q") q?: string,
        @Query("locale") locale?: string,
        @Query("author") author?: string,
        @Query("limit") limit?: string,
        @Query("offset") offset?: string,
    ) {
        // `author=me` scopes the list to the signed-in user's own entries.
        const authorId = author === "me" ? user.id : author || undefined;
        // Pages of up to 500; callers walk ?offset= to read everything.
        const num = (v?: string) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
        return this.entries.list(user.workspaceId, { typeId, status, q, locale, authorId, limit: num(limit), offset: num(offset) }, user.role);
    }

    /** Pending drafts that only differ from the live page by editor formatting. */
    @Get("drafts/formatting-only")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    formattingOnlyDrafts(@CurrentUser() user: AuthUser) {
        return this.entries.formattingOnlyDrafts(user.workspaceId);
    }

    /** Discard them (each is re-checked first). */
    @Post("drafts/formatting-only/discard")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    discardFormattingOnlyDrafts(@CurrentUser() user: AuthUser) {
        return this.entries.discardFormattingOnlyDrafts(user.workspaceId);
    }

    // ── Bulk actions → background jobs (so the app is never locked). Declared
    //    before the `:id` routes so `/entries/bulk/*` isn't matched as `:id`. ──────
    @Post("bulk/publish")
    @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
    bulkPublish(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
        return this.jobs.enqueue(user.workspaceId, user.id, "content.bulkPublish", `Publish ${dto.ids.length} item${dto.ids.length === 1 ? "" : "s"}`, { ids: dto.ids }, dto.ids.length);
    }

    @Post("bulk/unpublish")
    @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
    bulkUnpublish(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
        return this.jobs.enqueue(user.workspaceId, user.id, "content.bulkUnpublish", `Unpublish ${dto.ids.length} item${dto.ids.length === 1 ? "" : "s"}`, { ids: dto.ids }, dto.ids.length);
    }

    @Post("bulk/draft")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    bulkDraft(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
        return this.jobs.enqueue(user.workspaceId, user.id, "content.bulkDraft", `Move ${dto.ids.length} item${dto.ids.length === 1 ? "" : "s"} to draft`, { ids: dto.ids }, dto.ids.length);
    }

    @Post("bulk/schedule")
    @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
    bulkSchedule(@CurrentUser() user: AuthUser, @Body() dto: BulkScheduleDto) {
        return this.jobs.enqueue(user.workspaceId, user.id, "content.bulkSchedule", `Schedule ${dto.ids.length} item${dto.ids.length === 1 ? "" : "s"}`, { ids: dto.ids, scheduledAt: dto.scheduledAt }, dto.ids.length);
    }

    @Post("bulk/duplicate")
    @RequirePermissions(PERMISSIONS.CONTENT_CREATE)
    bulkDuplicate(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
        return this.jobs.enqueue(user.workspaceId, user.id, "content.bulkDuplicate", `Duplicate ${dto.ids.length} item${dto.ids.length === 1 ? "" : "s"}`, { ids: dto.ids }, dto.ids.length);
    }

    @Post("bulk/delete")
    @RequirePermissions(PERMISSIONS.CONTENT_DELETE)
    bulkDelete(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
        return this.jobs.enqueue(user.workspaceId, user.id, "content.bulkDelete", `Delete ${dto.ids.length} item${dto.ids.length === 1 ? "" : "s"}`, { ids: dto.ids }, dto.ids.length);
    }

    /** Backfill image alt text on existing pages from the asset library. */
    @Post("bulk/fill-alt")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    fillAlt(@CurrentUser() user: AuthUser) {
        return this.jobs.enqueue(user.workspaceId, user.id, "content.fillAltFromAssets", "Fill page alt text from assets", {}, 0);
    }

    // Inline slug uniqueness check for the editor. Declared before `:id` so
    // `/entries/slug-available` isn't swallowed by the `:id` route.
    @Get("slug-available")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    slugAvailable(
        @CurrentUser() user: AuthUser,
        @Query("typeId") typeId?: string,
        @Query("slug") slug?: string,
        @Query("locale") locale?: string,
        @Query("excludeId") excludeId?: string,
    ) {
        return this.entries.slugAvailability(user.workspaceId, typeId ?? "", slug ?? "", locale || "en", excludeId);
    }

    // Exact match (title, case-insensitive, or the slug the text would produce) within
    // one type, for the reference picker's create option. Declared before `:id`.
    @Get("match")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    match(@CurrentUser() user: AuthUser, @Query("typeId") typeId?: string, @Query("text") text?: string, @Query("locale") locale?: string) {
        return this.entries.match(user.workspaceId, typeId ?? "", text ?? "", locale || "en");
    }

    @Get(":id")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.get(user.workspaceId, id);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.CONTENT_CREATE)
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateEntryDto) {
        return this.entries.create(user.workspaceId, user.id, dto, user.role);
    }

    @Patch(":id")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateEntryDto) {
        return this.entries.update(user.workspaceId, id, dto, user.id, user.role, user.role.permissions);
    }

    // CONTENT_UPDATE (not CONTENT_PUBLISH) so an editor can do the final publish of
    // content a reviewer has already approved. The service still refuses to publish
    // anything not yet approved when the actor lacks CONTENT_PUBLISH.
    @Post(":id/publish")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    publish(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.publish(user.workspaceId, id, user.id, user.role.permissions);
    }

    @Post(":id/unpublish")
    @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
    unpublish(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.unpublish(user.workspaceId, id, user.id);
    }

    /** Approve a published entry's pending draft (step 1 of Approve → Publish). */
    @Post(":id/approve-draft")
    @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
    approveDraft(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.approveDraft(user.workspaceId, id, user.id);
    }

    /** Discard a published entry's pending draft and revert to the live version. */
    @Post(":id/discard-draft")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    discardDraft(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.discardDraft(user.workspaceId, id);
    }

    @Post(":id/duplicate")
    @RequirePermissions(PERMISSIONS.CONTENT_CREATE)
    duplicate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.duplicate(user.workspaceId, user.id, id);
    }

    /** Sign-off decisions for an entry + the approval policy (any member can read). */
    @Get(":id/author")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    author(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.author(user.workspaceId, id);
    }

    @Patch(":id/author")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    setAuthor(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SetAuthorDto) {
        return this.entries.setAuthor(user.workspaceId, id, dto.authorId ?? null);
    }

    @Get(":id/reviews")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    reviews(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.listReviews(user.workspaceId, id);
    }

    /** Record an approve / request-changes decision (reviewers = publishers). */
    @Post(":id/review")
    @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
    review(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ReviewDto) {
        return this.entries.recordReview(user.workspaceId, id, user.id, dto.decision, dto.note);
    }

    @Get(":id/versions")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    versions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.versions(user.workspaceId, id);
    }

    @Post(":id/versions/:versionId/restore")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    restore(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("versionId") versionId: string) {
        return this.entries.restore(user.workspaceId, id, versionId, user.id);
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.CONTENT_DELETE)
    remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.entries.remove(user.workspaceId, id);
    }
}
