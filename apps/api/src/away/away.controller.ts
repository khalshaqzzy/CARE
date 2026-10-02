import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { AwayService } from './away.service';

@ApiTags('workforce')
@ApiCookieAuth()
@Capabilities('GROUP_LEADER', 'SECTION_HEAD', 'MANAGER', 'DIVISION_LEADERSHIP')
@Controller('me/away')
export class AwayController {
  constructor(@Inject(AwayService) private readonly away: AwayService) {}
  @Get() get(@Actor() actor: AuthActor) {
    return this.away.get(actor);
  }
  @Post() set(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.away.set(actor, body);
  }
  @Post('end') end(@Actor() actor: AuthActor) {
    return this.away.end(actor);
  }
}
