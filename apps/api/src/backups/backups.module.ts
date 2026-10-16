import { Module } from "@nestjs/common";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { BackupsController } from "./backups.controller";
import { BackupsService } from "./backups.service";

@Module({
    imports: [WebhooksModule],
    controllers: [BackupsController],
    providers: [BackupsService],
    exports: [BackupsService],
})
export class BackupsModule {}
