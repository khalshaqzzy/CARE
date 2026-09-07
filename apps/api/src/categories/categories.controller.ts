import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { CategoriesService } from './categories.service';

@ApiTags('general-voice-categories')
@ApiCookieAuth()
@Controller('general-voice-categories')
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly service: CategoriesService) {}
  @Get() list() {
    return this.service.publicCatalog();
  }
}

@ApiTags('administration')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/general-voice-categories')
export class AdminCategoriesController {
  constructor(@Inject(CategoriesService) private readonly service: CategoriesService) {}
  @Get() list(@Query('status') status?: string) {
    return this.service.list(status);
  }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
  @Get(':id/history') history(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.history(id);
  }
  @Post() create(
    @Actor() actor: AuthActor,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    return this.service.create(actor, body, key ?? keyAlt);
  }
  @Put(':id') update(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    return this.service.update(actor, id, body, key ?? keyAlt);
  }
  @Put(':id/status') status(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    return this.service.setStatus(actor, id, body, key ?? keyAlt);
  }
}
