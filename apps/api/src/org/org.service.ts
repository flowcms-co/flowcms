import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const ID = "singleton";

export type OrgInput = {
    legalName?: string | null;
    addressLines?: string[];
    taxId?: string | null;
    billingEmail?: string | null;
};

/** Install-level organization / billing details (single row). Used on invoices and reported
 *  to the vendor so transactional emails carry the right company + recipient. */
@Injectable()
export class OrgService {
    constructor(private readonly prisma: PrismaService) {}

    async get() {
        const row = await this.prisma.orgProfile.findUnique({ where: { id: ID } });
        return row ?? { id: ID, legalName: null, addressLines: [] as string[], taxId: null, billingEmail: null };
    }

    async update(data: OrgInput) {
        const clean = {
            legalName: data.legalName?.trim() || null,
            addressLines: (data.addressLines ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 4),
            taxId: data.taxId?.trim() || null,
            billingEmail: data.billingEmail?.trim() || null,
        };
        return this.prisma.orgProfile.upsert({ where: { id: ID }, create: { id: ID, ...clean }, update: clean });
    }
}
