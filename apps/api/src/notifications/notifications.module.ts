import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { DigestScheduler } from "./digest.scheduler";

@Module({
    imports: [MailModule, RealtimeModule],
    controllers: [NotificationsController],
    providers: [NotificationsService, DigestScheduler],
    exports: [NotificationsService],
})
export class NotificationsModule {}
