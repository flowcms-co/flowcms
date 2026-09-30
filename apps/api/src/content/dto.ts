import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class CreateContentTypeDto {
    @IsString()
    name!: string;

    /** Optional machine identifier; slugified + de-duplicated. Derived from `name` when omitted. */
    @IsOptional()
    @IsString()
    apiId?: string;

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

    /** Rename the machine identifier. Only honored while the type has no entries
     *  (changing it would break the delivery-API URLs of existing content). */
    @IsOptional()
    @IsString()
    apiId?: string;

    @IsOptional()
    @IsObject()
    schema?: Record<string, unknown>;

    @IsOptional()
    @IsBoolean()
    draftAndPublish?: boolean;

    /** A schema change that trims blocks from entries (a repeatable component field
     *  made single) is refused with 409 until the caller sends this as true. */
    @IsOptional()
    @IsBoolean()
    acknowledgeDataLoss?: boolean;
}
