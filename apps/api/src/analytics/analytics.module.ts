import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsSchedulerService } from "./analytics-scheduler.service";

@Module({
    controllers: [AnalyticsController],
    providers: [AnalyticsService, AnalyticsSchedulerService],
    exports: [AnalyticsService],
})
export class AnalyticsModule {}
