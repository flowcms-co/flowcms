import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Integration } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ConnectIntegrationDto } from "./dto";
import { getProvider, PROVIDERS, testProvider } from "./providers";

/** Public shape of an integration (never includes the secret). */
function sanitize(i: Integration) {
    const provider = getProvider(i.provider);
    return {
        id: i.id,
        type: i.type,
        provider: i.provider,
        providerName: provider?.name ?? i.provider,
        label: i.label,
        config: i.config,
        status: i.status,
        hasSecret: !!i.encryptedSecret,
        lastCheckedAt: i.lastCheckedAt,
        updatedAt: i.updatedAt,
    };
}

@Injectable()
export class IntegrationsService {
    constructor(private readonly prisma: PrismaService) {}

    /** Catalog of providers the UI can offer (no secrets involved). */
    catalog() {
        return PROVIDERS.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            kind: p.kind,
            description: p.description,
            baseUrl: p.baseUrl ?? null,
            requiresBaseUrl: !!p.requiresBaseUrl,
            keyOptional: !!p.keyOptional,
            defaultModel: p.defaultModel ?? null,
            suggestedModels: p.suggestedModels ?? [],
            docs: p.docs ?? null,
        }));
    }

    async list(workspaceId: string) {
        const rows = await this.prisma.integration.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "asc" },
        });
        return rows.map(sanitize);
    }

    /** Connect (or re-connect) a provider: encrypt the key, test it, store status. */
    async connect(workspaceId: string, dto: ConnectIntegrationDto, userId: string) {
        const provider = getProvider(dto.provider);
        if (!provider) throw new BadRequestException(`Unknown provider: ${dto.provider}`);
        if (provider.requiresBaseUrl && !dto.baseUrl) {
            throw new BadRequestException(`${provider.name} needs a base URL.`);
        }
        if (!provider.keyOptional && !dto.apiKey) {
            throw new BadRequestException(`${provider.name} needs an API key.`);
        }

        const apiKey = dto.apiKey ?? "";
        const result = await testProvider(provider, apiKey, dto.baseUrl);
        const status = result.ok ? "CONNECTED" : "ERROR";
        const config = {
            baseUrl: dto.baseUrl ?? provider.baseUrl ?? null,
            defaultModel: dto.defaultModel ?? provider.defaultModel ?? null,
            ...(result.error ? { lastError: result.error } : {}),
        };

        const existing = await this.prisma.integration.findFirst({
            where: { workspaceId, provider: dto.provider },
        });

        const data = {
            type: provider.type,
            provider: dto.provider,
            label: dto.label || provider.name,
            config,
            encryptedSecret: apiKey ? encryptSecret(apiKey) : null,
            status: status as Integration["status"],
            lastCheckedAt: new Date(),
            createdById: userId,
        };

        const saved = existing
            ? await this.prisma.integration.update({ where: { id: existing.id }, data })
            : await this.prisma.integration.create({ data: { workspaceId, ...data } });

        return { integration: sanitize(saved), test: result };
    }

    /** Re-test an existing integration's stored key. */
    async test(workspaceId: string, id: string) {
        const integration = await this.prisma.integration.findFirst({ where: { id, workspaceId } });
        if (!integration) throw new NotFoundException("Integration not found.");
        const provider = getProvider(integration.provider);
        if (!provider) throw new BadRequestException("Unknown provider.");
        const config = (integration.config ?? {}) as { baseUrl?: string };
        const key = integration.encryptedSecret ? decryptSecret(integration.encryptedSecret) : "";
        const result = await testProvider(provider, key, config.baseUrl);
        const updated = await this.prisma.integration.update({
            where: { id },
            data: {
                status: result.ok ? "CONNECTED" : "ERROR",
                lastCheckedAt: new Date(),
                config: { ...config, ...(result.error ? { lastError: result.error } : { lastError: null }) },
            },
        });
        return { integration: sanitize(updated), test: result };
    }

    async remove(workspaceId: string, id: string) {
        const integration = await this.prisma.integration.findFirst({ where: { id, workspaceId } });
        if (!integration) throw new NotFoundException("Integration not found.");
        await this.prisma.integration.delete({ where: { id } });
        return { ok: true };
    }
}
