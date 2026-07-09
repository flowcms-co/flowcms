import { BadRequestException, Injectable } from "@nestjs/common";
import { SYSTEM_ROLES, slugify } from "@flowcms/shared";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * EE (Enterprise) — provisioning additional workspaces. Spinning up a new
 * workspace gives it the full set of system roles and makes the creator its
 * owner (super_admin), mirroring what the seed does for the first workspace.
 * Gated by the `multi_workspace` entitlement at the controller.
 */
@Injectable()
export class MultiWorkspaceService {
    constructor(private readonly prisma: PrismaService) {}

    async create(userId: string, name: string, slugInput?: string) {
        const cleanName = name.trim();
        if (!cleanName) throw new BadRequestException("Workspace name is required.");
        const slug = await this.uniqueSlug(slugInput?.trim() || cleanName);

        const workspace = await this.prisma.workspace.create({ data: { name: cleanName, slug } });

        // Seed the system roles for the new workspace (roles are workspace-scoped).
        await this.prisma.role.createMany({
            data: SYSTEM_ROLES.map((r) => ({
                workspaceId: workspace.id,
                key: r.key,
                name: r.name,
                description: r.description,
                permissions: r.permissions,
                dashboard: r.dashboard,
                isSystem: true,
            })),
        });
        const owner = await this.prisma.role.findUniqueOrThrow({
            where: { workspaceId_key: { workspaceId: workspace.id, key: "super_admin" } },
        });
        // The creator owns the workspace they just made.
        await this.prisma.membership.create({
            data: { userId, workspaceId: workspace.id, roleId: owner.id },
        });

        return { id: workspace.id, name: workspace.name, slug: workspace.slug };
    }

    /** Slugify the name and append -2, -3, … until it's free (slug is unique). */
    private async uniqueSlug(base: string): Promise<string> {
        const root = slugify(base, { max: 40, fallback: "workspace" });
        let slug = root;
        let n = 1;
        while (await this.prisma.workspace.findUnique({ where: { slug }, select: { id: true } })) {
            n += 1;
            slug = `${root}-${n}`;
        }
        return slug;
    }
}
