import { Injectable, OnModuleInit } from "@nestjs/common";
import { JobsService, type JobRow, type JobHelpers } from "../jobs/jobs.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssetsService } from "./assets.service";

type BulkPayload = { ids: string[] };
type Failure = { id: string; label: string; reason: string };

/** Max concurrent vision calls, and a per-image ceiling so one stalled provider
 *  request can't hang the whole batch. */
const CONCURRENCY = 3;
const PER_IMAGE_TIMEOUT_MS = 60_000;

const withTimeout = <T>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
    new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(msg)), ms);
        p.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); },
        );
    });

/** Run `fn` over `items` with at most `limit` in flight at once. */
const mapPool = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> => {
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const item = items[next++];
            await fn(item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

/**
 * `assets.bulkProcess` runs the heavy per-image step (AI alt text) for a batch of
 * uploaded assets as a background job, so a multi-file upload never blocks the UI.
 * Per-image failures are captured with a reason (e.g. "no vision provider",
 * "rate limited") and surfaced in the job result, so the toast/bell explains why
 * instead of a bare "task failed".
 */
@Injectable()
export class AssetsJobHandlers implements OnModuleInit {
    constructor(
        private readonly jobs: JobsService,
        private readonly assets: AssetsService,
        private readonly prisma: PrismaService,
    ) {}

    onModuleInit() {
        this.jobs.register("assets.bulkProcess", (j, h) => this.bulkProcess(j, h));
    }

    private async bulkProcess(job: JobRow, helpers: JobHelpers) {
        const ids = (job.payload as BulkPayload)?.ids ?? [];
        await helpers.setTotal(ids.length);

        // Resolve filenames once so failures read "angela3.webp — ..." not a cuid.
        const names = new Map<string, string>();
        try {
            const rows = await this.prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true, filename: true } });
            for (const r of rows) names.set(r.id, r.filename);
        } catch {
            /* labelling is best-effort */
        }

        let done = 0;
        let failed = 0;
        const failures: Failure[] = [];

        await mapPool(ids, CONCURRENCY, async (id) => {
            try {
                await withTimeout(
                    this.assets.generateAlt(job.workspaceId, job.userId, id),
                    PER_IMAGE_TIMEOUT_MS,
                    "Timed out generating alt text.",
                );
                done++;
            } catch (e) {
                failed++;
                if (failures.length < 50) {
                    failures.push({
                        id,
                        label: names.get(id) ?? id,
                        reason: (e instanceof Error ? e.message : "Failed to generate alt text.").slice(0, 200),
                    });
                }
            }
            await helpers.progress(done, failed);
        });

        const summary = `Generated alt text for ${done} image${done === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}`;
        return { summary, result: { done, failed, failures } };
    }
}
