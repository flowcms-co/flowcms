import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateRoleDto {
    @IsString()
    name!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    permissions!: string[];

    @IsOptional()
    @IsString()
    dashboard?: string;

    // Pro (advanced_rbac) field-level rules.
    @IsOptional()
    @IsBoolean()
    lockSeoMeta?: boolean;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedTypeIds?: string[];
}

export class UpdateRoleDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    permissions?: string[];

    @IsOptional()
    @IsString()
    dashboard?: string;

    @IsOptional()
    @IsBoolean()
    lockSeoMeta?: boolean;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedTypeIds?: string[];
}
