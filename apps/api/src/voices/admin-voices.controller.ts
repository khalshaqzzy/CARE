import { Controller, Get, Header, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { AdminVoiceReportService, type AdminVoiceReportQuery } from './admin-voice-report.service';

const FILTERS = [
  'search',
  'status',
  'statusGroup',
  'visibility',
  'severity',
  'area',
  'category',
  'handler',
  'from',
  'to',
  'origin',
] as const;

/** Only the known browse filters reach the report; anything else is ignored. */
function filters(query: Record<string, unknown>): AdminVoiceReportQuery {
  return Object.fromEntries(
    FILTERS.filter((key) => typeof query[key] === 'string' && query[key]).map((key) => [
      key,
      query[key],
    ]),
  ) as AdminVoiceReportQuery;
}

@ApiTags('admin')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/voices')
export class AdminVoicesController {
  constructor(@Inject(AdminVoiceReportService) private readonly reports: AdminVoiceReportService) {}

  @Get('summary') summary(@Actor() actor: AuthActor, @Query() query: Record<string, unknown>) {
    return this.reports.summary(actor, filters(query));
  }

  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  async export(
    @Actor() actor: AuthActor,
    @Req() request: Request,
    @Res() response: Response,
    @Query() query: Record<string, unknown>,
  ) {
    const file = await this.reports.export(
      actor,
      filters(query),
      String(request.headers['x-correlation-id'] ?? 'unknown'),
    );
    response
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.buffer);
  }
}
