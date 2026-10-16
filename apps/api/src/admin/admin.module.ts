import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DivisionAccountsController } from './division-accounts.controller';
import { AiModule } from '../ai/ai.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [AiModule, CategoriesModule],
  controllers: [AdminController, DivisionAccountsController],
  providers: [PrismaService, AdminService],
})
export class AdminModule {}
