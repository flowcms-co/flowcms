import { Body, Controller, Get, Header, NotFoundException, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
    execute as gqlExecute,
    parse,
    validate,
    specifiedRules,
    NoSchemaIntrospectionCustomRule,
    GraphQLError,
    Kind,
    type ASTNode,
    type FragmentDefinitionNode,
    type GraphQLSchema,
    type ValidationRule,
} from "graphql";
import { Public } from "../../auth/decorators";
import { fieldsOf } from "../entry-validation";
import { ApiTokenGuard } from "../api-token.guard";
import { PublicQueryService } from "../public-query.service";
import { buildTypedSchema, type GqlContext, type TypeDef } from "./schema";

type TokenReq = Request & { apiToken: { workspaceId: string; type: string } };
type GqlBody = { query?: string; variables?: Record<string, unknown>; operationName?: string };

const MAX_QUERY_DEPTH = 12;

/**
 * Reject queries nested deeper than `max`. The typed schema lets relations
 * expand, so without a cap a single token-authed query could recurse into an
 * arbitrarily deep / expensive shape (authenticated DoS). Fragment spreads are
 * followed once to measure their real depth.
 */
export function depthLimitRule(max: number): ValidationRule {
    return (context) => {
        const fragments: Record<string, FragmentDefinitionNode> = {};
        for (const def of context.getDocument().definitions) {
            if (def.kind === Kind.FRAGMENT_DEFINITION) fragments[def.name.value] = def;
        }
        const depth = (node: ASTNode, seen: Set<string>): number => {
            const selectionSet = "selectionSet" in node ? node.selectionSet : undefined;
            if (!selectionSet) return 0;
            let deepest = 0;
            for (const sel of selectionSet.selections) {
                if (sel.kind === Kind.FIELD) {
                    deepest = Math.max(deepest, 1 + depth(sel, seen));
                } else if (sel.kind === Kind.INLINE_FRAGMENT) {
                    deepest = Math.max(deepest, depth(sel, seen));
                } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
                    const frag = fragments[sel.name.value];
                    if (frag && !seen.has(sel.name.value)) {
                        seen.add(sel.name.value);
                        deepest = Math.max(deepest, depth(frag, seen));
                    }
                }
            }
            return deepest;
        };
        return {
            OperationDefinition(node) {
                const d = depth(node, new Set());
                if (d > max) {
                    context.reportError(
                        new GraphQLError(`Query is too deep: ${d} exceeds the maximum depth of ${max}.`, { nodes: [node] }),
                    );
                }
            },
        };
    };
}

/**
 * GraphQL delivery endpoint. POST /graphql runs queries against a PER-WORKSPACE
 * typed schema (an object type + typed queries per content type, on top of the
 * generic entries/entry/single), token-authed with the same Bearer token as REST.
 * Schemas are cached per workspace with a short TTL so new/edited content types
 * surface quickly without per-request rebuild cost.
 */
@Controller("graphql")
@Public() // skip the session guard; POST enforces the API-token guard below
@Throttle({ default: { limit: 600, ttl: 60_000 } }) // per-token delivery headroom
export class GraphqlController {
    private readonly cache = new Map<string, { schema: GraphQLSchema; at: number }>();
    private readonly TTL = 30_000;

    constructor(private readonly query: PublicQueryService) {}

    private async schemaFor(workspaceId: string): Promise<GraphQLSchema> {
        const hit = this.cache.get(workspaceId);
        if (hit && Date.now() - hit.at < this.TTL) return hit.schema;
        const types = await this.query.allTypes(workspaceId);
        const defs: TypeDef[] = types.map((t) => ({ apiId: t.apiId, pluralApiId: t.pluralApiId, kind: t.kind, fields: fieldsOf(t.schema) }));
        const schema = buildTypedSchema(defs);
        this.cache.set(workspaceId, { schema, at: Date.now() });
        return schema;
    }

    @Post()
    @UseGuards(ApiTokenGuard)
    async execute(@Req() req: TokenReq, @Body() body: GqlBody) {
        const token = req.apiToken;
        const context: GqlContext = {
            query: this.query,
            workspaceId: token.workspaceId,
            preview: token.type === "PREVIEW" || token.type === "ADMIN",
        };
        const schema = await this.schemaFor(token.workspaceId);

        // Parse + validate ourselves so we can add a depth limit and, in
        // production, disable schema introspection (don't advertise the full
        // per-workspace schema to any token holder).
        let document;
        try {
            document = parse(body.query ?? "");
        } catch (e) {
            return { errors: [e instanceof GraphQLError ? e : new GraphQLError(String(e))] };
        }
        const rules: ValidationRule[] = [...specifiedRules, depthLimitRule(MAX_QUERY_DEPTH)];
        if (process.env.NODE_ENV === "production") rules.push(NoSchemaIntrospectionCustomRule);
        const validationErrors = validate(schema, document, rules);
        if (validationErrors.length) return { errors: validationErrors };

        return gqlExecute({
            schema,
            document,
            variableValues: body.variables,
            operationName: body.operationName,
            contextValue: context,
        });
    }

    @Get()
    @Header("Content-Type", "text/html; charset=utf-8")
    playground(): string {
        // The browser playground is a dev convenience; don't serve it (or the
        // schema it implies) in production.
        if (process.env.NODE_ENV === "production") throw new NotFoundException();
        return PLAYGROUND_HTML;
    }
}

/** Minimal dependency-free GraphQL playground (token field + query box + result). */
const PLAYGROUND_HTML = `<!doctype html><html><head><meta charset="utf-8"/><title>Flow CMS · GraphQL</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
:root{--p:#6C5CE7}*{box-sizing:border-box}body{margin:0;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f0f1a;color:#e7e7ef}
header{padding:14px 20px;background:#16162a;border-bottom:1px solid #26263e;display:flex;gap:12px;align-items:center}
header b{color:#fff}header b span{color:var(--p)}
input,textarea{width:100%;background:#0f0f1a;color:#e7e7ef;border:1px solid #2c2c44;border-radius:8px;padding:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.wrap{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px}
.col{display:flex;flex-direction:column;gap:10px}textarea{min-height:48vh;resize:vertical}
button{background:var(--p);color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer}
pre{background:#0f0f1a;border:1px solid #2c2c44;border-radius:8px;padding:12px;overflow:auto;min-height:48vh;margin:0;white-space:pre-wrap}
label{font-size:12px;color:#9a9ab8}
</style></head><body>
<header><b>flow<span>cms</span></b> · GraphQL delivery API</header>
<div class="wrap">
 <div class="col">
  <label>Authorization (Bearer API token)</label>
  <input id="tok" placeholder="flw_..."/>
  <label>Query</label>
  <textarea id="q">{
  entries(type: "article", limit: 5, sort: "publishedAt:desc") {
    id
    slug
    publishedAt
    data
  }
}</textarea>
  <button onclick="run()">Run ▶</button>
 </div>
 <div class="col"><label>Result</label><pre id="out">—</pre></div>
</div>
<script>
async function run(){
  const out=document.getElementById('out');out.textContent='Running…';
  try{
    const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+document.getElementById('tok').value.trim()},body:JSON.stringify({query:document.getElementById('q').value})});
    out.textContent=JSON.stringify(await r.json(),null,2);
  }catch(e){out.textContent=String(e)}
}
</script></body></html>`;
