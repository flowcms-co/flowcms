import { Injectable, OnModuleInit } from "@nestjs/common";
import { JobsService, type JobRow, type JobHelpers } from "../jobs/jobs.service";
import { ContentEntriesService } from "./content-entries.service";
import { PrismaService } from "../prisma/prisma.service";
import { altBackfillPatch } from "./alt-backfill";
import { fieldsOf } from "./entry-validation";

type BulkPayload = { ids: string[] };

/**
 * Registers the content bulk-operation job handlers (publish / unpublish /
 * move-to-draft / delete). Each loops the existing per-entry service method with a
 * per-item try/catch so one failure doesn't sink the batch, reporting progress and
 * recording WHICH items failed and WHY (e.g. "approve the draft first") in the job
 * result + the completion notification, so the batch history is actionable.
 */
@Injectable()
export class ContentJobHandlers implements OnModuleInit {
    constructor(
        private readonly jobs: JobsService,
        private readonly entries: ContentEntriesService,
        private readonly prisma: PrismaService,
    ) {}

    onModuleInit() {
        this.jobs.register("content.bulkPublish", (j, h) => this.run(j, h, (ws, id, uid) => this.entries.publish(ws, id, uid), "Published"));
        this.jobs.register("content.bulkUnpublish", (j, h) => this.run(j, h, (ws, id, uid) => this.entries.unpublish(ws, id, uid), "Unpublished"));
        this.jobs.register("content.bulkDraft", (j, h) => this.run(j, h, (ws, id, uid) => this.entries.unpublish(ws, id, uid), "Moved to draft"));
        this.jobs.register("content.bulkDelete", (j, h) => this.run(j, h, (ws, id) => this.entries.remove(ws, id), "Deleted"));
        this.jobs.register("content.fillAltFromAssets", (j, h) => this.fillAltFromAssets(j, h));
    }

    /**
     * One-off backfill: give every library image already used on a page the asset's
     * alt text where the page has none (paired alt fields, rich text and body <img>).
     * Saved through the normal update path, so a live page gets a pending draft to
     * approve and publish rather than changing on the site; drafts are edited in
     * place. Author-written alt text is never overwritten. Safe to run again.
     */
    private async fillAltFromAssets(job: JobRow, helpers: JobHelpers) {
        const ws = job.workspaceId;
        const media = await this.prisma.media.findMany({ where: { workspaceId: ws, alt: { not: null } }, select: { url: true, alt: true } });
        const altByKey = new Map(media.filter((m) => m.alt?.trim()).map((m) => [m.url.split("/").pop() ?? "", m.alt!.trim()]));
        // Match on the unique object key, so relative /media/<key> and CDN URLs both resolve.
        const altFor = (url: string) => altByKey.get(url.split(/[?#]/)[0].split("/").pop() ?? "");

        const entries = await this.prisma.contentEntry.findMany({
            where: { workspaceId: ws },
            select: { id: true, status: true, data: true, draftData: true, contentType: { select: { schema: true } } },
        });
        const components = await this.entries.componentMap(ws);
        await helpers.setTotal(entries.length);

        let updated = 0;
        let checked = 0;
        const failures: { id: string; label: string; reason: string }[] = [];
        for (const e of entries) {
            // A live page's edits stage onto its pending draft, so fill from that copy.
            const source = ((e.status === "PUBLISHED" ? e.draftData ?? e.data : e.data) ?? {}) as Record<string, unknown>;
            const patch = altByKey.size ? altBackfillPatch(fieldsOf(e.contentType.schema), source, components, altFor) : {};
            if (Object.keys(patch).length) {
                try {
                    await this.entries.update(ws, e.id, { data: patch }, job.userId);
                    updated++;
                } catch (err) {
                    failures.push({ id: e.id, label: await this.entryLabel(ws, e.id), reason: err instanceof Error ? err.message : "Failed" });
                }
            }
            checked++;
            await helpers.progress(checked - failures.length, failures.length, failures.at(-1)?.reason);
        }
        const summary = `Filled alt text on ${updated} page${updated === 1 ? "" : "s"}${failures.length ? `, ${failures.length} failed` : ""}`;
        return { summary, result: { done: updated, failed: failures.length, failures } };
    }

    private async run(
        job: JobRow,
        helpers: JobHelpers,
        op: (workspaceId: string, id: string, userId: string) => Promise<unknown>,
        verb: string,
    ) {
        const ids = (job.payload as BulkPayload)?.ids ?? [];
        await helpers.setTotal(ids.length);
        let done = 0;
        const failures: { id: string; label: string; reason: string }[] = [];
        for (const id of ids) {
            try {
                await op(job.workspaceId, id, job.userId);
                done++;
            } catch (e) {
                failures.push({ id, label: await this.entryLabel(job.workspaceId, id), reason: e instanceof Error ? e.message : "Failed" });
            }
            await helpers.progress(done, failures.length, failures.at(-1)?.reason);
        }
        const failed = failures.length;
        const summary = `${verb} ${done} item${done === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`;
        return { summary, result: { done, failed, failures } };
    }

    /** A human label for a failed entry (its title, else slug, else id) for the report. */
    private async entryLabel(workspaceId: string, id: string): Promise<string> {
        const e = await this.prisma.contentEntry.findFirst({ where: { id, workspaceId }, select: { data: true, slug: true } }).catch(() => null);
        const title = (e?.data as { title?: string } | null)?.title;
        return typeof title === "string" && title.trim() ? title.trim() : e?.slug || id;
    }
}
