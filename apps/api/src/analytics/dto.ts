import { IsIn, IsOptional, IsString } from "class-validator";

export class ConnectAnalyticsDto {
    @IsIn(["gsc", "ga4"])
    type!: "gsc" | "ga4";

    /** The Google service-account JSON key, as a string. */
    @IsString()
    credentials!: string;

    /** GSC: the verified site (e.g. "https://example.com/" or "sc-domain:example.com"). */
    @IsOptional()
    @IsString()
    siteUrl?: string;

    /** GA4: the numeric property ID. */
    @IsOptional()
    @IsString()
    propertyId?: string;

    @IsOptional()
    @IsString()
    label?: string;
}
