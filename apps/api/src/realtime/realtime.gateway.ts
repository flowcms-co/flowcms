import { Logger } from "@nestjs/common";
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { SESSION_COOKIE } from "../auth/constants";

const STUDIO = process.env.STUDIO_URL ?? "http://localhost:3000";

/** Minimal cookie-header parser (avoids pulling in a dep). */
function parseCookies(header?: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(";")) {
        const i = part.indexOf("=");
        if (i < 0) continue;
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

/**
 * Realtime push for chat + notifications. Authenticates the socket handshake
 * with the same `flow_session` cookie the REST API uses, then joins the client
 * to `user:<id>` and `ws:<workspaceId>` rooms; clients join `chan:<id>` when
 * viewing a channel. Services call emitToUser / emitToChannel / emitToWorkspace.
 * Polling stays as a fallback, so realtime is a pure enhancement.
 */
@WebSocketGateway({ cors: { origin: STUDIO, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
    private readonly logger = new Logger("RealtimeGateway");
    @WebSocketServer() server!: Server;

    constructor(private readonly auth: AuthService) {}

    async handleConnection(client: Socket) {
        try {
            const token = parseCookies(client.handshake.headers.cookie)[SESSION_COOKIE];
            const user = token ? await this.auth.validate(token) : null;
            if (!user) {
                client.disconnect(true);
                return;
            }
            client.data.user = { id: user.id, workspaceId: user.workspaceId };
            client.join(`user:${user.id}`);
            client.join(`ws:${user.workspaceId}`);
        } catch (e) {
            this.logger.warn(`socket auth failed: ${e instanceof Error ? e.message : e}`);
            client.disconnect(true);
        }
    }

    /** Client subscribes to a chat channel's live messages (one at a time). */
    @SubscribeMessage("chat:join")
    joinChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: unknown) {
        for (const room of client.rooms) if (room.startsWith("chan:")) client.leave(room);
        if (typeof channelId === "string" && channelId) client.join(`chan:${channelId}`);
    }

    emitToUser(userId: string, event: string, payload: unknown) {
        this.server?.to(`user:${userId}`).emit(event, payload);
    }
    emitToUsers(userIds: string[], event: string, payload: unknown) {
        for (const id of new Set(userIds)) this.emitToUser(id, event, payload);
    }
    emitToChannel(channelId: string, event: string, payload: unknown) {
        this.server?.to(`chan:${channelId}`).emit(event, payload);
    }
    emitToWorkspace(workspaceId: string, event: string, payload: unknown) {
        this.server?.to(`ws:${workspaceId}`).emit(event, payload);
    }
}
