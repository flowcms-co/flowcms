import { Injectable, OnModuleInit } from "@nestjs/common";
import { JobsService, type JobRow, type JobHelpers } from "../jobs/jobs.service";
import { AssetsService } from "./assets.service";

type BulkPayload = { ids: string[] };

/**
 * `assets.bulkProcess` runs the heavy per-image step (AI alt text) for a batch of
 * uploaded assets as a background job, so a multi-file upload never blocks the UI.
 */
@Injectable()
export class AssetsJobHandlers implements OnModuleInit {
    constructor(
        private readonly jobs: JobsService,
        private readonly assets: AssetsService,
    ) {}

    onModuleInit() {
        this.jobs.register("assets.bulkProcess", (j, h) => this.bulkProcess(j, h));
    }

    private async bulkProcess(job: JobRow, helpers: JobHelpers) {
        const ids = (job.payload as BulkPayload)?.ids ?? [];
        await helpers.setTotal(ids.length);
        let done = 0;
        let failed = 0;
        for (const id of ids) {
            try { await this.assets.generateAlt(job.workspaceId, job.userId, id); done++; }
            catch { failed++; }
            await helpers.progress(done, failed);
        }
        return { summary: `Processed ${done} image${done === 1 ? "" : "s"}${failed ? ` (${failed} skipped)` : ""}` };
    }
}
