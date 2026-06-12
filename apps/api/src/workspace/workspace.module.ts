import { Module } from "@nestjs/common";
import { WorkspaceController } from "./workspace.controller";
import { WorkspacesController } from "./workspaces.controller";

@Module({
    controllers: [WorkspaceController, WorkspacesController],
})
export class WorkspaceModule {}
