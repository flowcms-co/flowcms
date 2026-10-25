import { describe, expect, it, vi } from "vitest";
import { UsersService } from "./users.service";

function setup(targetRole = "editor") {
    const prisma = {
        user: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: "new", email: "n@x.com" })), update: vi.fn(async () => ({})), count: vi.fn(async () => 1) },
        role: { findUnique: vi.fn(async ({ where }: { where: { workspaceId_key: { key: string } } }) => ({ id: `r_${where.workspaceId_key.key}`, key: where.workspaceId_key.key, name: "R" })) },
        membership: {
            findUnique: vi.fn(async () => ({ role: { key: targetRole } })),
            count: vi.fn(async () => 2),
            update: vi.fn(async () => ({})),
            delete: vi.fn(async () => ({})),
        },
        session: { deleteMany: vi.fn(async () => ({ count: 1 })) },
        workspace: { findUnique: vi.fn(async () => null) },
    };
    const license = { info: vi.fn(async () => ({ plan: "community" })) };
    const mail = { sendTemplate: vi.fn(async () => ({ sent: false })) };
    return { svc: new UsersService(prisma as never, mail as never, {} as never, license as never), prisma };
}

describe("Super Admin role guard", () => {
    it("an admin can't create a Super Admin", async () => {
        const { svc } = setup();
        await expect(svc.create("w1", { email: "n@x.com", password: "x".repeat(12), roleKey: "super_admin" } as never, "u1", "admin")).rejects.toThrow(/Only a Super Admin/);
    });

    it("an admin can't promote anyone (themselves included) to Super Admin", async () => {
        const { svc, prisma } = setup("admin");
        await expect(svc.update("w1", "u1", "u1", { roleKey: "super_admin" } as never, "admin")).rejects.toThrow(/Only a Super Admin/);
        expect(prisma.membership.update).not.toHaveBeenCalled();
    });

    it("an admin can't demote, deactivate or remove a Super Admin", async () => {
        const { svc } = setup("super_admin");
        await expect(svc.update("w1", "u1", "u2", { roleKey: "editor" } as never, "admin")).rejects.toThrow(/Only a Super Admin/);
        await expect(svc.update("w1", "u1", "u2", { isActive: false } as never, "admin")).rejects.toThrow(/Only a Super Admin/);
        await expect(svc.remove("w1", "u1", "u2", "admin")).rejects.toThrow(/Only a Super Admin/);
    });

    it("a Super Admin can promote", async () => {
        const { svc, prisma } = setup("editor");
        await svc.update("w1", "u1", "u2", { roleKey: "super_admin" } as never, "super_admin");
        expect(prisma.membership.update).toHaveBeenCalled();
    });
});

describe("deactivation", () => {
    it("deletes the user's sessions", async () => {
        const { svc, prisma } = setup("editor");
        await svc.update("w1", "u1", "u2", { isActive: false } as never, "admin");
        expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    });
});
