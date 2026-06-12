import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LicenseService } from "../../license/license.service";
import type { SessionPolicyContext, SessionPolicyPort } from "../../auth/session-policy.port";

/** Normalise a client IP: strip IPv4-mapped-IPv6 prefix + zone id, lowercase. */
function normIp(ip: string): string {
    let s = ip.trim().toLowerCase();
    if (s.startsWith("::ffff:") && s.includes(".")) s = s.slice(7);
    const z = s.indexOf("%");
    if (z >= 0) s = s.slice(0, z);
    return s;
}
function v4ToInt(ip: string): number | null {
    const p = ip.split(".");
    if (p.length !== 4) return null;
    let n = 0;
    for (const o of p) {
        const x = Number(o);
        if (!/^\d+$/.test(o) || !Number.isInteger(x) || x < 0 || x > 255) return null;
        n = ((n << 8) | x) >>> 0;
    }
    return n >>> 0;
}
/** Does `ip` match an allowlist entry (exact IPv4/IPv6, or IPv4 CIDR)? */
function ipMatches(ip: string, entry: string): boolean {
    const target = normIp(ip);
    const e = entry.trim().toLowerCase();
    if (!e) return false;
    if (e.includes("/")) {
        const [net, bitsStr] = e.split("/");
        const bits = Number(bitsStr);
        const a = v4ToInt(target);
        const b = v4ToInt(net);
        if (a !== null && b !== null && Number.isInteger(bits) && bits >= 0 && bits <= 32) {
            const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
            return (a & mask) >>> 0 === (b & mask) >>> 0;
        }
        return false; // IPv6 CIDR not supported in v1
    }
    const en = normIp(e);
    if (en === target) return true;
    const a = v4ToInt(target);
    const b = v4ToInt(en);
    return a !== null && b !== null && a === b;
}
const IP_OR_CIDR = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;

/**
 * EE (Enterprise) — IP allowlist + session policy. Implements the core
 * SessionPolicyPort (called from auth on sign-in + every request): refuses
 * disallowed IPs and expired / idle sessions. No-op unless licensed for
 * `ip_policies`. Break-glass: set `IP_POLICY_DISABLED=1` to bypass (recover from a
 * mis-set allowlist that locks everyone out).
 */
@Injectable()
export class IpPoliciesService implements SessionPolicyPort {
    constructor(
        private readonly prisma: PrismaService,
        private readonly license: LicenseService,
    ) {}

    async assertRequestAllowed(workspaceId: string, ctx: SessionPolicyContext): Promise<void> {
        if (process.env.IP_POLICY_DISABLED === "1") return;
        if (!(await this.license.has("ip_policies"))) return;
        const ws = await this.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { ipAllowlist: true, sessionMaxHours: true, sessionIdleMinutes: true },
        });
        if (!ws) return;
        const allow = (ws.ipAllowlist as string[]) ?? [];
        if (allow.length && ctx.ip && !allow.some((e) => ipMatches(ctx.ip!, e))) {
            throw new ForbiddenException("Access from your network isn't allowed for this workspace.");
        }
        const now = Date.now();
        if (ws.sessionMaxHours && ctx.sessionCreatedAt.getTime() + ws.sessionMaxHours * 3_600_000 < now) {
            throw new UnauthorizedException("Your session has expired. Please sign in again.");
        }
        if (ws.sessionIdleMinutes && ctx.lastSeenAt && ctx.lastSeenAt.getTime() + ws.sessionIdleMinutes * 60_000 < now) {
            throw new UnauthorizedException("Signed out after a period of inactivity. Please sign in again.");
        }
    }

    async getPolicy(workspaceId: string) {
        const ws = await this.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { ipAllowlist: true, sessionMaxHours: true, sessionIdleMinutes: true },
        });
        return {
            ipAllowlist: (ws?.ipAllowlist as string[]) ?? [],
            sessionMaxHours: ws?.sessionMaxHours ?? null,
            sessionIdleMinutes: ws?.sessionIdleMinutes ?? null,
        };
    }

    async setPolicy(workspaceId: string, dto: { ipAllowlist?: string[]; sessionMaxHours?: number; sessionIdleMinutes?: number }) {
        const list = Array.isArray(dto.ipAllowlist)
            ? [...new Set(dto.ipAllowlist.map((s) => String(s).trim()).filter((s) => s && IP_OR_CIDR.test(s)))].slice(0, 200)
            : [];
        const maxH = dto.sessionMaxHours && dto.sessionMaxHours > 0 ? Math.min(24 * 365, Math.floor(dto.sessionMaxHours)) : null;
        const idle = dto.sessionIdleMinutes && dto.sessionIdleMinutes > 0 ? Math.max(5, Math.min(60 * 24, Math.floor(dto.sessionIdleMinutes))) : null;
        const ws = await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { ipAllowlist: list, sessionMaxHours: maxH, sessionIdleMinutes: idle },
        });
        return { ipAllowlist: ws.ipAllowlist, sessionMaxHours: ws.sessionMaxHours, sessionIdleMinutes: ws.sessionIdleMinutes };
    }

    /** Force sign-out everywhere: revoke every session for this workspace's members. */
    async revokeAll(workspaceId: string) {
        const members = await this.prisma.membership.findMany({ where: { workspaceId }, select: { userId: true } });
        const ids = [...new Set(members.map((m) => m.userId))];
        const r = await this.prisma.session.deleteMany({ where: { userId: { in: ids } } });
        return { ok: true, revoked: r.count };
    }
}
