import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditExportController } from "./audit-export.controller";

@Module({
    imports: [PrismaModule],
    controllers: [AuditExportController],
})
export class AuditExportModule {}
