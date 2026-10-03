import { Module } from '@nestjs/common';
import { PolicyService } from '../auth/policy.service';
import { PrismaService } from '../prisma.service';
import { AwayController } from './away.controller';
import { AwayService } from './away.service';

@Module({
  controllers: [AwayController],
  providers: [PrismaService, PolicyService, AwayService],
})
export class AwayModule {}
