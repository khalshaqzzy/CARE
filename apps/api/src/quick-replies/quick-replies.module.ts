import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AdminQuickRepliesController, QuickRepliesController } from './quick-replies.controller';
import { QuickRepliesService } from './quick-replies.service';

@Module({
  controllers: [QuickRepliesController, AdminQuickRepliesController],
  providers: [PrismaService, QuickRepliesService],
})
export class QuickRepliesModule {}
