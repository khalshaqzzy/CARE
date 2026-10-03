import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MediaModule } from '../media/media.module';
import { PrismaService } from '../prisma.service';
import { HandlingTargetService } from './handling-target.service';
import { TierEscalationService } from './tier-escalation.service';
import { ClosureReviewService } from './closure-review.service';
import { VoicesController } from './voices.controller';
import { VoicesService } from './voices.service';
import { CategoriesModule } from '../categories/categories.module';
import { ShopsModule } from '../shops/shops.module';
@Module({
  imports: [AiModule, MediaModule, CategoriesModule, ShopsModule],
  controllers: [VoicesController],
  providers: [
    PrismaService,
    VoicesService,
    ClosureReviewService,
    HandlingTargetService,
    TierEscalationService,
  ],
  exports: [ClosureReviewService, HandlingTargetService, TierEscalationService],
})
export class VoicesModule {}
