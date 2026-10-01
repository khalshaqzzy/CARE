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
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { ShopLocationsService } from './shop-locations.service';

@ApiTags('administration')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/shop-locations')
export class AdminShopLocationsController {
  constructor(@Inject(ShopLocationsService) private readonly service: ShopLocationsService) {}
  @Get() list() {
    return this.service.list();
  }
  @Get('unmatched') unmatched() {
    return this.service.unmatched();
  }
  @Post() create(
    @Actor() actor: AuthActor,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.create(actor, body, key);
  }
  @Put(':id') update(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.update(actor, id, body, key);
  }
  @Put(':id/status') status(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.setStatus(actor, id, body, key);
  }
}
