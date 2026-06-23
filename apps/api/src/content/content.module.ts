import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { ConnectorsModule } from "../connectors/connectors.module";
import { PluginsModule } from "../plugins/plugins.module";
import { ContentTypesController } from "./content-types.controller";
import { ContentTypesService } from "./content-types.service";
import { ContentEntriesController } from "./content-entries.controller";
import { ContentEntriesService } from "./content-entries.service";
import { ApiTokensController } from "./api-tokens.controller";
import { ApiTokensService } from "./api-tokens.service";
import { PublicController } from "./public.controller";
import { PublicQueryService } from "./public-query.service";
import { RelationSyncService } from "./relation-sync.service";
import { ContentSchedulerService } from "./content-scheduler.service";
import { GraphqlController } from "./graphql/graphql.controller";
import { AgentController } from "./agent.controller";
import { StrapiController } from "./strapi.controller";
import { SelectorMapsController } from "./selector-maps.controller";
import { SelectorMapsService } from "./selector-maps.service";
import { ApiTokenGuard } from "./api-token.guard";
import { AgentTokenGuard } from "./agent-token.guard";
import { ContentJobHandlers } from "./content-job.handlers";

@Module({
    imports: [NotificationsModule, WebhooksModule, ConnectorsModule, PluginsModule],
    controllers: [
        ContentTypesController,
        ContentEntriesController,
        ApiTokensController,
        PublicController,
        GraphqlController,
        AgentController,
        StrapiController,
        SelectorMapsController,
    ],
    providers: [
        ContentTypesService,
        ContentEntriesService,
        ApiTokensService,
        PublicQueryService,
        RelationSyncService,
        ContentSchedulerService,
        SelectorMapsService,
        ApiTokenGuard,
        AgentTokenGuard,
        ContentJobHandlers,
    ],
    exports: [ContentTypesService, ContentEntriesService],
})
export class ContentModule {}
