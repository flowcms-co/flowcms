import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../../auth/decorators";
import { ScimGuard } from "./scim.guard";
import { ScimService, type ScimUserBody } from "./scim.service";

const wsOf = (req: Request) => (req as Request & { scimWorkspaceId?: string }).scimWorkspaceId ?? "";

/**
 * SCIM 2.0 Users API for IdP-driven provisioning. @Public() (the session guard is
 * skipped) but every route is authed + gated by ScimGuard (Bearer SCIM token +
 * `scim` license). Reads the token's workspace from the request.
 */
@Public()
@UseGuards(ScimGuard)
@Controller("scim/v2")
export class ScimController {
    constructor(private readonly scim: ScimService) {}

    @Get("ServiceProviderConfig")
    config() {
        return {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
            patch: { supported: true },
            filter: { supported: true, maxResults: 200 },
            bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
            changePassword: { supported: false },
            sort: { supported: false },
            etag: { supported: false },
            authenticationSchemes: [{ name: "OAuth Bearer Token", description: "Authentication via a SCIM bearer token.", type: "oauthbearertoken" }],
        };
    }

    @Get("Users")
    list(@Req() req: Request, @Query("filter") filter?: string) {
        return this.scim.listUsers(wsOf(req), filter);
    }

    @Get("Users/:id")
    get(@Req() req: Request, @Param("id") id: string) {
        return this.scim.getUser(wsOf(req), id);
    }

    @Post("Users")
    @HttpCode(201)
    create(@Req() req: Request, @Body() body: ScimUserBody) {
        return this.scim.createUser(wsOf(req), body);
    }

    @Put("Users/:id")
    replace(@Req() req: Request, @Param("id") id: string, @Body() body: ScimUserBody) {
        return this.scim.replaceUser(wsOf(req), id, body);
    }

    @Patch("Users/:id")
    patch(@Req() req: Request, @Param("id") id: string, @Body() body: ScimUserBody) {
        return this.scim.patchUser(wsOf(req), id, body);
    }

    @Delete("Users/:id")
    @HttpCode(204)
    async remove(@Req() req: Request, @Param("id") id: string) {
        await this.scim.deactivate(wsOf(req), id);
    }
}
