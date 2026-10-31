import { Module } from '@nestjs/common';
import { PolicyService } from '../auth/policy.service';
import { PrismaService } from '../prisma.service';
import { AdminGuidesController, GuidesController } from './guides.controller';
import { GuidesService } from './guides.service';

@Module({
  controllers: [GuidesController, AdminGuidesController],
  providers: [PrismaService, PolicyService, GuidesService],
})
export class GuidesModule {}
