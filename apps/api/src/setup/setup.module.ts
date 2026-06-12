import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AvatarsModule } from "../avatars/avatars.module";
import { SetupController } from "./setup.controller";
import { SetupService } from "./setup.service";

@Module({
    imports: [AuthModule, AvatarsModule],
    controllers: [SetupController],
    providers: [SetupService],
})
export class SetupModule {}
