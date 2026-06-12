import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@flowcms/db";
import { PrismaService } from "../prisma/prisma.service";
import { BUILTINS, builtinByKey, defaultConfig, type HookCtx } from "./plugins.registry";

@Injectable()
export class PluginsService {
    private readonly logger = new Logger("PluginsService");

    constructor(private readonly prisma: PrismaService) {}

    /** Built-in catalog merged with this workspace's enabled state + config. */
    async list(workspaceId: string) {
        const rows = await this.prisma.plugin.findMany({ where: { workspaceId } });
        const byKey = new Map(rows.map((r) => [r.key, r]));
        return BUILTINS.map((p) => {
            const row = byKey.get(p.key);
            return {
                key: p.key,
                name: p.name,
                description: p.description,
                fields: p.fields ?? [],
                enabled: row?.enabled ?? false,
                config: { ...defaultConfig(p), ...((row?.config as Record<string, unknown>) ?? {}) },
            };
        });
    }

    async update(workspaceId: string, key: string, patch: { enabled?: boolean; config?: Record<string, unknown> }) {
        if (!builtinByKey(key)) throw new NotFoundException(`Unknown plugin "${key}".`);
        const existing = await this.prisma.plugin.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
        const config = patch.config
            ? ({ ...((existing?.config as object) ?? {}), ...patch.config } as Prisma.InputJsonValue)
            : undefined;
        const row = await this.prisma.plugin.upsert({
            where: { workspaceId_key: { workspaceId, key } },
            create: { workspaceId, key, enabled: patch.enabled ?? false, config: config ?? {} },
            update: { ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), ...(config ? { config } : {}) },
        });
        return { key: row.key, enabled: row.enabled, config: row.config };
    }

    /** Run all enabled `beforeSave` hooks, merging their returned keys into data. */
    async runBeforeSave(workspaceId: string, ctx: HookCtx): Promise<Record<string, unknown>> {
        const rows = await this.prisma.plugin.findMany({ where: { workspaceId, enabled: true } });
        if (!rows.length) return ctx.data;
        let data = { ...ctx.data };
        for (const row of rows) {
            const p = builtinByKey(row.key);
            if (!p?.beforeSave) continue;
            try {
                const merged = p.beforeSave({ ...ctx, data }, { ...defaultConfig(p), ...((row.config as Record<string, unknown>) ?? {}) });
                if (merged && typeof merged === "object") data = { ...data, ...merged };
            } catch (e) {
                this.logger.warn(`plugin "${row.key}" beforeSave failed: ${e instanceof Error ? e.message : e}`);
            }
        }
        return data;
    }
}
