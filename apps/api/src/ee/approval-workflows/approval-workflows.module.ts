import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { APPROVAL_PORT } from "../../content/approval.port";
import { ApprovalWorkflowsController } from "./approval-workflows.controller";
import { ApprovalWorkflowsService } from "./approval-workflows.service";

/**
 * Global so the core content engine can inject APPROVAL_PORT for the publish gate
 * without importing this commercial module. LicenseService comes from the global
 * LicenseModule.
 */
@Global()
@Module({
    imports: [PrismaModule],
    controllers: [ApprovalWorkflowsController],
    providers: [ApprovalWorkflowsService, { provide: APPROVAL_PORT, useExisting: ApprovalWorkflowsService }],
    exports: [APPROVAL_PORT],
})
export class ApprovalWorkflowsModule {}
