import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { SystemService } from "./system.service";
import { UpdaterClient } from "./updater.client";
import { PlatformUpdaterService } from "./platform.service";

@Controller("system")
export class SystemController {
    constructor(
        private readonly system: SystemService,
        private readonly updater: UpdaterClient,
        private readonly platform: PlatformUpdaterService,
    ) {}

    /** The running version + how it's deployed (any member can read). */
    @Get("version")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    version() {
        return { version: this.system.version(), deployment: this.system.deployment(), updaterAvailable: this.updater.available() };
    }

    /** Whether a newer release is available (admin-only — drives the Updates panel). */
    @Get("updates")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async updates(@CurrentUser() user: AuthUser, @Query("force") force?: string) {
        const info = await this.system.updates(force === "1" || force === "true");
        const platformUpdater = await this.platform.status(user.workspaceId).catch(() => null);
        return { ...info, updaterAvailable: this.updater.available(), platformUpdater };
    }

    // ── One-click updates on managed hosts (Railway / Render) ─────────────────
    @Get("platform-updater")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    platformUpdater(@CurrentUser() user: AuthUser) {
        return this.platform.status(user.workspaceId);
    }

    @Put("platform-updater")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    savePlatformUpdater(@CurrentUser() user: AuthUser, @Body() body: { secret?: string }) {
        return this.platform.save(user.workspaceId, body?.secret || "");
    }

    @Delete("platform-updater")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    disconnectPlatformUpdater(@CurrentUser() user: AuthUser) {
        return this.platform.disconnect(user.workspaceId);
    }

    /** Ask the platform to redeploy with the newest image (the platform pulls and
     *  restarts; migrations apply on boot — same effect as a dashboard redeploy). */
    @Post("platform-redeploy")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    platformRedeploy(@CurrentUser() user: AuthUser) {
        return this.platform.redeploy(user.workspaceId);
    }

    // ── Backups (Super-Admin). Performed by the updater sidecar. ──────────────
    @Get("backups")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    backups() {
        return this.updater.listBackups();
    }

    @Post("backups")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    createBackup() {
        return this.updater.createBackup();
    }

    @Delete("backups/:id")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async deleteBackup(@Param("id") id: string) {
        await this.updater.deleteBackup(id);
        return { ok: true };
    }

    @Get("backups/:id/download")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    download(@Param("id") id: string, @Res() res: Response) {
        return this.updater.streamBackup(id, res);
    }

    // ── One-click upgrade (Super-Admin). Orchestrated by the updater. ─────────
    @Post("upgrade")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    upgrade(@Body() body: { toVersion?: string }) {
        return this.updater.startUpgrade(body?.toVersion);
    }

    /** Poll the upgrade progress. The API itself restarts mid-upgrade, so the studio
     *  retries this until it answers again (then reads the final, persisted status). */
    @Get("upgrade/status")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    upgradeStatus() {
        return this.updater.upgradeStatus();
    }

    /** Restore a backup (DB + media, optionally secrets). Destructive — strong confirm in the UI. */
    @Post("restore/:id")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async restore(@Param("id") id: string, @Body() body: { restoreEnv?: boolean }) {
        await this.updater.restore(id, !!body?.restoreEnv);
        return { ok: true };
    }
}
