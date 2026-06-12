import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type AuditEntry = {
    workspaceId: string;
    userId?: string | null;
    action: string; // e.g. "auth.signin", "user.create", "integration.connect"
    resource: string; // e.g. "User", "Role", "Integration"
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
};

/**
 * Tamper-evident-ish trail of security-sensitive actions (auth, privilege and
 * integration/secret changes). Writes are BEST-EFFORT — a logging failure must
 * never break the action it's recording, and must never carry a secret value
 * (only ids / labels / booleans go in `metadata`).
 */
@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(private readonly prisma: PrismaService) {}

    /** Fire-and-forget; swallows its own errors. */
    record(entry: AuditEntry): void {
        void this.prisma.auditLog
            .create({
                data: {
                    workspaceId: entry.workspaceId,
                    userId: entry.userId ?? null,
                    action: entry.action,
                    resource: entry.resource,
                    resourceId: entry.resourceId ?? null,
                    metadata: (entry.metadata ?? undefined) as object | undefined,
                    ip: entry.ip ?? null,
                },
            })
            .catch((e) => this.logger.warn(`audit write failed (${entry.action}): ${e instanceof Error ? e.message : e}`));
    }

    /** Recent events for a workspace (newest first), with the actor's identity. */
    async list(workspaceId: string, limit = 100) {
        const rows = await this.prisma.auditLog.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
            take: Math.min(Math.max(limit, 1), 200),
            include: { user: { select: { id: true, name: true, email: true } } },
        });
        return rows.map((r) => ({
            id: r.id,
            action: r.action,
            resource: r.resource,
            resourceId: r.resourceId,
            metadata: r.metadata,
            ip: r.ip,
            createdAt: r.createdAt,
            actor: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email } : null,
        }));
    }
}
