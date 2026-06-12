import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SeoAuditModule } from "../../seo/audit/seo-audit.module";
import { SeoAutomationController } from "./seo-automation.controller";
import { SeoAutomationService } from "./seo-automation.service";

/**
 * EE (Pro+) — the SEO auto-scheduler. Reuses the core SEO audit service + L2 AI
 * executor (exported by SeoAuditModule); LicenseService comes from the global
 * LicenseModule. Loaded only when the ee/ directory is present, and every route is
 * still license-gated at runtime (FeatureGuard).
 */
@Module({
    imports: [PrismaModule, SeoAuditModule],
    controllers: [SeoAutomationController],
    providers: [SeoAutomationService],
})
export class SeoAutomationModule {}
