import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { TokenOrIpThrottlerGuard } from "./common/throttler.guard";
import { RedisThrottlerStorage } from "./common/redis-throttler.storage";
import { RedisService } from "./redis/redis.service";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { SystemModule } from "./system/system.module";
import { AuthModule } from "./auth/auth.module";
import { SetupModule } from "./setup/setup.module";
import { AuthGuard } from "./auth/auth.guard";
import { PermissionsGuard } from "./auth/permissions.guard";
import { UsersModule } from "./users/users.module";
import { RolesModule } from "./roles/roles.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { ConnectorsModule } from "./connectors/connectors.module";
import { PageTemplatesModule } from "./page-templates/page-templates.module";
import { AiModule } from "./ai/ai.module";
import { UsageModule } from "./usage/usage.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { SeoModule } from "./seo/seo.module";
import { SeoAuditModule } from "./seo/audit/seo-audit.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ContentModule } from "./content/content.module";
import { MailModule } from "./mail/mail.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ChatModule } from "./chat/chat.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { WorkspaceModule } from "./workspace/workspace.module";
import { ImportModule } from "./import/import.module";
import { AssetsModule } from "./assets/assets.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { PluginsModule } from "./plugins/plugins.module";
import { AvatarsModule } from "./avatars/avatars.module";
import { AuditModule } from "./audit/audit.module";
import { LicenseModule } from "./license/license.module";
import { BillingModule } from "./billing/billing.module";
import { TelemetryModule } from "./telemetry/telemetry.module";
import { OrgModule } from "./org/org.module";
import { RedisModule } from "./redis/redis.module";
import { CacheModule } from "./cache/cache.module";
import { JobsModule } from "./jobs/jobs.module";

// Optionally load the commercial (EE) modules. An open-source build that removes
// src/ee/ has nothing here; and even when present, every EE route is gated at
// runtime by the license (FeatureGuard) — so Community installs can't use it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let EE_MODULES: any[] = [];
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    EE_MODULES = require("./ee").EE_MODULES ?? [];
} catch {
    EE_MODULES = [];
}

@Module({
    imports: [
        // Loads env from the repo-root .env (and apps/api/.env if present).
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ["../../.env", ".env"],
        }),
        // Global rate-limit backstop: 300 requests / 60s per bucket (token, else
        // session, else IP — see TokenOrIpThrottlerGuard). Sensitive routes
        // tighten this with @Throttle; public delivery loosens it. Uses the
        // Redis-backed store when REDIS_URL is set so limits are shared across a
        // multi-instance deploy; falls back to the in-memory store (correct for a
        // single-instance self-host) otherwise.
        ThrottlerModule.forRootAsync({
            inject: [RedisService],
            useFactory: (redis: RedisService) => ({
                throttlers: [{ name: "default", ttl: 60_000, limit: 300 }],
                storage: redis.enabled && redis.client ? new RedisThrottlerStorage(redis.client) : undefined,
            }),
        }),
        PrismaModule,
        RedisModule,
        CacheModule,
        HealthModule,
        SystemModule,
        AuthModule,
        SetupModule,
        UsersModule,
        RolesModule,
        IntegrationsModule,
        ConnectorsModule,
        AiModule,
        UsageModule,
        AnalyticsModule,
        SeoModule,
        SeoAuditModule,
        KnowledgeModule,
        DashboardModule,
        ContentModule,
        PageTemplatesModule,
        MailModule,
        NotificationsModule,
        ChatModule,
        WebhooksModule,
        WorkspaceModule,
        ImportModule,
        AssetsModule,
        RealtimeModule,
        PluginsModule,
        AvatarsModule,
        AuditModule,
        LicenseModule,
        BillingModule,
        TelemetryModule,
        OrgModule,
        JobsModule,
        ...EE_MODULES,
    ],
    providers: [
        // Global guards run in order: rate-limit FIRST (so it shields the auth
        // routes from brute force before any auth work), then authenticate every
        // request (unless @Public), then check permissions.
        { provide: APP_GUARD, useClass: TokenOrIpThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
    ],
})
export class AppModule {}
