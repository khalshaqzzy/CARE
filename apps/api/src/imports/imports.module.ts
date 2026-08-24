import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
@Module({ controllers: [ImportsController], providers: [PrismaService, ImportsService] })
export class ImportsModule {}
