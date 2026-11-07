import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { QuickRepliesService } from './quick-replies.service';

@ApiTags('workforce')
@ApiCookieAuth()
@Controller('quick-replies')
export class QuickRepliesController {
  constructor(@Inject(QuickRepliesService) private readonly service: QuickRepliesService) {}
  @Get() list() {
    return this.service.listActive();
  }
}

@ApiTags('administration')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/quick-replies')
export class AdminQuickRepliesController {
  constructor(@Inject(QuickRepliesService) private readonly service: QuickRepliesService) {}
  @Get() list() {
    return this.service.listAll();
  }
  @Post() create(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.service.create(actor, body);
  }
  @Put('order') reorder(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.service.reorder(actor, body);
  }
  @Patch(':id') update(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(actor, id, body);
  }
  @Delete(':id') delete(@Actor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(actor, id);
  }
}
