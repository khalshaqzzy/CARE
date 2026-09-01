import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MediaModule } from '../media/media.module';
import { PrismaService } from '../prisma.service';
import { VoicesController } from './voices.controller';
import { VoicesService } from './voices.service';
import { CategoriesModule } from '../categories/categories.module';
@Module({
  imports: [AiModule, MediaModule, CategoriesModule],
  controllers: [VoicesController],
  providers: [PrismaService, VoicesService],
})
export class VoicesModule {}
