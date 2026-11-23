import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ContentRules } from "@flowcms/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { LicenseService } from "../../license/license.service";
import type { ContentRulesPort } from "../../content/content-rules.port";
import { rulesOf } from "../../content/entry-validation";

/**
 * EE (Enterprise) — content rules and publishing guardrails. Implements the core
 * ContentRulesPort: the content engine asks it for a type's rules at every save, publish,
 * schedule, approve, tidy and scheduled go-live. No-op (returns no rules) unless licensed
 * for `content_rules`, so an unlicensed or lapsed install is never blocked.
 */
@Injectable()
export class ContentRulesService implements ContentRulesPort {
    constructor(
        private readonly license: LicenseService,
        private readonly prisma: PrismaService,
    ) {}

    async rulesFor(schema: unknown): Promise<ContentRules | null> {
        const rules = rulesOf(schema);
        if (!rules) return null;
        return (await this.license.has("content_rules")) ? rules : null;
    }

    async assertCanEdit(): Promise<void> {
        if (!(await this.license.has("content_rules"))) {
            throw new ForbiddenException('Content rules require a Flow CMS plan that includes them ("content_rules"). See Settings → License.');
        }
    }

    /** Every content type that carries rules, with the guide link its rule set shows to editors. */
    async listGuides(workspaceId: string) {
        const types = await this.prisma.contentType.findMany({ where: { workspaceId, kind: { not: "COMPONENT" } }, select: { id: true, name: true, apiId: true, schema: true }, orderBy: { name: "asc" } });
        return types
            .map((t) => ({ id: t.id, name: t.name, apiId: t.apiId, rules: rulesOf(t.schema) }))
            .filter((t) => t.rules)
            .map((t) => ({ id: t.id, name: t.name, apiId: t.apiId, guide: t.rules!.guide?.url ? { label: t.rules!.guide.label ?? "", url: t.rules!.guide.url } : null }));
    }

    /** Set (or, with an empty url, clear) the guide link on one type's rule set, or on every type that has rules. */
    async setGuide(workspaceId: string, dto: { url: string; label?: string; typeId?: string }) {
        const url = dto.url.trim();
        if (url) {
            let ok = false;
            try {
                ok = new URL(url).protocol === "https:";
            } catch {
                ok = false;
            }
            if (!ok) throw new BadRequestException("The guide link must be a full https:// address.");
        }
        const label = dto.label?.trim() || undefined;
        const types = await this.prisma.contentType.findMany({ where: { workspaceId, kind: { not: "COMPONENT" }, ...(dto.typeId ? { id: dto.typeId } : {}) }, select: { id: true, schema: true } });
        const targets = types.filter((t) => rulesOf(t.schema));
        if (dto.typeId && !targets.length) throw new NotFoundException("That content type has no content rules.");
        for (const t of targets) {
            const schema = t.schema as { contentRules: ContentRules };
            const { guide: _old, ...rest } = schema.contentRules;
            void _old;
            const contentRules: ContentRules = url ? { ...rest, guide: { ...(label ? { label } : {}), url } } : rest;
            await this.prisma.contentType.update({ where: { id: t.id }, data: { schema: { ...schema, contentRules } as never } });
        }
        return { updated: targets.length };
    }
}
