import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApiToken, ApiTokenType } from "@flowcms/db";
import { generateToken } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";

export class CreateApiTokenInput {
    name!: string;
    type?: ApiTokenType;
    expiresAt?: string;
    /** Permission keys this token may exercise (e.g. "content.publish"). Empty =
     *  unrestricted (back-compat: tokens predating scoping have no scopes). */
    scopes?: string[];
}

/** Parse a requested expiry. A token that is unreadable as a date, or already
 *  expired, would be dead on arrival, so both are refused up front. */
export function parseExpiry(expiresAt: string | undefined, now = new Date()): Date | null {
    if (!expiresAt) return null;
    const at = new Date(expiresAt);
    if (Number.isNaN(at.getTime())) throw new BadRequestException("The expiry date isn’t a valid date.");
    if (at <= now) throw new BadRequestException("The expiry date must be in the future.");
    return at;
}

@Injectable()
export class ApiTokensService {
    constructor(private readonly prisma: PrismaService) {}

    private sanitize(t: ApiToken) {
        return {
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            type: t.type,
            scopes: (t.scopes as string[]) ?? [],
            lastUsedAt: t.lastUsedAt,
            expiresAt: t.expiresAt,
            createdAt: t.createdAt,
        };
    }

    async list(workspaceId: string) {
        const rows = await this.prisma.apiToken.findMany({
            where: { workspaceId, revokedAt: null },
            orderBy: { createdAt: "desc" },
        });
        return rows.map((t) => this.sanitize(t));
    }

    /** Create a token and return the raw value ONCE (only the hash is stored). */
    async create(workspaceId: string, userId: string, input: CreateApiTokenInput) {
        // AGENT tokens can write content, so the empty-scopes back-compat rule
        // (empty = unrestricted) is dangerous as a silent default: a token meant to
        // be read-only would grant full write access. Require explicit scopes for new
        // AGENT tokens; pass ["*"] to intentionally grant everything (F-18).
        if (input.type === "AGENT" && (!input.scopes || input.scopes.length === 0)) {
            throw new BadRequestException('AGENT tokens require explicit scopes. Pass ["*"] for full access, or specific permission keys (e.g. "content.read").');
        }
        const expiresAt = parseExpiry(input.expiresAt);
        const { token, hash, prefix } = generateToken("flw");
        const created = await this.prisma.apiToken.create({
            data: {
                workspaceId,
                name: input.name,
                tokenHash: hash,
                prefix,
                type: input.type ?? "CONTENT",
                scopes: input.scopes ?? [],
                expiresAt,
                createdById: userId,
            },
        });
        return { token, ...this.sanitize(created) };
    }

    async revoke(workspaceId: string, id: string) {
        // Soft-delete: stamp revokedAt (no hard delete). Auth guards reject revoked
        // tokens and list() hides them, but the row + its audit trail are preserved.
        const existing = await this.prisma.apiToken.findFirst({ where: { id, workspaceId, revokedAt: null } });
        if (!existing) throw new NotFoundException("Token not found.");
        await this.prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
        return { ok: true };
    }
}
