import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { IsInt, IsObject, IsOptional, Min } from "class-validator";
import type { ContentType } from "@flowcms/db";
import { Public } from "../auth/decorators";
import { AuditService } from "../audit/audit.service";
import { AgentTokenGuard } from "./agent-token.guard";
import { tokenScopeAllows } from "./agent-scope";
import { ContentTypesService } from "./content-types.service";
import { CreateContentTypeDto, UpdateContentTypeDto } from "./dto";
import { destructiveChanges, routingChanges, type DestructiveChange } from "./model-diff";
import { toCamelCase } from "./naming";

type TokenReq = Request & { apiToken: { id: string; name: string; workspaceId: string; scopes?: unknown } };
type Field = { id?: string; name?: string; type?: string; [k: string]: unknown };
type Schema = { fields?: Field[]; [k: string]: unknown };
type Row = ContentType & { _count: { entries: number } };

const READ = ["model.read", "model.update", "model.delete"];

function requireScope(req: TokenReq, scope: string) {
    if (!tokenScopeAllows(req.apiToken.scopes, scope)) throw new ForbiddenException(`This token is not authorized for '${scope}'.`);
}

/** `types` or `components`: the two halves of the model, as in the Schema Builder. */
function isComponent(group: string): boolean {
    if (group === "types") return false;
    if (group === "components") return true;
    throw new NotFoundException(`Unknown model group "${group}". Use "types" or "components".`);
}

const flag = (v?: string) => v === "true" || v === "1";

class AddFieldDto {
    /** The field as Studio stores it: { name, type, required?, repeatable?, fields?, componentApiId?, validation?, ... }. */
    @IsObject() field!: Field;
    /** Index to insert at; appended when omitted. */
    @IsOptional() @IsInt() @Min(0) position?: number;
}

class EditFieldDto {
    /** Properties to merge into the field (its id can't change). */
    @IsObject() changes!: Field;
}

/**
 * The content model for agent tokens (`/api/agent/model/...`). Opt-in scopes:
 * model.read, model.update (add and edit fields, create types) and model.delete
 * (anything that drops data or moves pages). Every write goes through the same
 * ContentTypesService calls Studio's Schema Builder uses, so validation, key
 * remapping and entry migration are shared. Writes take `?dryRun=true`; a change
 * that drops or converts stored data also needs `?confirm=true`.
 *
 * Registered before AgentController, whose `:type/:id` would otherwise take /agent/model/types.
 */
@Controller("agent/model")
@Public()
@UseGuards(AgentTokenGuard)
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class AgentModelController {
    constructor(
        private readonly types: ContentTypesService,
        private readonly audit: AuditService,
    ) {}

    private requireRead(req: TokenReq) {
        if (!READ.some((s) => tokenScopeAllows(req.apiToken.scopes, s))) requireScope(req, "model.read");
    }

    @Get(":group")
    list(@Req() req: TokenReq, @Param("group") group: string) {
        this.requireRead(req);
        const ws = req.apiToken.workspaceId;
        return isComponent(group) ? this.types.listComponents(ws) : this.types.list(ws);
    }

    @Get(":group/:ref")
    async get(@Req() req: TokenReq, @Param("group") group: string, @Param("ref") ref: string) {
        this.requireRead(req);
        return this.types.shape(await this.types.findByRef(req.apiToken.workspaceId, ref, isComponent(group)));
    }

    @Post(":group")
    async create(@Req() req: TokenReq, @Param("group") group: string, @Body() dto: CreateContentTypeDto, @Query("dryRun") dryRun?: string) {
        requireScope(req, "model.update");
        const component = isComponent(group);
        if (!component && dto.kind === "COMPONENT") throw new BadRequestException('Create components under /agent/model/components.');
        const body = { ...dto, kind: component ? ("COMPONENT" as const) : dto.kind };
        if (flag(dryRun)) return { dryRun: true, name: body.name, kind: body.kind ?? "COLLECTION", schema: body.schema };
        const t = await this.types.create(req.apiToken.workspaceId, body);
        this.audit.record({ workspaceId: req.apiToken.workspaceId, action: "model.create", resource: "ContentType", resourceId: t.id, title: t.name, entryType: t.apiId, metadata: { via: "agent" } });
        return t;
    }

    /** Edit a type: name, apiId (while empty), draftAndPublish, and schema keys.
     *  Schema keys you send replace the stored ones; `fields` replaces the whole list. */
    @Patch(":group/:ref")
    async update(@Req() req: TokenReq, @Param("group") group: string, @Param("ref") ref: string, @Body() dto: UpdateContentTypeDto, @Query("dryRun") dryRun?: string, @Query("confirm") confirm?: string) {
        requireScope(req, "model.update");
        const row = await this.types.findByRef(req.apiToken.workspaceId, ref, isComponent(group));
        const schema = dto.schema ? { ...this.stored(row), ...dto.schema } : undefined;
        return this.apply(req, row, { name: dto.name, apiId: dto.apiId, draftAndPublish: dto.draftAndPublish, schema }, "update", { dryRun, confirm });
    }

    @Post(":group/:ref/fields")
    async addField(@Req() req: TokenReq, @Param("group") group: string, @Param("ref") ref: string, @Body() dto: AddFieldDto, @Query("dryRun") dryRun?: string) {
        requireScope(req, "model.update");
        const row = await this.types.findByRef(req.apiToken.workspaceId, ref, isComponent(group));
        const { name, type } = dto.field;
        if (typeof name !== "string" || !name.trim() || typeof type !== "string" || !type.trim()) throw new BadRequestException("A field needs a name and a type.");
        const schema = this.stored(row);
        const fields = [...(schema.fields ?? [])];
        // Studio would quietly rename a clash to "name2"; an automation should hear about it instead.
        if (fields.some((f) => toCamelCase(String(f.name ?? "")) === toCamelCase(name))) throw new ConflictException(`A field named "${toCamelCase(name)}" already exists on ${row.apiId}.`);
        fields.splice(dto.position ?? fields.length, 0, { ...dto.field, id: dto.field.id ?? `nf-${randomUUID()}` });
        return this.apply(req, row, { schema: { ...schema, fields } }, "field.add", { dryRun }, toCamelCase(name));
    }

    @Patch(":group/:ref/fields/:field")
    async editField(@Req() req: TokenReq, @Param("group") group: string, @Param("ref") ref: string, @Param("field") field: string, @Body() dto: EditFieldDto, @Query("dryRun") dryRun?: string, @Query("confirm") confirm?: string) {
        requireScope(req, "model.update");
        const row = await this.types.findByRef(req.apiToken.workspaceId, ref, isComponent(group));
        const schema = this.stored(row);
        const i = this.fieldIndex(schema, field, row);
        const fields = [...(schema.fields ?? [])];
        fields[i] = { ...fields[i], ...dto.changes, id: fields[i].id };
        return this.apply(req, row, { schema: { ...schema, fields } }, "field.update", { dryRun, confirm }, String(fields[i].name));
    }

    @Delete(":group/:ref/fields/:field")
    async removeField(@Req() req: TokenReq, @Param("group") group: string, @Param("ref") ref: string, @Param("field") field: string, @Query("dryRun") dryRun?: string, @Query("confirm") confirm?: string) {
        requireScope(req, "model.update");
        const row = await this.types.findByRef(req.apiToken.workspaceId, ref, isComponent(group));
        const schema = this.stored(row);
        const i = this.fieldIndex(schema, field, row);
        const fields = (schema.fields ?? []).filter((_, j) => j !== i);
        return this.apply(req, row, { schema: { ...schema, fields } }, "field.remove", { dryRun, confirm }, String(schema.fields?.[i]?.name));
    }

    @Delete(":group/:ref")
    async remove(@Req() req: TokenReq, @Param("group") group: string, @Param("ref") ref: string, @Query("dryRun") dryRun?: string, @Query("confirm") confirm?: string) {
        requireScope(req, "model.delete");
        const component = isComponent(group);
        const row = await this.types.findByRef(req.apiToken.workspaceId, ref, component);
        const impact = component
            ? { usedBy: await this.types.componentReferences(req.apiToken.workspaceId, row.apiId) }
            : { entriesDeleted: row._count.entries };
        if (flag(dryRun)) return { dryRun: true, apiId: row.apiId, ...impact };
        if (!flag(confirm)) throw new ConflictException({ code: "CONFIRM_REQUIRED", message: `Deleting ${row.apiId} can't be undone. Repeat with ?confirm=true.`, apiId: row.apiId, ...impact });
        const r = await this.types.remove(req.apiToken.workspaceId, row.id);
        this.audit.record({ workspaceId: req.apiToken.workspaceId, action: "model.delete", resource: "ContentType", resourceId: row.id, title: row.name, entryType: row.apiId, metadata: { via: "agent", ...impact } });
        return r;
    }

    private stored(row: Row): Schema {
        return (row.schema ?? {}) as Schema;
    }

    private fieldIndex(schema: Schema, ref: string, row: Row): number {
        const i = (schema.fields ?? []).findIndex((f) => f.id === ref || f.name === ref);
        if (i < 0) throw new NotFoundException(`No field "${ref}" on ${row.apiId}.`);
        return i;
    }

    /** One gate for every write: classify the change, check scopes and confirm,
     *  then save through ContentTypesService.update (Studio's own path). */
    private async apply(
        req: TokenReq,
        row: Row,
        change: { name?: string; apiId?: string; draftAndPublish?: boolean; schema?: Schema },
        op: string,
        q: { dryRun?: string; confirm?: string },
        field?: string,
    ) {
        const before = this.stored(row);
        const destructive: DestructiveChange[] = change.schema ? destructiveChanges(before.fields as never, change.schema.fields as never) : [];
        const routing = change.schema ? routingChanges(before, change.schema) : [];
        if (change.apiId?.trim() && change.apiId.trim() !== row.apiId) routing.push("apiId");
        if (destructive.length || routing.length) requireScope(req, "model.delete");

        let impact: Record<string, unknown> = {};
        if (destructive.length) {
            impact =
                row.kind === "COMPONENT"
                    ? { usedBy: await this.types.componentReferences(req.apiToken.workspaceId, row.apiId) }
                    : { entriesWithValue: await this.types.entriesWithValue(row.id, destructive.map((d) => d.field.split(".")[0])) };
        }
        const summary = { destructive, routing, ...impact };
        if (flag(q.dryRun)) {
            return { dryRun: true, ...summary, type: this.types.shape({ ...row, name: change.name ?? row.name, schema: (change.schema ?? before) as never }) };
        }
        if (destructive.length && !flag(q.confirm)) {
            throw new ConflictException({ code: "CONFIRM_REQUIRED", message: "This change drops or converts stored values. Check the summary, then repeat with ?confirm=true.", ...summary });
        }
        const t = await this.types.update(req.apiToken.workspaceId, row.id, { ...change, acknowledgeDataLoss: destructive.length > 0 });
        this.audit.record({
            workspaceId: req.apiToken.workspaceId,
            action: "model.update",
            resource: "ContentType",
            resourceId: row.id,
            title: t.name,
            entryType: t.apiId,
            metadata: { via: "agent", op, ...(field ? { field } : {}), ...(destructive.length ? { destructive } : {}), ...(routing.length ? { routing } : {}) },
        });
        return t;
    }
}
