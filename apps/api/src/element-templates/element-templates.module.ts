import { Module } from "@nestjs/common";
import { ContentModule } from "../content/content.module";
import { ElementTemplatesController } from "./element-templates.controller";
import { ElementTemplatesService } from "./element-templates.service";

@Module({
    imports: [ContentModule],
    controllers: [ElementTemplatesController],
    providers: [ElementTemplatesService],
})
export class ElementTemplatesModule {}
