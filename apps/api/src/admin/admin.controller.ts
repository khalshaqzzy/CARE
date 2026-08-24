import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Actor, Roles } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { AdminService } from './admin.service';

@ApiTags('administration')
@ApiCookieAuth()
@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}
  @Roles(Role.CARE_ADMIN) @Get('accounts') list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listAccounts(cursor, Number(limit ?? 50));
  }
  @Roles(Role.CARE_ADMIN) @Get('accounts/:id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.accountDetail(id);
  }
  @Roles(Role.CARE_ADMIN) @Post('accounts/:id/revoke-sessions') revokeSessions(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.revokeSessions(actor, id, body);
  }
  @Roles(Role.CARE_ADMIN) @Post('accounts/:id/reset-password') reset(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.resetAccount(actor, id, body);
  }
  @Roles(Role.CARE_ADMIN) @Patch('accounts/:id/activate') activate(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.setActive(actor, id, true, body);
  }
  @Roles(Role.CARE_ADMIN) @Patch('accounts/:id/deactivate') deactivate(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.setActive(actor, id, false, body);
  }
  @Roles(Role.MANAGER) @Get('employees/search') search(@Query('q') query = '') {
    return this.service.searchEmployees(query);
  }
  @Roles(Role.MANAGER) @Post('section-heads/promote') promote(
    @Actor() actor: AuthActor,
    @Body() body: unknown,
  ) {
    return this.service.promoteSectionHead(actor, body);
  }
  @Roles(Role.MANAGER) @Post('section-heads/transfer') transfer(
    @Actor() actor: AuthActor,
    @Body() body: unknown,
  ) {
    return this.service.transferSectionHead(actor, body);
  }
  @Roles(Role.MANAGER) @Post('section-heads/remove') remove(
    @Actor() actor: AuthActor,
    @Body() body: unknown,
  ) {
    return this.service.removeSectionHead(actor, body);
  }
}
