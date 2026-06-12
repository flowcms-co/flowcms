import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { AvatarsModule } from "../avatars/avatars.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
    imports: [MailModule, AvatarsModule],
    controllers: [AuthController],
    providers: [AuthService],
    exports: [AuthService],
})
export class AuthModule {}
