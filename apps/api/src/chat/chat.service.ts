import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ChatChannel } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class ChatService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly realtime: RealtimeGateway,
        private readonly notifications: NotificationsService,
    ) {}

    /** Resolve `@Name` / `@email-local` mentions in a message to workspace user
     *  ids (excluding the author). Matches each member's display name or email
     *  local part right after an `@`, case-insensitive, longest handle first. */
    private async resolveMentions(workspaceId: string, body: string, authorId: string): Promise<string[]> {
        if (!body.includes("@")) return [];
        const members = await this.prisma.membership.findMany({
            where: { workspaceId },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const candidates = members
            .map((m) => ({ id: m.user.id, handles: [m.user.name ?? "", (m.user.email ?? "").split("@")[0]].filter(Boolean) }))
            .sort((a, b) => Math.max(0, ...b.handles.map((h) => h.length)) - Math.max(0, ...a.handles.map((h) => h.length)));
        const hit = new Set<string>();
        for (const c of candidates) {
            if (c.id === authorId) continue;
            if (c.handles.some((h) => h && new RegExp(`@${esc(h)}\\b`, "i").test(body))) hit.add(c.id);
        }
        return [...hit];
    }

    /** Find-or-create the workspace's universal "general" channel. */
    private async ensureUniversal(workspaceId: string) {
        const existing = await this.prisma.chatChannel.findFirst({ where: { workspaceId, kind: "UNIVERSAL" } });
        if (existing) return existing;
        return this.prisma.chatChannel.create({ data: { workspaceId, name: "general", kind: "UNIVERSAL" } });
    }

    /** Channels the user can see: the universal channel + any they're a member of. */
    async listChannels(workspaceId: string, userId: string) {
        await this.ensureUniversal(workspaceId);
        const channels = await this.prisma.chatChannel.findMany({
            where: { workspaceId, OR: [{ kind: "UNIVERSAL" }, { members: { some: { userId } } }] },
            include: {
                _count: { select: { members: true } },
                messages: { take: 1, orderBy: { createdAt: "desc" }, select: { body: true, createdAt: true } },
            },
            orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
        });
        return channels.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            isPrivate: c.isPrivate,
            members: c._count.members,
            lastMessage: c.messages[0]?.body ?? null,
            lastАt: c.messages[0]?.createdAt ?? null,
        }));
    }

    private async access(workspaceId: string, userId: string, channelId: string): Promise<ChatChannel> {
        const channel = await this.prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId } });
        if (!channel) throw new NotFoundException("Channel not found.");
        if (channel.kind === "UNIVERSAL") return channel;
        const member = await this.prisma.channelMember.findUnique({
            where: { channelId_userId: { channelId, userId } },
        });
        if (!member) throw new ForbiddenException("You're not a member of this channel.");
        return channel;
    }

    async createChannel(workspaceId: string, userId: string, dto: { name: string; isPrivate?: boolean }) {
        const channel = await this.prisma.chatChannel.create({
            data: {
                workspaceId,
                name: dto.name.replace(/^#/, "").trim() || "channel",
                kind: "GROUP",
                isPrivate: dto.isPrivate ?? false,
                createdById: userId,
                members: { create: { userId } },
            },
        });
        return { id: channel.id, name: channel.name, kind: channel.kind, isPrivate: channel.isPrivate, members: 1, lastMessage: null, lastАt: null };
    }

    async listMessages(workspaceId: string, userId: string, channelId: string, after?: string) {
        await this.access(workspaceId, userId, channelId);
        const rows = await this.prisma.chatMessage.findMany({
            where: { channelId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
            take: after ? 100 : 80,
        });
        return rows.map((m) => ({
            id: m.id,
            body: m.body,
            createdAt: m.createdAt,
            author: { id: m.user.id, name: m.user.name ?? m.user.email },
        }));
    }

    async postMessage(workspaceId: string, userId: string, channelId: string, body: string) {
        const channel = await this.access(workspaceId, userId, channelId);
        const text = body.trim();
        if (!text) throw new ForbiddenException("Empty message.");
        const m = await this.prisma.chatMessage.create({
            data: { channelId, userId, body: text.slice(0, 4000) },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
        const message = { id: m.id, body: m.body, createdAt: m.createdAt, channelId, author: { id: m.user.id, name: m.user.name ?? m.user.email } };

        // Realtime: push to everyone viewing the channel.
        this.realtime.emitToChannel(channelId, "chat:message", message);

        // @mentions → a notification for each mentioned member.
        const mentioned = await this.resolveMentions(workspaceId, m.body, userId);
        if (mentioned.length) {
            const snippet = m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body;
            await this.notifications.createMany(workspaceId, mentioned, {
                type: "mention",
                title: `${message.author.name} mentioned you in #${channel.name}`,
                body: snippet,
                href: `/chat?channel=${channelId}`,
            });
        }
        return message;
    }

    /** Workspace members for the @mention autocomplete. */
    async members(workspaceId: string) {
        const rows = await this.prisma.membership.findMany({
            where: { workspaceId },
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
        });
        return rows.map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email, email: m.user.email }));
    }
}
