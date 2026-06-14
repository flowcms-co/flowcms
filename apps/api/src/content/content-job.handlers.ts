import { Injectable, OnModuleInit } from "@nestjs/common";
import { JobsService, type JobRow, type JobHelpers } from "../jobs/jobs.service";
import { ContentEntriesService } from "./content-entries.service";
import { PrismaService } from "../prisma/prisma.service";

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
