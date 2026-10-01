import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { EscalationSettingsService } from './escalation-settings.service';

@ApiTags('administration')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/escalation-settings')
export class AdminEscalationSettingsController {
  constructor(
    @Inject(EscalationSettingsService) private readonly service: EscalationSettingsService,
  ) {}
  @Get() get() {
    return this.service.get();
  }
  @Put('calendar') calendar(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.service.updateCalendar(actor, body);
  }
  @Post('calendar/exceptions') addException(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.service.addException(actor, body);
  }
  @Delete('calendar/exceptions/:id') removeException(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removeException(actor, id);
  }
  @Put('deadlines') deadlines(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.service.updateDeadlines(actor, body);
  }
}
