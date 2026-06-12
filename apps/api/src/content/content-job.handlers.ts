import { Injectable, OnModuleInit } from "@nestjs/common";
import { JobsService, type JobRow, type JobHelpers } from "../jobs/jobs.service";
import { ContentEntriesService } from "./content-entries.service";

type BulkPayload = { ids: string[] };

/**
 * Registers the content bulk-operation job handlers (publish / unpublish /
 * move-to-draft / delete). Each loops the existing per-entry service method with a
 * per-item try/catch so one failure doesn't sink the batch, reporting progress.
 */
@Injectable()
export class ContentJobHandlers implements OnModuleInit {
    constructor(
        private readonly jobs: JobsService,
        private readonly entries: ContentEntriesService,
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
        let failed = 0;
        for (const id of ids) {
            try {
                await op(job.workspaceId, id, job.userId);
                done++;
            } catch {
                failed++;
            }
            await helpers.progress(done, failed);
        }
        return { summary: `${verb} ${done} item${done === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}` };
    }
}
