import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AvatarsController } from "./avatars.controller";
import { AvatarsService } from "./avatars.service";

@Module({
    imports: [PrismaModule],
    controllers: [AvatarsController],
    providers: [AvatarsService],
    exports: [AvatarsService],
})
export class AvatarsModule {}
