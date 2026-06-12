import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { KnowledgeModule } from "../knowledge/knowledge.module";

@Module({
    imports: [KnowledgeModule],
    controllers: [AiController],
    providers: [AiService],
    exports: [AiService],
})
export class AiModule {}
