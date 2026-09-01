import {
  Body,
  Controller,
  Delete,
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
import { AdminService } from './admin.service';

@ApiTags('administration')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}
  @Get('overview') overview() {
    return this.service.overview();
  }

  @Get('ai-configuration') aiConfiguration() {
    return this.service.aiConfiguration();
  }

  @Put('ai-configuration') updateAiConfiguration(
    @Actor() actor: AuthActor,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    return this.service.updateAiConfiguration(actor, body, key ?? keyAlt);
  }

  @Delete('ai-configuration') resetAiConfiguration(
    @Actor() actor: AuthActor,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    return this.service.resetAiConfiguration(actor, body, key ?? keyAlt);
  }

  @Post('ai-configuration/test') testAiConfiguration(@Actor() actor: AuthActor) {
    return this.service.testAiConfiguration(actor);
  }

  @Get('accounts') accounts(
    @Query('search') search?: string,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('unitId') unitId?: string,
    @Query('position') position?: string,
    @Query('eligibility') eligibility?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.accounts({
      search,
      kind,
      status,
      unitId,
      position,
      eligibility,
      cursor,
      limit,
    });
  }

  @Get('accounts/:id') accountDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.accountDetail(id);
  }

  @Post('accounts/:id/reset-password') resetPassword(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
    @Body() body?: unknown,
  ) {
    const k = key ?? keyAlt;
    return this.service.resetPassword(actor, id, k, body);
  }

  @Post('accounts/:id/status') setStatus(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    const k = key ?? keyAlt;
    return this.service.setAccountStatus(actor, id, body, k);
  }

  @Get('remediation-issues') issues(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('organizationUnitId') organizationUnitId?: string,
    @Query('batchId') batchId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.issues({ status, type, organizationUnitId, batchId, cursor, limit });
  }

  @Get('remediation-issues/history') resolutions(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.service.resolutions({ cursor, limit, type, status });
  }

  @Put('organization-units/:id/default-pic') defaultPic(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    const k = key ?? keyAlt;
    return this.service.setDefaultPic(actor, id, body, k);
  }

  @Put('routes/global-special-pic') globalPic(
    @Actor() actor: AuthActor,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    const k = key ?? keyAlt;
    return this.service.setGlobalPic(actor, body, k);
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
    @Headers('idempotency-key') key?: string,
    @Headers('Idempotency-Key') keyAlt?: string,
  ) {
    const k = key ?? keyAlt;
    return this.service.setUnionAccount(actor, slot, body, k);
  }

  @Get('audit-events') auditEvents(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
    @Query('result') result?: string,
    @Query('actorKind') actorKind?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('correlationId') correlationId?: string,
  ) {
    return this.service.auditEvents({
      cursor,
      limit,
      from,
      to,
      action,
      result,
      actorKind,
      resourceType,
      resourceId,
      correlationId,
    });
  }

  @Get('audit-events/:id') auditDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.auditEventDetail(id);
  }
}
