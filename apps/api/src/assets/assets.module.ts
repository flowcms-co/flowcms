import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { AssetsJobHandlers } from "./assets-job.handlers";
import { StorageProvider } from "./storage";

@Module({
    imports: [PrismaModule, AiModule],
    controllers: [AssetsController],
    providers: [AssetsService, StorageProvider, AssetsJobHandlers],
    exports: [AssetsService],
})
export class AssetsModule {}
