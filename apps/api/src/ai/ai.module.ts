import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AiService } from './ai.service';
import { AiRuntimeConfigService } from './runtime-config.service';
@Module({
  providers: [PrismaService, AiRuntimeConfigService, AiService],
  exports: [AiRuntimeConfigService, AiService],
})
export class AiModule {}
