import { Module } from "@nestjs/common";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";
import { UpdaterClient } from "./updater.client";

/** Self-host system info + backup/upgrade orchestration via the updater sidecar. */
@Module({
    controllers: [SystemController],
    providers: [SystemService, UpdaterClient],
    exports: [SystemService, UpdaterClient],
})
export class SystemModule {}
