import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { IntegrationType } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";

export type PlatformUpdaterStatus = {
    /** Detected managed host from the runtime env, or null. */
    platform: "railway" | "render" | null;
    /** A credential is stored (or provided via env) and redeploys can be triggered in-app. */
    configured: boolean;
    /** What's missing when not configured (shown in the settings UI). */
    reason: string | null;
};

const RAILWAY_GQL = "https://backboard.railway.com/graphql/v2";

/**
 * In-app updates for managed platforms (Railway / Render). The all-in-one image
 * can't replace itself — the platform owns the container lifecycle — but every
 * platform exposes a supported way to trigger a redeploy remotely. Store that
 * credential once (encrypted at rest like every other secret) and "Update now"
 * works from inside the studio: the platform pulls the newest image and boots
 * it, migrations apply on start, and nobody ever SSHes anywhere.
 *
 *   Railway: an API token; the service/environment ids come from Railway's own
 *            injected env vars. Redeploy is one GraphQL mutation.
 *   Render:  the service's Deploy Hook URL (Settings → Deploy Hook); redeploy
 *            is a single POST to it.
 */
@Injectable()
export class PlatformUpdaterService {
    private readonly log = new Logger(PlatformUpdaterService.name);

    constructor(private readonly prisma: PrismaService) {}

    platform(): "railway" | "render" | null {
        if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PUBLIC_DOMAIN) return "railway";
        if (process.env.RENDER || process.env.RENDER_SERVICE_ID) return "render";
        return null;
    }

    /** Env-provided credential (operators who prefer configuration-as-env). */
    private envSecret(platform: "railway" | "render"): string | null {
        if (platform === "railway") return process.env.RAILWAY_API_TOKEN || null;
        return process.env.RENDER_DEPLOY_HOOK_URL || null;
    }

    private row(workspaceId: string) {
        return this.prisma.integration.findFirst({ where: { workspaceId, type: IntegrationType.HOSTING } });
    }

    async status(workspaceId: string): Promise<PlatformUpdaterStatus> {
        const platform = this.platform();
        if (!platform) return { platform: null, configured: false, reason: null };
        if (platform === "railway" && !(process.env.RAILWAY_SERVICE_ID && process.env.RAILWAY_ENVIRONMENT_ID)) {
            return { platform, configured: false, reason: "Railway didn't expose RAILWAY_SERVICE_ID / RAILWAY_ENVIRONMENT_ID to this service." };
        }
        if (this.envSecret(platform)) return { platform, configured: true, reason: null };
        const row = await this.row(workspaceId);
        if (row?.encryptedSecret) return { platform, configured: true, reason: null };
        return {
            platform,
            configured: false,
            reason:
                platform === "railway"
                    ? "Add a Railway API token to enable one-click updates."
                    : "Add this service's Deploy Hook URL to enable one-click updates.",
        };
    }

    async save(workspaceId: string, secret: string): Promise<PlatformUpdaterStatus> {
        const platform = this.platform();
        if (!platform) throw new BadRequestException("No managed platform detected for this deployment.");
        const value = (secret || "").trim();
        if (!value) throw new BadRequestException("Provide the credential to store.");
        if (platform === "render" && !/^https:\/\/api\.render\.com\/deploy\//.test(value)) {
            throw new BadRequestException("That doesn't look like a Render Deploy Hook URL (https://api.render.com/deploy/…).");
        }
        const data = {
            type: IntegrationType.HOSTING,
            provider: platform,
            label: platform === "railway" ? "Railway" : "Render",
            config: {},
            encryptedSecret: encryptSecret(value),
            status: "CONNECTED" as const,
            lastCheckedAt: new Date(),
        };
        const existing = await this.row(workspaceId);
        if (existing) await this.prisma.integration.update({ where: { id: existing.id }, data });
        else await this.prisma.integration.create({ data: { workspaceId, ...data } });
        return this.status(workspaceId);
    }

    async disconnect(workspaceId: string): Promise<PlatformUpdaterStatus> {
        const existing = await this.row(workspaceId);
        if (existing) await this.prisma.integration.delete({ where: { id: existing.id } });
        return this.status(workspaceId);
    }

    /** Trigger a platform redeploy; the platform pulls the newest image and restarts. */
    async redeploy(workspaceId: string): Promise<{ ok: true; message: string }> {
        const platform = this.platform();
        if (!platform) throw new BadRequestException("No managed platform detected for this deployment.");
        let secret = this.envSecret(platform);
        if (!secret) {
            const row = await this.row(workspaceId);
            if (!row?.encryptedSecret) throw new BadRequestException("One-click updates aren't configured yet.");
            secret = decryptSecret(row.encryptedSecret);
        }
        if (platform === "railway") {
            await this.railwayRedeploy(secret);
            return { ok: true, message: "Railway is redeploying the service with the newest image." };
        }
        await this.renderRedeploy(secret);
        return { ok: true, message: "Render is redeploying the service with the newest image." };
    }

    private async railwayRedeploy(token: string): Promise<void> {
        const serviceId = process.env.RAILWAY_SERVICE_ID;
        const environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
        if (!serviceId || !environmentId) throw new BadRequestException("Railway service/environment ids aren't available in this environment.");
        const body = JSON.stringify({
            query: "mutation Redeploy($environmentId: String!, $serviceId: String!) { serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId) }",
            variables: { environmentId, serviceId },
        });
        // Account/team tokens authenticate with a Bearer header; project tokens use
        // Project-Access-Token. Try Bearer first, fall back transparently.
        const attempt = async (headers: Record<string, string>) => {
            const res = await fetch(RAILWAY_GQL, {
                method: "POST",
                headers: { "content-type": "application/json", ...headers },
                body,
                signal: AbortSignal.timeout(15000),
            });
            const json = (await res.json().catch(() => ({}))) as { data?: unknown; errors?: Array<{ message?: string }> };
            if (!res.ok || json.errors?.length) {
                throw new Error(json.errors?.[0]?.message || `Railway API returned ${res.status}.`);
            }
        };
        try {
            await attempt({ Authorization: `Bearer ${token}` });
        } catch (first) {
            try {
                await attempt({ "Project-Access-Token": token });
            } catch {
                this.log.warn(`railway redeploy failed: ${first instanceof Error ? first.message : String(first)}`);
                throw new BadRequestException(
                    `Railway rejected the redeploy: ${first instanceof Error ? first.message : "unknown error"}. Check that the token is valid and has access to this project.`,
                );
            }
        }
    }

    private async renderRedeploy(hookUrl: string): Promise<void> {
        const res = await fetch(hookUrl, { method: "POST", signal: AbortSignal.timeout(15000) }).catch((e: unknown) => {
            throw new BadRequestException(`Couldn't reach the Render deploy hook: ${e instanceof Error ? e.message : "network error"}.`);
        });
        if (!res.ok) throw new BadRequestException(`Render deploy hook returned ${res.status}. Re-create the hook in Render and save the new URL.`);
    }
}
