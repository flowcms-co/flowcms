import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { ContentModule } from "../content/content.module";
import { SeoController } from "./seo.controller";
import { SeoService } from "./seo.service";

@Module({
    imports: [AiModule, KnowledgeModule, ContentModule],
    controllers: [SeoController],
    providers: [SeoService],
    exports: [SeoService],
})
export class SeoModule {}
