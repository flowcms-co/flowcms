import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AI_BUDGET_PORT } from "../../ai/ai-budget.port";
import { AiBudgetsController } from "./ai-budgets.controller";
import { AiBudgetsService } from "./ai-budgets.service";

/**
 * Global so the core AiService can inject AI_BUDGET_PORT for spend enforcement
 * without importing this commercial module. LicenseService comes from the global
 * LicenseModule.
 */
@Global()
@Module({
    imports: [PrismaModule],
    controllers: [AiBudgetsController],
    providers: [AiBudgetsService, { provide: AI_BUDGET_PORT, useExisting: AiBudgetsService }],
    exports: [AI_BUDGET_PORT],
})
export class AiBudgetsModule {}
