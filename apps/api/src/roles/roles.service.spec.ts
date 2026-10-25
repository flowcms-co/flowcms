import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@flowcms/shared";
import { RolesService } from "./roles.service";

function setup(existing: { key: string; permissions: string[] } = { key: "custom_x", permissions: [PERMISSIONS.CONTENT_READ] }) {
    const prisma = {
        role: {
            findUnique: vi.fn(async () => null),
            findFirst: vi.fn(async () => ({ id: "r1", ...existing, name: "X", description: null, dashboard: "editor", lockSeoMeta: false, allowedTypeIds: [] })),
            create: vi.fn(async () => ({ id: "r1", key: "custom_x" })),
            update: vi.fn(async () => ({})),
        },
    };
    return { svc: new RolesService(prisma as never), prisma };
}

describe("role permissions", () => {
    it("refuses unknown permission keys", async () => {
        const { svc, prisma } = setup();
        await expect(svc.create("w1", { name: "X", permissions: ["content.read", "root.everything"] } as never, "super_admin")).rejects.toThrow(/Unknown permission/);
        expect(prisma.role.create).not.toHaveBeenCalled();
    });

    it('only a Super Admin may grant "*"', async () => {
        const { svc, prisma } = setup();
        await expect(svc.create("w1", { name: "X", permissions: ["*"] } as never, "admin")).rejects.toThrow(/Only a Super Admin/);
        await expect(svc.update("w1", "r1", { permissions: ["*"] } as never, "admin")).rejects.toThrow(/Only a Super Admin/);
        expect(prisma.role.update).not.toHaveBeenCalled();
        await svc.create("w1", { name: "X", permissions: ["*"] } as never, "super_admin");
        expect(prisma.role.create).toHaveBeenCalled();
    });

    it("accepts catalog keys from anyone with roles.manage", async () => {
        const { svc, prisma } = setup();
        await svc.update("w1", "r1", { permissions: [PERMISSIONS.CONTENT_READ, PERMISSIONS.MEDIA_MANAGE] } as never, "admin");
        expect(prisma.role.update).toHaveBeenCalled();
    });
});
