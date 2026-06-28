import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OrgService } from "./org.service";
import { OrgController } from "./org.controller";

@Module({
    imports: [PrismaModule],
    controllers: [OrgController],
    providers: [OrgService],
    exports: [OrgService],
})
export class OrgModule {}
