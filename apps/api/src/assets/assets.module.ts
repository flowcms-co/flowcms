import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { BackupsModule } from "../backups/backups.module";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { AssetsJobHandlers } from "./assets-job.handlers";
import { StorageProvider, StorageService } from "./storage";
import { StorageController } from "./storage/storage.controller";

@Module({
    imports: [PrismaModule, AiModule, WebhooksModule, BackupsModule],
    controllers: [AssetsController, StorageController],
    providers: [AssetsService, StorageService, StorageProvider, AssetsJobHandlers],
    exports: [AssetsService],
})
export class AssetsModule {}
