import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { CreateEntryDto, UpdateEntryDto } from "./entries.dto";
import { ContentEntriesService } from "./content-entries.service";
import { JobsService } from "../jobs/jobs.service";

class ReviewDto {
    @IsIn(["approve", "request_changes"]) decision!: "approve" | "request_changes";
    @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

class BulkIdsDto {
    @IsArray() @ArrayNotEmpty() @IsString({ each: true }) ids!: string[];
}

@Controller("entries")
export class ContentEntriesController {
    constructor(
        private readonly entries: ContentEntriesService,
        private readonly jobs: JobsService,
    ) {}

    @Get()
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    list(
        @CurrentUser() user: AuthUser,
        @Query("typeId") typeId?: string,
        @Query("status") status?: string,
        @Query("q") q?: string,
        @Query("locale") locale?: string,
        @Query("author") author?: string,
    ) {
        // `author=me` scopes the list to the signed-in user's own entries.
        const authorId = author === "me" ? user.id : author || undefined;
        return this.entries.list(user.workspaceId, { typeId, status, q, locale, authorId }, user.role);
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

    @Post("bulk/delete")
    @RequirePermissions(PERMISSIONS.CONTENT_DELETE)
    bulkDelete(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
        return this.jobs.enqueue(user.workspaceId, user.id, "content.bulkDelete", `Delete ${dto.ids.length} item${dto.ids.length === 1 ? "" : "s"}`, { ids: dto.ids }, dto.ids.length);
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
