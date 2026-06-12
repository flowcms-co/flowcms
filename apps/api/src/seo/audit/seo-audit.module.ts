import { Module } from "@nestjs/common";
import { AiModule } from "../../ai/ai.module";
import { LicenseModule } from "../../license/license.module";
import { AssetsModule } from "../../assets/assets.module";
import { ContentModule } from "../../content/content.module";
import { SeoModule } from "../seo.module";
import { SeoAuditService } from "./seo-audit.service";
import { SeoAiExecutorService } from "./seo-ai-executor.service";
import { SeoDripService } from "./seo-drip.service";
import { SeoJobHandlers } from "./seo-job.handlers";
import { SeoAuditController } from "./seo-audit.controller";

/**
 * SEO Automation Engine — deterministic audit ledger (Phase 2) + the L2 AI
 * executor (Phase 4). PrismaService is global; AiService + LicenseService come
 * from their modules. SeoModule provides SeoService (crawl/vitals/summary/etc.)
 * which the unified issues endpoint composes into site-scope findings.
 */
@Module({
    imports: [AiModule, LicenseModule, SeoModule, AssetsModule, ContentModule],
    controllers: [SeoAuditController],
    providers: [SeoAuditService, SeoAiExecutorService, SeoDripService, SeoJobHandlers],
    exports: [SeoAuditService, SeoAiExecutorService],
})
export class SeoAuditModule {}
