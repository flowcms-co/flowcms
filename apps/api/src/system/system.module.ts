import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";
import { UpdaterClient } from "./updater.client";
import { UpdateNotifierService } from "./update-notifier.service";

/** Self-host system info + backup/upgrade orchestration via the updater sidecar. */
@Module({
    imports: [NotificationsModule],
    controllers: [SystemController],
    providers: [SystemService, UpdaterClient, UpdateNotifierService],
    exports: [SystemService, UpdaterClient],
})
export class SystemModule {}
