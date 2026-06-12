import { BadRequestException, Body, Controller, Put, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { PrismaService } from "../../prisma/prisma.service";

class WhiteLabelDto {
    @IsOptional() @IsString() @MaxLength(60) brandName?: string;
    @IsOptional() @IsString() @MaxLength(2048) brandLogoUrl?: string;
    @IsOptional() @IsString() @MaxLength(9) brandAccent?: string;
}

const norm = (v?: string) => (v ?? "").trim() || null;

/**
 * EE (Enterprise) — white-label branding. Sets the active workspace's studio brand
 * (name / logo / accent). The columns live on the core Workspace model and are
 * READ by everyone (the studio renders them only when licensed); WRITING is gated
 * here by `white_label` (Community/Pro → 403). Each save sends all three fields;
 * an empty value clears that part of the brand.
 */
@Controller("ee/white-label")
@UseGuards(FeatureGuard)
@RequireFeature("white_label")
export class WhiteLabelController {
    constructor(private readonly prisma: PrismaService) {}

    @Put()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async set(@CurrentUser() user: AuthUser, @Body() dto: WhiteLabelDto) {
        let accent = norm(dto.brandAccent);
        if (accent) {
            if (!accent.startsWith("#")) accent = `#${accent}`;
            if (!/^#[0-9a-fA-F]{6}$/.test(accent)) {
                throw new BadRequestException("Accent must be a 6-digit hex color, e.g. #0EA5E9.");
            }
        }
        const w = await this.prisma.workspace.update({
            where: { id: user.workspaceId },
            data: { brandName: norm(dto.brandName), brandLogoUrl: norm(dto.brandLogoUrl), brandAccent: accent },
        });
        return { brandName: w.brandName, brandLogoUrl: w.brandLogoUrl, brandAccent: w.brandAccent };
    }
}
