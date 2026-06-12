import { Controller, Get, Param } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { JobsService } from "./jobs.service";

/** The current user's background jobs (active + recent), for the toast tracker. */
@Controller("jobs")
export class JobsController {
    constructor(private readonly jobs: JobsService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.jobs.list(user.workspaceId, user.id);
    }

    @Get(":id")
    get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.jobs.get(user.workspaceId, id);
    }
}
