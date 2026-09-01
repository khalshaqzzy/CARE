import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiModule } from '../ai/ai.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [AiModule, CategoriesModule],
  controllers: [AdminController],
  providers: [PrismaService, AdminService],
})
export class AdminModule {}
