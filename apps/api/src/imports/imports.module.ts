import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ImportsController,
  OrganizationSnapshotsController,
  OrganizationUnitsController,
} from './imports.controller';
import { ImportsService } from './imports.service';
@Module({
  controllers: [ImportsController, OrganizationSnapshotsController, OrganizationUnitsController],
  providers: [PrismaService, ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
