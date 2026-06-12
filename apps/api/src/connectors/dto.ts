import { IsArray, IsIn, IsOptional, IsString, IsUrl } from "class-validator";

export class ConnectConnectorDto {
    @IsIn(["slack", "zapier"])
    provider!: "slack" | "zapier";

    @IsUrl({ require_protocol: true, protocols: ["https", "http"] })
    url!: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    events?: string[];
}
