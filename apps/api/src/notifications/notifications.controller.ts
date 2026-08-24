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
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';
@ApiTags('notifications')
@ApiCookieAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}
  @Get() list(
    @Actor() actor: AuthActor,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(actor, cursor, Number(limit ?? 30));
  }
  @Get('unread-count') unread(@Actor() actor: AuthActor) {
    return this.service.unread(actor);
  }
  @Patch('read-all') readAll(@Actor() actor: AuthActor) {
    return this.service.readAll(actor);
  }
  @Patch(':id/read') read(@Actor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.read(actor, id);
  }
  @Get('push/public-key') publicKey() {
    return this.service.publicKey();
  }
  @Get('push/status') status(@Actor() actor: AuthActor) {
    return this.service.status(actor);
  }
  @Post('push/subscriptions') subscribe(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.service.subscribe(actor, body);
  }
  @Delete('push/subscriptions/:installationId') unsubscribe(
    @Actor() actor: AuthActor,
    @Param('installationId') installationId: string,
  ) {
    return this.service.unsubscribe(actor, installationId);
  }
}
