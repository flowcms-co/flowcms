import { describe, expect, it, vi } from "vitest";
import { ContentSchedulerService } from "./content-scheduler.service";

describe("ContentSchedulerService.publishDue", () => {
    it("clears the schedule on publish, keeps the first publish date and records the event", async () => {
        const scheduledAt = new Date("2026-10-05T09:00:00Z");
        const first = new Date("2026-09-01T09:00:00Z");
        const update = vi.fn().mockResolvedValue({});
        const create = vi.fn().mockResolvedValue({});
        const prisma = {
            contentEntry: {
                findMany: vi.fn().mockResolvedValue([{ id: "e1", slug: "s", workspaceId: "w1", scheduledAt, publishedAt: null, firstPublishedAt: first, contentType: { apiId: "blog" } }]),
                update,
            },
            auditLog: { create },
        };
        const service = new ContentSchedulerService(
            prisma as never,
            { tryAcquire: vi.fn().mockResolvedValue(true) } as never,
            { dispatch: vi.fn() } as never,
            { delByPrefix: vi.fn() } as never,
        );
        expect(await service.publishDue()).toBe(1);
        expect(update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { status: "PUBLISHED", publishedAt: scheduledAt, firstPublishedAt: first, scheduledAt: null } });
        expect(create.mock.calls[0][0].data).toMatchObject({ action: "content.publish", userId: null, resourceId: "e1" });
    });
});
