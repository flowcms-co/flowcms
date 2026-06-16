import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** One field→DOM binding. `fieldPath` is the dot/array path that also serves as
 *  the content-model field key (e.g. "heroBanner.title"). `mode` says how to
 *  read/write the matched element. */
export type Binding = {
    fieldPath: string;
    selector: string;
    mode: "text" | "rich" | "attr:src" | "attr:alt" | "attr:href" | "style:bg";
    nth?: number;
};

const MODES = new Set(["text", "rich", "attr:src", "attr:alt", "attr:href", "style:bg"]);

/** Validate + normalize an incoming bindings array. Keeps only well-formed rows
 *  so a malformed map can never reach the bridge. */
function sanitizeBindings(input: unknown): Binding[] {
    if (!Array.isArray(input)) throw new BadRequestException("bindings must be an array.");
    const out: Binding[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== "object") continue;
        const b = raw as Record<string, unknown>;
        const fieldPath = typeof b.fieldPath === "string" ? b.fieldPath.trim() : "";
        const selector = typeof b.selector === "string" ? b.selector.trim() : "";
        const mode = typeof b.mode === "string" && MODES.has(b.mode) ? (b.mode as Binding["mode"]) : "text";
        if (!fieldPath || !selector) continue;
        const binding: Binding = { fieldPath, selector, mode };
        if (typeof b.nth === "number" && Number.isInteger(b.nth) && b.nth >= 0) binding.nth = b.nth;
        out.push(binding);
    }
    return out;
}

/** Turn a urlPattern with `:param` tokens into a matcher. Exact strings match
 *  literally; `""` is the type-wide default (lowest priority). */
function patternScore(pattern: string, url: string): number {
    if (pattern === "") return 1; // default fallback
    if (pattern === url) return 100; // exact path wins
    const re = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:\w+/g, "[^/]+") + "/?$");
    return re.test(url) ? 50 : 0;
}

@Injectable()
export class SelectorMapsService {
    constructor(private readonly prisma: PrismaService) {}

    /** Ensure the content type belongs to this workspace (tenant guard). */
    private async assertType(workspaceId: string, contentTypeId: string) {
        const ct = await this.prisma.contentType.findFirst({ where: { id: contentTypeId, workspaceId }, select: { id: true } });
        if (!ct) throw new NotFoundException("Content type not found.");
    }

    /** All maps defined for a content type. */
    async list(workspaceId: string, contentTypeId: string) {
        await this.assertType(workspaceId, contentTypeId);
        return this.prisma.selectorMap.findMany({ where: { workspaceId, contentTypeId }, orderBy: { urlPattern: "asc" } });
    }

    /** The best map for a given preview URL: exact path > pattern > type default. */
    async resolve(workspaceId: string, contentTypeId: string, url: string) {
        await this.assertType(workspaceId, contentTypeId);
        const maps = await this.prisma.selectorMap.findMany({ where: { workspaceId, contentTypeId } });
        let best: (typeof maps)[number] | null = null;
        let bestScore = 0;
        for (const m of maps) {
            const s = patternScore(m.urlPattern, url || "");
            if (s > bestScore) { best = m; bestScore = s; }
        }
        return best ?? { contentTypeId, urlPattern: "", bindings: [] as Binding[] };
    }

    /** Create or replace the map for (contentType, urlPattern). */
    async upsert(workspaceId: string, contentTypeId: string, urlPattern: string, bindings: unknown) {
        await this.assertType(workspaceId, contentTypeId);
        const clean = sanitizeBindings(bindings);
        const pattern = (urlPattern ?? "").trim();
        return this.prisma.selectorMap.upsert({
            where: { contentTypeId_urlPattern: { contentTypeId, urlPattern: pattern } },
            create: { workspaceId, contentTypeId, urlPattern: pattern, bindings: clean as object },
            update: { bindings: clean as object },
        });
    }

    async remove(workspaceId: string, id: string) {
        const existing = await this.prisma.selectorMap.findFirst({ where: { id, workspaceId }, select: { id: true } });
        if (!existing) throw new NotFoundException("Selector map not found.");
        await this.prisma.selectorMap.delete({ where: { id } });
        return { ok: true };
    }
}
