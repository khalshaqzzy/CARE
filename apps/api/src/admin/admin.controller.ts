import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { AdminService } from './admin.service';

@ApiTags('administration')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}
  @Get('accounts') accounts(@Query('search') search?: string) {
    return this.service.accounts(search);
  }
  @Get('remediation-issues') issues(@Query('status') status?: string) {
    return this.service.issues(status);
  }
  @Get('remediation-issues/history') resolutions() {
    return this.service.resolutions();
  }
  @Put('organization-units/:id/default-pic') defaultPic(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.setDefaultPic(actor, id, body);
  }
  @Put('routes/global-special-pic') globalPic(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.service.setGlobalPic(actor, body);
  }
  @Get('organization-units/:id/section-head-candidates') sectionHeads(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.sectionHeadCandidates(id);
  }
  @Get('union-accounts') unionAccounts() {
    return this.service.unionAccounts();
  }
  @Put('union-accounts/:slot') unionAccount(
    @Actor() actor: AuthActor,
    @Param('slot') slot: string,
    @Body() body: unknown,
  ) {
    return this.service.setUnionAccount(actor, slot, body);
  }
}
