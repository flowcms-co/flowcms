import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { generateToken } from "@flowcms/shared";
import { PrismaService } from "../../prisma/prisma.service";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";

type ScimName = { formatted?: string; givenName?: string; familyName?: string };
export type ScimUserBody = {
    userName?: string;
    displayName?: string;
    name?: ScimName;
    active?: boolean;
    emails?: { value?: string; primary?: boolean }[];
    Operations?: { op?: string; path?: string; value?: unknown }[];
};
type FlowUser = { id: string; email: string; name: string | null; isActive: boolean };

/**
 * EE (Enterprise) — SCIM 2.0 user provisioning + the SCIM token lifecycle. Maps a
 * SCIM User to a Flow user + a membership in the token's workspace, so an IdP
 * (Okta/Azure AD/…) can create, update and deactivate people automatically. Gated
 * by `scim` at the guard.
 */
@Injectable()
export class ScimService {
    constructor(private readonly prisma: PrismaService) {}

    // ── SCIM token lifecycle (studio side) ──────────────────────────────────
    async mintToken(workspaceId: string, userId: string, name?: string) {
        const { token, hash, prefix } = generateToken("scim");
        const t = await this.prisma.apiToken.create({
            data: { workspaceId, name: name?.trim() || "SCIM provisioning", tokenHash: hash, prefix, type: "SCIM", scopes: [], createdById: userId },
        });
        return { token, id: t.id, name: t.name, prefix: t.prefix, createdAt: t.createdAt };
    }
    async listTokens(workspaceId: string) {
        const rows = await this.prisma.apiToken.findMany({ where: { workspaceId, type: "SCIM", revokedAt: null }, orderBy: { createdAt: "desc" } });
        return rows.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt }));
    }
    async revokeToken(workspaceId: string, id: string) {
        // Soft-delete (no hard delete): revoked SCIM tokens are rejected at auth + hidden.
        await this.prisma.apiToken.updateMany({ where: { id, workspaceId, type: "SCIM", revokedAt: null }, data: { revokedAt: new Date() } });
        return { ok: true };
    }

    // ── SCIM 2.0 Users ──────────────────────────────────────────────────────
    private toScim(u: FlowUser) {
        return {
            schemas: [USER_SCHEMA],
            id: u.id,
            userName: u.email,
            name: u.name ? { formatted: u.name } : undefined,
            displayName: u.name ?? undefined,
            active: u.isActive,
            emails: [{ value: u.email, primary: true }],
            meta: { resourceType: "User" },
        };
    }
    /** A user is only visible to SCIM if they're a member of the token's workspace. */
    private async member(workspaceId: string, userId: string): Promise<FlowUser | null> {
        const m = await this.prisma.membership.findFirst({ where: { workspaceId, userId }, include: { user: true } });
        return m ? { id: m.user.id, email: m.user.email, name: m.user.name, isActive: m.user.isActive } : null;
    }

    async listUsers(workspaceId: string, filter?: string) {
        const m = filter?.match(/userName eq "([^"]+)"/i);
        const email = m ? m[1].toLowerCase() : undefined;
        const members = await this.prisma.membership.findMany({
            where: { workspaceId, ...(email ? { user: { email } } : {}) },
            include: { user: true },
        });
        const Resources = members.map((mm) => this.toScim({ id: mm.user.id, email: mm.user.email, name: mm.user.name, isActive: mm.user.isActive }));
        return { schemas: [LIST_SCHEMA], totalResults: Resources.length, startIndex: 1, itemsPerPage: Resources.length, Resources };
    }

    async getUser(workspaceId: string, id: string) {
        const u = await this.member(workspaceId, id);
        if (!u) throw new NotFoundException("User not found.");
        return this.toScim(u);
    }

    async createUser(workspaceId: string, body: ScimUserBody) {
        const email = String(body.userName || body.emails?.[0]?.value || "").toLowerCase().trim();
        if (!email) throw new BadRequestException("userName (email) is required.");
        const name =
            body.displayName ||
            body.name?.formatted ||
            [body.name?.givenName, body.name?.familyName].filter(Boolean).join(" ") ||
            null;
        let user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            user = await this.prisma.user.create({ data: { email, name, isActive: body.active !== false, emailVerifiedAt: new Date() } });
        } else if (body.active === false && user.isActive) {
            user = await this.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
        }
        // Provision a membership (Editor) in this workspace if not already a member.
        const editor = await this.prisma.role.findUnique({ where: { workspaceId_key: { workspaceId, key: "editor" } } });
        if (editor) {
            await this.prisma.membership.upsert({
                where: { userId_workspaceId: { userId: user.id, workspaceId } },
                update: {},
                create: { userId: user.id, workspaceId, roleId: editor.id },
            });
        }
        return this.toScim({ id: user.id, email: user.email, name: user.name, isActive: user.isActive });
    }

    async replaceUser(workspaceId: string, id: string, body: ScimUserBody) {
        const u = await this.member(workspaceId, id);
        if (!u) throw new NotFoundException("User not found.");
        const name = body.displayName || body.name?.formatted || u.name;
        const updated = await this.prisma.user.update({ where: { id: u.id }, data: { name, isActive: body.active !== false } });
        return this.toScim({ id: updated.id, email: updated.email, name: updated.name, isActive: updated.isActive });
    }

    async patchUser(workspaceId: string, id: string, body: ScimUserBody) {
        const u = await this.member(workspaceId, id);
        if (!u) throw new NotFoundException("User not found.");
        let active = u.isActive;
        if (Array.isArray(body.Operations)) {
            for (const op of body.Operations) {
                if ((op.op || "").toLowerCase() !== "replace") continue;
                if (op.path === "active") active = op.value === true || op.value === "true";
                else if (op.value && typeof op.value === "object" && "active" in (op.value as object)) {
                    active = !!(op.value as { active?: boolean }).active;
                }
            }
        } else if (typeof body.active === "boolean") {
            active = body.active;
        }
        const updated = await this.prisma.user.update({ where: { id: u.id }, data: { isActive: active } });
        return this.toScim({ id: updated.id, email: updated.email, name: updated.name, isActive: updated.isActive });
    }

    /** SCIM delete = deactivate (we never hard-delete a Flow user from an IdP signal). */
    async deactivate(workspaceId: string, id: string) {
        const u = await this.member(workspaceId, id);
        if (!u) throw new NotFoundException("User not found.");
        await this.prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    }
}
