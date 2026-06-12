import { Global, Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";

/**
 * Global so any feature module can inject JobsService (to enqueue + register
 * handlers) without importing this module. Handlers are registered by the feature
 * modules themselves, keeping the queue engine free of feature dependencies.
 */
@Global()
@Module({
    imports: [RealtimeModule, NotificationsModule],
    controllers: [JobsController],
    providers: [JobsService],
    exports: [JobsService],
})
export class JobsModule {}
