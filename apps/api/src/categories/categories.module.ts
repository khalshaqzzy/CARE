import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  AdminCategoriesController,
  AdminCategoryCorrectionsController,
  CategoriesController,
} from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [
    CategoriesController,
    AdminCategoriesController,
    AdminCategoryCorrectionsController,
  ],
  providers: [PrismaService, CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
