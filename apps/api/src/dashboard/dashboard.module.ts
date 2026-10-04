import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { SeoModule } from "../seo/seo.module";

@Module({
    imports: [SeoModule],
    controllers: [DashboardController],
    providers: [DashboardService],
})
export class DashboardModule {}
