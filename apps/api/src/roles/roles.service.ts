import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRoleDto, UpdateRoleDto } from "./dto";

/** Human-readable groupings of the permission catalog for the role editor UI. */
const PERMISSION_CATALOG = [
    {
        group: "Workspace",
        items: [
            { key: PERMISSIONS.WORKSPACE_MANAGE, label: "Manage workspace settings" },
            { key: PERMISSIONS.USERS_MANAGE, label: "Manage users" },
            { key: PERMISSIONS.ROLES_MANAGE, label: "Manage roles" },
            { key: PERMISSIONS.INTEGRATIONS_MANAGE, label: "Manage integrations" },
            { key: PERMISSIONS.APITOKENS_MANAGE, label: "Manage API tokens" },
            { key: PERMISSIONS.WEBHOOKS_MANAGE, label: "Manage webhooks" },
            { key: PERMISSIONS.BILLING_MANAGE, label: "Manage billing" },
            { key: PERMISSIONS.SECURITY_MANAGE, label: "Manage security" },
        ],
    },
    {
        group: "Content",
        items: [
            { key: PERMISSIONS.CONTENT_READ, label: "View content" },
            { key: PERMISSIONS.CONTENT_CREATE, label: "Create content" },
            { key: PERMISSIONS.CONTENT_UPDATE, label: "Edit content" },
            { key: PERMISSIONS.CONTENT_PUBLISH, label: "Publish / approve content" },
            { key: PERMISSIONS.CONTENT_DELETE, label: "Delete content" },
            { key: PERMISSIONS.MEDIA_READ, label: "View media" },
            { key: PERMISSIONS.MEDIA_MANAGE, label: "Manage media" },
        ],
    },
    {
        group: "SEO & AI",
        items: [
            { key: PERMISSIONS.SEO_READ, label: "View SEO" },
            { key: PERMISSIONS.SEO_MANAGE, label: "Manage SEO" },
            { key: PERMISSIONS.ANALYTICS_READ, label: "View analytics" },
            { key: PERMISSIONS.AI_USE, label: "Use AI tools" },
            { key: PERMISSIONS.AI_MANAGE, label: "Configure AI" },
        ],
    },
    {
        group: "Collaboration",
        items: [{ key: PERMISSIONS.CHAT_USE, label: "Use chat" }],
    },
];

@Injectable()
export class RolesService {
    constructor(private readonly prisma: PrismaService) {}

    catalog() {
        return { dashboards: ["overview", "seo", "editor", "research"], groups: PERMISSION_CATALOG };
    }

    async list(workspaceId: string) {
        const roles = await this.prisma.role.findMany({
            where: { workspaceId },
            include: { _count: { select: { memberships: true } } },
            orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        });
        return roles.map((r) => ({
            id: r.id,
            key: r.key,
            name: r.name,
            description: r.description,
            permissions: r.permissions as string[],
            dashboard: r.dashboard,
            lockSeoMeta: r.lockSeoMeta,
            allowedTypeIds: (r.allowedTypeIds as string[]) ?? [],
            isSystem: r.isSystem,
            memberCount: r._count.memberships,
        }));
    }

    private async uniqueKey(workspaceId: string, name: string) {
        const base =
            "custom_" +
            name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")
                .slice(0, 40);
        let key = base;
        let n = 1;
        while (
            await this.prisma.role.findUnique({ where: { workspaceId_key: { workspaceId, key } } })
        ) {
            key = `${base}_${n++}`;
        }
        return key;
    }

    async create(workspaceId: string, dto: CreateRoleDto) {
        const key = await this.uniqueKey(workspaceId, dto.name);
        const role = await this.prisma.role.create({
            data: {
                workspaceId,
                key,
                name: dto.name,
                description: dto.description ?? null,
                permissions: dto.permissions,
                dashboard: dto.dashboard ?? "editor",
                lockSeoMeta: dto.lockSeoMeta ?? false,
                allowedTypeIds: dto.allowedTypeIds ?? [],
                isSystem: false,
            },
        });
        return { id: role.id, key: role.key };
    }

    async update(workspaceId: string, roleId: string, dto: UpdateRoleDto) {
        const role = await this.prisma.role.findFirst({ where: { id: roleId, workspaceId } });
        if (!role) throw new NotFoundException("Role not found.");

        // The Super Admin role always keeps full power.
        const permissions =
            role.key === "super_admin" ? ["*"] : (dto.permissions ?? (role.permissions as string[]));

        await this.prisma.role.update({
            where: { id: roleId },
            data: {
                name: dto.name ?? role.name,
                description: dto.description ?? role.description,
                permissions,
                dashboard: dto.dashboard ?? role.dashboard,
                lockSeoMeta: dto.lockSeoMeta ?? role.lockSeoMeta,
                allowedTypeIds: dto.allowedTypeIds ?? (role.allowedTypeIds as string[]),
            },
        });
        return { ok: true };
    }

    async remove(workspaceId: string, roleId: string) {
        const role = await this.prisma.role.findFirst({
            where: { id: roleId, workspaceId },
            include: { _count: { select: { memberships: true } } },
        });
        if (!role) throw new NotFoundException("Role not found.");
        if (role.isSystem) throw new BadRequestException("System roles can't be deleted.");
        if (role._count.memberships > 0) {
            throw new BadRequestException(
                "Reassign the people using this role before deleting it.",
            );
        }
        await this.prisma.role.delete({ where: { id: roleId } });
        return { ok: true };
    }
}
