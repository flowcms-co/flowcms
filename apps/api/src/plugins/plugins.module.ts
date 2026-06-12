import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PluginsController } from "./plugins.controller";
import { PluginsService } from "./plugins.service";

@Module({
    imports: [PrismaModule],
    controllers: [PluginsController],
    providers: [PluginsService],
    exports: [PluginsService],
})
export class PluginsModule {}
