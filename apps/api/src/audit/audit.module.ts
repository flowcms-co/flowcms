import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { MailModule } from "../mail/mail.module";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";

/** Global so any controller/service can inject AuditService to record an event. */
@Global()
@Module({
    imports: [PrismaModule, WebhooksModule, MailModule],
    controllers: [AuditController],
    providers: [AuditService],
    exports: [AuditService],
})
export class AuditModule {}
