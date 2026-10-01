import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AdminEscalationSettingsController } from './escalation-settings.controller';
import { EscalationSettingsService } from './escalation-settings.service';

@Module({
  controllers: [AdminEscalationSettingsController],
  providers: [PrismaService, EscalationSettingsService],
  exports: [EscalationSettingsService],
})
export class EscalationModule {}
