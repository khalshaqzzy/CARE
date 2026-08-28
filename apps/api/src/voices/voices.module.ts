import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MediaModule } from '../media/media.module';
import { PrismaService } from '../prisma.service';
import { VoicesController } from './voices.controller';
import { VoicesService } from './voices.service';
@Module({
  imports: [AiModule, MediaModule],
  controllers: [VoicesController],
  providers: [PrismaService, VoicesService],
})
export class VoicesModule {}
