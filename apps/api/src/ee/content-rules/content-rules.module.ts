import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { CONTENT_RULES_PORT } from "../../content/content-rules.port";
import { ContentRulesController } from "./content-rules.controller";
import { ContentRulesService } from "./content-rules.service";

/**
 * Global so the core content engine can inject CONTENT_RULES_PORT without importing this
 * commercial module. LicenseService comes from the global LicenseModule.
 */
@Global()
@Module({
    imports: [PrismaModule],
    controllers: [ContentRulesController],
    providers: [ContentRulesService, { provide: CONTENT_RULES_PORT, useExisting: ContentRulesService }],
    exports: [CONTENT_RULES_PORT],
})
export class ContentRulesModule {}
