import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";
import { UpdaterClient } from "./updater.client";
import { UpdateNotifierService } from "./update-notifier.service";
import { PlatformUpdaterService } from "./platform.service";

/** Self-host system info + backup/upgrade orchestration via the updater sidecar,
 *  and one-click platform redeploys for managed hosts (Railway / Render). */
@Module({
    imports: [NotificationsModule],
    controllers: [SystemController],
    providers: [SystemService, UpdaterClient, UpdateNotifierService, PlatformUpdaterService],
    exports: [SystemService, UpdaterClient, PlatformUpdaterService],
})
export class SystemModule {}
