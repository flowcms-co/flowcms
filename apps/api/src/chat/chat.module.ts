import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ChatService } from "./chat.service";
import { ChatController } from "./chat.controller";

@Module({
    imports: [RealtimeModule, NotificationsModule],
    controllers: [ChatController],
    providers: [ChatService],
})
export class ChatModule {}
