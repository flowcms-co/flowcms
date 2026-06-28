import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";

@Module({
    imports: [PrismaModule],
    controllers: [BillingController],
    providers: [BillingService],
    exports: [BillingService],
})
export class BillingModule {}
