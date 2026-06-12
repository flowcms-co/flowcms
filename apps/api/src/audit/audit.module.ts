import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";

/** Global so any controller/service can inject AuditService to record an event. */
@Global()
@Module({
    imports: [PrismaModule],
    controllers: [AuditController],
    providers: [AuditService],
    exports: [AuditService],
})
export class AuditModule {}
