import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { ConnectorsModule } from "../connectors/connectors.module";
import { PluginsModule } from "../plugins/plugins.module";
import { ContentTypesController } from "./content-types.controller";
import { ContentTypesService } from "./content-types.service";
import { ContentEntriesController } from "./content-entries.controller";
import { ContentEntriesService } from "./content-entries.service";
import { ContentListService } from "./content-list.service";
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
import { AgentMediaController } from "./agent-media.controller";
import { AgentModelController } from "./agent-model.controller";
import { TrashController } from "./trash.controller";
import { AssetsModule } from "../assets/assets.module";
import { BackupsModule } from "../backups/backups.module";

@Module({
    imports: [NotificationsModule, WebhooksModule, ConnectorsModule, PluginsModule, AssetsModule, BackupsModule],
    controllers: [
        ContentTypesController,
        ContentEntriesController,
        ApiTokensController,
        PublicController,
        GraphqlController,
        // Before AgentController: its `:type` routes would otherwise take /agent/assets and /agent/model.
        AgentMediaController,
        AgentModelController,
        AgentController,
        TrashController,
        StrapiController,
        SelectorMapsController,
    ],
    providers: [
        ContentTypesService,
        ContentEntriesService,
        ContentListService,
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
