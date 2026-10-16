import { Controller, Get, Header, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { DivisionAdminService } from './division-admin.service';

@ApiTags('division-admin')
@ApiCookieAuth()
@Capabilities('DIVISION_ADMIN')
@Controller('division-admin')
export class DivisionAdminController {
  constructor(@Inject(DivisionAdminService) private readonly service: DivisionAdminService) {}

  @Get('overview') overview(@Actor() actor: AuthActor) {
    return this.service.overview(actor);
  }

  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  async export(
    @Actor() actor: AuthActor,
    @Req() request: Request,
    @Res() response: Response,
    @Query('status') status?: string,
    @Query('statusGroup') statusGroup?: string,
    @Query('severity') severity?: string,
    @Query('due') due?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const file = await this.service.export(
      actor,
      { status, statusGroup, severity, due, from, to },
      String(request.headers['x-correlation-id'] ?? 'unknown'),
    );
    response
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.buffer);
  }
}
