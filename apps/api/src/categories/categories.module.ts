import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AdminCategoriesController, CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [PrismaService, CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
