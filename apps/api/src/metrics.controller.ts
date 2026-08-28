import { Controller, Get, Headers, Res } from '@nestjs/common';
import { collectDefaultMetrics, register } from 'prom-client';
import type { Response } from 'express';
import { Public } from './auth/auth.decorators';
import { forbiddenAsNotFound } from './common/errors';
import { loadConfig } from './config';
collectDefaultMetrics({ prefix: 'care_api_' });
@Controller()
export class MetricsController {
  @Public() @Get('metrics') async metrics(
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ) {
    const token = loadConfig().METRICS_TOKEN;
    if (!token || authorization !== `Bearer ${token}`) throw forbiddenAsNotFound();
    response.type(register.contentType).send(await register.metrics());
  }
}
