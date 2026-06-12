import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class CreateContentTypeDto {
    @IsString()
    name!: string;

    @IsOptional()
    @IsIn(["COLLECTION", "SINGLE", "COMPONENT"])
    kind?: "COLLECTION" | "SINGLE" | "COMPONENT";

    /** Visual model: { icon, color, jsonLd, fields[] } authored in the Schema Builder. */
    @IsObject()
    schema!: Record<string, unknown>;
}

export class UpdateContentTypeDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsObject()
    schema?: Record<string, unknown>;

    @IsOptional()
    @IsBoolean()
    draftAndPublish?: boolean;
}
