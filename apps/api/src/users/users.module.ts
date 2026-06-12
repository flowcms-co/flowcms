import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
    imports: [MailModule, NotificationsModule],
    controllers: [UsersController],
    providers: [UsersService],
})
export class UsersModule {}
