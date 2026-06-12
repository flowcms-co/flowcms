import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions, type Job as BullJob } from "bullmq";
import { Prisma } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { NotificationsService } from "../notifications/notifications.service";

/** The row passed to a handler (the persisted Job). */
export interface JobRow {
    id: string;
    workspaceId: string;
    userId: string;
    type: string;
    label: string;
    payload: unknown;
}

/** Helpers a handler uses to report progress as it processes items. */
export interface JobHelpers {
    setTotal(n: number): Promise<void>;
    /** Report cumulative counts (+ an optional note for the latest item). */
    progress(completed: number, failed?: number, note?: string): Promise<void>;
}

export type JobHandler = (
    job: JobRow,
    helpers: JobHelpers,
) => Promise<{ summary?: string; result?: unknown } | void>;

const QUEUE_NAME = "flowcms-jobs";
const CONCURRENCY = 3;

/**
 * Runs bulk/heavy work in the background so the app is never locked. The DB `Job`
 * row is the source of truth (UI + history); execution goes through BullMQ when
 * `REDIS_URL` is set (durable, multi-instance, retries), else an in-process queue.
 * Progress is pushed to the starting user over the realtime socket; completion also
 * writes a notification (the bell history behind the toast). Handlers are registered
 * by the feature modules (content/seo/assets) so there are no circular imports.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(JobsService.name);
    private readonly handlers = new Map<string, JobHandler>();
    private queue: Queue | null = null;
    private worker: Worker | null = null;
    // in-process fallback
    private pending: string[] = [];
    private active = 0;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly realtime: RealtimeGateway,
        private readonly notifications: NotificationsService,
    ) {}

    onModuleInit() {
        if (this.redis.enabled && this.redis.client) {
            // BullMQ bundles its own ioredis copy, so the shared client's type differs
            // structurally; it's the same runtime ioredis client, so the cast is safe.
            const connection = this.redis.client as unknown as ConnectionOptions;
            this.queue = new Queue(QUEUE_NAME, { connection });
            this.worker = new Worker(
                QUEUE_NAME,
                async (bull: BullJob<{ jobId: string }>) => { await this.runJob(bull.data.jobId); },
                { connection, concurrency: CONCURRENCY },
            );
            this.worker.on("failed", (_b, err) => this.logger.warn(`Worker job failed: ${err?.message}`));
            this.logger.log("Jobs: BullMQ executor (Redis).");
            // BullMQ recovers its own stalled jobs, so we don't sweep RUNNING rows
            // here (another instance may legitimately be running them).
        } else {
            this.logger.log("Jobs: in-process executor (no Redis).");
            // Single-instance recovery: any job still marked RUNNING/QUEUED was
            // orphaned by a crash/restart (in-process queue state is not durable),
            // so it can never resume — fail it cleanly instead of leaving it stuck.
            void this.reapOrphanedJobs();
        }
    }

    /** Fail jobs left RUNNING/QUEUED by a previous process (in-process runner only). */
    private async reapOrphanedJobs() {
        try {
            const { count } = await this.prisma.job.updateMany({
                where: { status: { in: ["RUNNING", "QUEUED"] } },
                data: { status: "FAILED", error: "Interrupted by a server restart.", finishedAt: new Date() },
            });
            if (count > 0) this.logger.warn(`Reaped ${count} orphaned job(s) left running by a previous restart.`);
        } catch (e) {
            this.logger.warn(`Orphan-job sweep failed: ${e instanceof Error ? e.message : e}`);
        }
    }

    async onModuleDestroy() {
        await this.worker?.close().catch(() => undefined);
        await this.queue?.close().catch(() => undefined);
    }

    /** Feature modules call this in their onModuleInit to register a handler by type. */
    register(type: string, handler: JobHandler) {
        this.handlers.set(type, handler);
    }

    /** Create a job + schedule it. Returns the persisted row (status QUEUED). */
    async enqueue(workspaceId: string, userId: string, type: string, label: string, payload: Prisma.InputJsonValue, total = 0) {
        const job = await this.prisma.job.create({
            data: { workspaceId, userId, type, label, payload, total, status: "QUEUED" },
        });
        if (this.queue) {
            await this.queue.add(type, { jobId: job.id }, { removeOnComplete: 500, removeOnFail: 500, attempts: 1 });
        } else {
            this.pending.push(job.id);
            this.pump();
        }
        return job;
    }

    private pump() {
        while (this.active < CONCURRENCY && this.pending.length) {
            const id = this.pending.shift()!;
            this.active++;
            void this.runJob(id).finally(() => { this.active--; this.pump(); });
        }
    }

    /** Load + execute a job through its registered handler, persisting progress. */
    async runJob(jobId: string) {
        const job = await this.prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return;
        const handler = this.handlers.get(job.type);
        if (!handler) {
            await this.finish(job.id, job.workspaceId, job.userId, job.label, "FAILED", { error: `No handler for ${job.type}` });
            return;
        }
        await this.prisma.job.update({ where: { id: jobId }, data: { status: "RUNNING" } });
        this.emit(job.workspaceId, job.userId, "job:update", { ...job, status: "RUNNING" });

        const row: JobRow = { id: job.id, workspaceId: job.workspaceId, userId: job.userId, type: job.type, label: job.label, payload: job.payload };
        let total = job.total;
        const helpers: JobHelpers = {
            setTotal: async (n) => {
                total = n;
                await this.prisma.job.update({ where: { id: jobId }, data: { total: n } });
                this.emit(job.workspaceId, job.userId, "job:update", { id: jobId, total: n });
            },
            progress: async (completed, failed = 0, note) => {
                const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
                await this.prisma.job.update({ where: { id: jobId }, data: { completed, failed, progress } });
                this.emit(job.workspaceId, job.userId, "job:update", { id: jobId, completed, failed, progress, note, total });
            },
        };

        try {
            const out = (await handler(row, helpers)) ?? {};
            const fresh = await this.prisma.job.findUnique({ where: { id: jobId } });
            const failed = fresh?.failed ?? 0;
            const status = failed > 0 && (fresh?.completed ?? 0) > 0 ? "PARTIAL" : failed > 0 && (fresh?.completed ?? 0) === 0 ? "FAILED" : "SUCCEEDED";
            await this.finish(jobId, job.workspaceId, job.userId, out.summary ?? job.label, status, { result: out.result });
        } catch (e) {
            this.logger.warn(`Job ${job.type} failed: ${e instanceof Error ? e.message : e}`);
            await this.finish(jobId, job.workspaceId, job.userId, job.label, "FAILED", { error: e instanceof Error ? e.message.slice(0, 300) : "Job failed" });
        }
    }

    private async finish(
        jobId: string, workspaceId: string, userId: string, label: string,
        status: "SUCCEEDED" | "FAILED" | "PARTIAL", extra: { result?: unknown; error?: string },
    ) {
        const job = await this.prisma.job.update({
            where: { id: jobId },
            data: {
                status,
                progress: status === "SUCCEEDED" ? 100 : undefined,
                error: extra.error,
                result: (extra.result ?? undefined) as Prisma.InputJsonValue | undefined,
                finishedAt: new Date(),
            },
        });
        this.emit(workspaceId, userId, "job:done", job);
        // Bell history (the durable half of the toast).
        const ok = status === "SUCCEEDED";
        await this.notifications.create(workspaceId, userId, {
            type: "job",
            title: ok ? `Done: ${label}` : status === "PARTIAL" ? `Partly done: ${label}` : `Failed: ${label}`,
            body: ok ? `${job.completed} completed.` : status === "PARTIAL" ? `${job.completed} done, ${job.failed} failed.` : (extra.error ?? "The task failed."),
        }).catch(() => undefined);
    }

    private emit(workspaceId: string, userId: string, event: string, payload: unknown) {
        try { this.realtime.emitToUser(userId, event, payload); } catch { /* socket optional */ }
    }

    /** Active + recent jobs for the current user (drives the toast tracker). */
    async list(workspaceId: string, userId: string) {
        return this.prisma.job.findMany({
            where: { workspaceId, userId },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
    }

    async get(workspaceId: string, id: string) {
        return this.prisma.job.findFirst({ where: { id, workspaceId } });
    }
}
