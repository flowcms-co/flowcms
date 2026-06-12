import { Module } from "@nestjs/common";
import { ContentModule } from "../content/content.module";
import { PageTemplatesController } from "./page-templates.controller";
import { PageTemplatesService } from "./page-templates.service";

@Module({
    imports: [ContentModule],
    controllers: [PageTemplatesController],
    providers: [PageTemplatesService],
})
export class PageTemplatesModule {}
