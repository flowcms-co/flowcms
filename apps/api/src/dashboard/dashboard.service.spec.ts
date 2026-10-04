import { describe, expect, it, vi } from "vitest";
import { DashboardService } from "./dashboard.service";
import type { AuthUser } from "../auth/types";

const user = (permissions: string[], allowedTypeIds: string[] = []) =>
    ({ id: "u1", workspaceId: "w1", role: { id: "r", key: "custom", name: "Custom", permissions, dashboard: null, lockSeoMeta: false, allowedTypeIds } }) as unknown as AuthUser;

function setup(rbacAllowed: string[] | null = null) {
    const prisma = {
        workspace: { findUnique: vi.fn().mockResolvedValue({ defaultWeeklyGoal: 3, authorMode: "creator", timezone: "UTC", locales: ["en", "fr"] }) },
        contentType: { findMany: vi.fn().mockResolvedValue([{ id: "t1", name: "Blog" }]) },
        membership: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
        usageRecord: { count: vi.fn().mockResolvedValue(0) },
        auditLog: { findMany: vi.fn().mockResolvedValue([]) },
        contentEntry: {
            // total entries, then approved drafts of live pages
            count: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(2),
            findMany: vi.fn().mockResolvedValue([]),
            groupBy: vi.fn().mockResolvedValue([{ status: "APPROVED", _count: { _all: 1 } }, { status: "PUBLISHED", _count: { _all: 7 } }]),
        },
    };
    const cache = { wrap: (_k: string, _t: number, fn: () => unknown) => fn() };
    const rbac = { allowedTypeIds: vi.fn().mockResolvedValue(rbacAllowed), stripLockedFields: vi.fn() };
    return { prisma, service: new DashboardService(prisma as never, cache as never, rbac as never) };
}

describe("DashboardService.summary", () => {
    it("counts approved drafts of live pages as ready to publish", async () => {
        const { service, prisma } = setup();
        const s = await service.summary(user(["content.read", "content.publish"]));
        expect(s.pipeline).toEqual({ draft: 0, review: 0, approved: 3, scheduled: 0, published: 7 });
        expect(prisma.contentEntry.count).toHaveBeenLastCalledWith({ where: { workspaceId: "w1", status: "PUBLISHED", draftApproved: true } });
        expect(s.perLocale).toBe(true);
    });

    it("keeps workspace-wide sections from roles that cannot publish, and never sends the team", async () => {
        const { service, prisma } = setup();
        const s = await service.summary(user(["content.read"]));
        expect(s).toMatchObject({ pipeline: null, activity: null, calendar: null });
        expect(s).not.toHaveProperty("team");
        expect(s.my).toBeDefined();
        expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it("limits every query to the content types the role allows", async () => {
        const { service, prisma } = setup(["t1"]);
        await service.summary(user(["*"], ["t1"]));
        const scoped = { in: ["t1"] };
        expect(prisma.contentEntry.groupBy.mock.calls[0][0].where.contentTypeId).toEqual(scoped);
        expect(prisma.contentEntry.count.mock.calls[0][0].where.contentTypeId).toEqual(scoped);
        for (const [arg] of prisma.contentEntry.findMany.mock.calls) {
            const where = arg.where.AND ? arg.where.AND[0] : arg.where;
            expect(where.contentTypeId).toEqual(scoped);
        }
    });

    it("asks the database for this week's calendar only", async () => {
        const { service, prisma } = setup();
        await service.summary(user(["*"]));
        const cal = prisma.contentEntry.findMany.mock.calls.map(([a]) => a.where).find((w) => w.OR?.[0]?.scheduledAt);
        expect(cal.OR[0].scheduledAt.gte).toBeInstanceOf(Date);
        expect(+cal.OR[0].scheduledAt.lt - +cal.OR[0].scheduledAt.gte).toBe(7 * 86_400_000);
        expect(cal.OR[1]).toMatchObject({ status: "PUBLISHED" });
    });
});
