import { IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class CreateEntryDto {
    @IsString()
    contentTypeId!: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    slug?: string;

    @IsOptional()
    @IsString()
    locale?: string;

    @IsOptional()
    @IsObject()
    data?: Record<string, unknown>;
}

const EDITABLE_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "ARCHIVED"] as const;

export class UpdateEntryDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    slug?: string;

    @IsOptional()
    @IsObject()
    data?: Record<string, unknown>;

    @IsOptional()
    @IsIn(EDITABLE_STATUSES)
    status?: (typeof EDITABLE_STATUSES)[number];

    @IsOptional()
    @IsString()
    scheduledAt?: string;
}

export class SetAuthorDto {
    /** A workspace member's user id; null/omitted returns to the automatic author. */
    @IsOptional()
    @IsString()
    authorId?: string | null;
}
