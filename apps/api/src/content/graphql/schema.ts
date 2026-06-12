import {
    GraphQLBoolean,
    GraphQLFloat,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLSchema,
    GraphQLString,
    Kind,
    type GraphQLFieldConfig,
    type ValueNode,
} from "graphql";
import type { PublicQueryService, QueryOpts } from "../public-query.service";
import type { SchemaField } from "../entry-validation";

/** GraphQL execution context attached per request. */
export type GqlContext = { query: PublicQueryService; workspaceId: string; preview: boolean };

/** Minimal JSON scalar (arbitrary nested values) for the flattened `data` field + filters. */
function parseLiteral(ast: ValueNode): unknown {
    switch (ast.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
            return ast.value;
        case Kind.INT:
        case Kind.FLOAT:
            return Number(ast.value);
        case Kind.NULL:
            return null;
        case Kind.LIST:
            return ast.values.map(parseLiteral);
        case Kind.OBJECT:
            return Object.fromEntries(ast.fields.map((f) => [f.name.value, parseLiteral(f.value)]));
        default:
            return null;
    }
}

const JSONScalar = new GraphQLScalarType({
    name: "JSON",
    description: "Arbitrary JSON value.",
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral,
});

const META = new Set(["id", "slug", "locale", "publishedAt", "createdAt", "updatedAt"]);
type Shaped = Record<string, unknown> | null;
const dataOf = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !META.has(k)));
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

const EntryType = new GraphQLObjectType<Record<string, unknown>>({
    name: "Entry",
    fields: {
        id: { type: GraphQLString },
        slug: { type: GraphQLString },
        locale: { type: GraphQLString },
        publishedAt: { type: GraphQLString, resolve: (o) => iso(o.publishedAt) },
        createdAt: { type: GraphQLString, resolve: (o) => iso(o.createdAt) },
        updatedAt: { type: GraphQLString, resolve: (o) => iso(o.updatedAt) },
        data: { type: JSONScalar, resolve: (o) => dataOf(o) },
    },
});

const commonArgs = {
    locale: { type: GraphQLString },
    fields: { type: new GraphQLList(GraphQLString) },
};

const optsFrom = (args: Record<string, unknown>, ctx: GqlContext): QueryOpts => ({
    limit: args.limit as number | undefined,
    offset: args.offset as number | undefined,
    sort: args.sort as string | undefined,
    locale: args.locale as string | undefined,
    fields: args.fields as string[] | undefined,
    filters: (args.filters as Record<string, string> | undefined) ?? {},
    preview: ctx.preview,
});

/** The generic, content-type-agnostic queries (entries/entry/single). Shared by
 *  both the plain schema and the per-type typed schema. */
function genericQueryFields(): Record<string, GraphQLFieldConfig<unknown, GqlContext>> {
    return {
            entries: {
                type: new GraphQLList(EntryType),
                args: {
                    type: { type: new GraphQLNonNull(GraphQLString) },
                    limit: { type: GraphQLInt },
                    offset: { type: GraphQLInt },
                    sort: { type: GraphQLString },
                    filters: { type: JSONScalar },
                    ...commonArgs,
                },
                resolve: async (_root, args, ctx: GqlContext) => {
                    const ct = await ctx.query.resolveType(ctx.workspaceId, args.type);
                    const opts = optsFrom(args, ctx);
                    if (ct.kind === "SINGLE") {
                        const r = await ctx.query.singleForType(ct, opts);
                        return r.data ? [r.data] : [];
                    }
                    const r = await ctx.query.listForType(ct, opts);
                    return r.data;
                },
            },
            entry: {
                type: EntryType,
                args: { type: { type: new GraphQLNonNull(GraphQLString) }, idOrSlug: { type: new GraphQLNonNull(GraphQLString) }, ...commonArgs },
                resolve: async (_root, args, ctx: GqlContext): Promise<Shaped> => {
                    const r = await ctx.query.one(ctx.workspaceId, args.type, args.idOrSlug, optsFrom(args, ctx));
                    return r.data as Shaped;
                },
            },
            single: {
                type: EntryType,
                args: { type: { type: new GraphQLNonNull(GraphQLString) }, ...commonArgs },
                resolve: async (_root, args, ctx: GqlContext): Promise<Shaped> => {
                    const ct = await ctx.query.resolveType(ctx.workspaceId, args.type);
                    const r = await ctx.query.singleForType(ct, optsFrom(args, ctx));
                    return r.data as Shaped;
                },
            },
    };
}

/** Build the (workspace-agnostic) public GraphQL schema. `type` selects the content type. */
export function buildPublicSchema(): GraphQLSchema {
    return new GraphQLSchema({ query: new GraphQLObjectType({ name: "Query", fields: genericQueryFields() }) });
}

// ── Per-type typed schema ─────────────────────────────────────────────────────
// Generates a GraphQL object type per content type (typed fields from the Schema
// Builder) plus typed queries (`articles`/`article(idOrSlug)`, single-types as
// `homepage`), on top of the generic entries/entry/single (kept for back-compat).

export type TypeDef = { apiId: string; pluralApiId: string; kind: string; fields: SchemaField[] };

/** Candidate data keys for a field name (mirrors entry-validation's leniency). */
function candidateKeys(name: string): string[] {
    const lower = name.trim().toLowerCase();
    const parts = lower.split(/\s+/);
    const camel = parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");
    return [...new Set([name, camel, lower, parts.join("_"), parts[0]])];
}
const fieldValue = (o: Record<string, unknown>, name: string) => {
    for (const k of candidateKeys(name)) if (k in o && o[k] != null && o[k] !== "") return o[k];
    return null;
};
const pascal = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("") || "Type";
const camelize = (s: string) => {
    const p = pascal(s);
    return p.charAt(0).toLowerCase() + p.slice(1);
};
const gqlIdent = (s: string) => {
    const c = camelize(s);
    return /^[_A-Za-z]/.test(c) ? c : `f_${c}`;
};
const gqlTypeFor = (t: string) =>
    t === "Number" ? GraphQLFloat : t === "Boolean" ? GraphQLBoolean : GraphQLString;

export function buildTypedSchema(types: TypeDef[]): GraphQLSchema {
    const fields: Record<string, GraphQLFieldConfig<unknown, GqlContext>> = {};
    const usedTypeNames = new Set<string>(["Entry", "Query", "JSON"]);
    const usedQueryNames = new Set<string>(["entries", "entry", "single"]);

    for (const t of types) {
        let typeName = pascal(t.apiId);
        while (usedTypeNames.has(typeName)) typeName += "_";
        usedTypeNames.add(typeName);

        const objFields: Record<string, GraphQLFieldConfig<Record<string, unknown>, GqlContext>> = {
            id: { type: GraphQLString },
            slug: { type: GraphQLString },
            locale: { type: GraphQLString },
            publishedAt: { type: GraphQLString, resolve: (o) => iso(o.publishedAt) },
            createdAt: { type: GraphQLString, resolve: (o) => iso(o.createdAt) },
            updatedAt: { type: GraphQLString, resolve: (o) => iso(o.updatedAt) },
            data: { type: JSONScalar, resolve: (o) => dataOf(o) },
        };
        const seen = new Set(Object.keys(objFields));
        for (const f of t.fields) {
            if (!f?.name || !f.type || f.type === "Slug") continue;
            let key = gqlIdent(f.name);
            while (seen.has(key)) key += "_";
            seen.add(key);
            objFields[key] = {
                type: gqlTypeFor(f.type),
                resolve: (o) => {
                    const v = fieldValue(o, f.name);
                    return f.type === "Number" ? (v == null ? null : Number(v)) : f.type === "Boolean" ? Boolean(v) : v == null ? null : String(v);
                },
            };
        }
        const ObjType = new GraphQLObjectType<Record<string, unknown>>({ name: typeName, fields: objFields });

        if (t.kind === "SINGLE") {
            let qn = camelize(t.apiId);
            while (usedQueryNames.has(qn)) qn += "_";
            usedQueryNames.add(qn);
            fields[qn] = {
                type: ObjType,
                args: { ...commonArgs },
                resolve: async (_r, args, ctx: GqlContext): Promise<Shaped> => {
                    const ct = await ctx.query.resolveType(ctx.workspaceId, t.apiId);
                    const r = await ctx.query.singleForType(ct, optsFrom(args, ctx));
                    return r.data as Shaped;
                },
            };
            continue;
        }

        // Collection: plural list + singular by id/slug.
        let plural = camelize(t.pluralApiId);
        while (usedQueryNames.has(plural)) plural += "_";
        usedQueryNames.add(plural);
        let singular = camelize(t.apiId);
        while (usedQueryNames.has(singular)) singular += "_";
        usedQueryNames.add(singular);

        fields[plural] = {
            type: new GraphQLList(ObjType),
            args: { limit: { type: GraphQLInt }, offset: { type: GraphQLInt }, sort: { type: GraphQLString }, filters: { type: JSONScalar }, ...commonArgs },
            resolve: async (_r, args, ctx: GqlContext) => {
                const ct = await ctx.query.resolveType(ctx.workspaceId, t.apiId);
                const r = await ctx.query.listForType(ct, optsFrom(args, ctx));
                return r.data;
            },
        };
        fields[singular] = {
            type: ObjType,
            args: { idOrSlug: { type: new GraphQLNonNull(GraphQLString) }, ...commonArgs },
            resolve: async (_r, args, ctx: GqlContext): Promise<Shaped> => {
                const r = await ctx.query.one(ctx.workspaceId, t.apiId, args.idOrSlug as string, optsFrom(args, ctx));
                return r.data as Shaped;
            },
        };
    }

    // Compose with the generic queries (entries/entry/single) for back-compat.
    for (const [k, f] of Object.entries(genericQueryFields())) {
        if (!fields[k]) fields[k] = f;
    }

    return new GraphQLSchema({ query: new GraphQLObjectType({ name: "Query", fields }) });
}
