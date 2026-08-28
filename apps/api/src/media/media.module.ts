import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MediaService } from './media.service';
@Module({ providers: [PrismaService, MediaService], exports: [MediaService] })
export class MediaModule {}
