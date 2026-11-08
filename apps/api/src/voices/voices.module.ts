import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MediaModule } from '../media/media.module';
import { PrismaService } from '../prisma.service';
import { HandlingTargetService } from './handling-target.service';
import { TierEscalationService } from './tier-escalation.service';
import { ClosureReviewService } from './closure-review.service';
import { VoicesController } from './voices.controller';
import { DivisionAdminController } from './division-admin.controller';
import { DivisionAdminService } from './division-admin.service';
import { AdminVoicesController } from './admin-voices.controller';
import { AdminVoiceReportService } from './admin-voice-report.service';
import { VoicesService } from './voices.service';
import { CategoriesModule } from '../categories/categories.module';
import { ShopsModule } from '../shops/shops.module';
@Module({
  imports: [AiModule, MediaModule, CategoriesModule, ShopsModule],
  controllers: [VoicesController, DivisionAdminController, AdminVoicesController],
  providers: [
    PrismaService,
    VoicesService,
    DivisionAdminService,
    AdminVoiceReportService,
    ClosureReviewService,
    HandlingTargetService,
    TierEscalationService,
  ],
  exports: [ClosureReviewService, HandlingTargetService, TierEscalationService],
})
export class VoicesModule {}
