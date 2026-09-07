import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { access, constants, mkdir } from 'node:fs/promises';
import { loadConfig, redactedConfig } from './config';
import { PrismaService } from './prisma.service';
import { Public } from './auth/auth.decorators';
import { AiRuntimeConfigService } from './ai/runtime-config.service';

@ApiTags('operability')
@Controller()
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiRuntimeConfigService) private readonly aiRuntimeConfig: AiRuntimeConfigService,
  ) {}

  @Public()
  @Get('health')
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  health() {
    return { status: 'ok' };
  }

  @Public()
  @Get('release.json')
  @Header('Cache-Control', 'no-store')
  release() {
    const config = loadConfig();
    return { releaseSha: config.RELEASE_SHA, service: 'care-api' };
  }

  @Public()
  @Get('ready')
  async ready() {
    const config = loadConfig();
    const checks: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
      const failedMigrations = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "_prisma_migrations"
        WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
      `;
      checks.migrations = failedMigrations[0]?.count === 0n ? 'ok' : 'failed';
      const unhealthyOutbox = await this.prisma.outboxEvent.count({
        where: {
          OR: [
            { status: 'DEAD_LETTER' },
            { status: 'PENDING', availableAt: { lt: new Date(Date.now() - 15 * 60_000) } },
          ],
        },
      });
      checks.outbox = unhealthyOutbox ? 'degraded' : 'ok';
    } catch {
      checks.database = 'failed';
      checks.migrations = 'failed';
      checks.outbox = 'failed';
    }
    try {
      await mkdir(config.MEDIA_ROOT, { recursive: true });
      await access(config.MEDIA_ROOT, constants.R_OK | constants.W_OK);
      checks.storage = 'ok';
    } catch {
      checks.storage = 'failed';
    }
    let openai = { configured: false, model: null as string | null, reasoningEffort: '' };
    try {
      const effective = await this.aiRuntimeConfig.safeEffective();
      openai = {
        configured: effective.apiKeyConfigured && Boolean(effective.model && effective.baseUrl),
        model: effective.model || null,
        reasoningEffort: effective.reasoningEffort,
      };
    } catch {
      // An unreadable Admin secret must remain degraded; never silently fall back to env.
    }
    const degraded = [checks.database, checks.migrations, checks.storage].includes('failed');
    return {
      status: degraded ? 'not_ready' : 'ready',
      releaseSha: config.RELEASE_SHA,
      checks,
      dependencies: {
        openai: openai.configured ? 'configured' : 'degraded',
        push: config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY ? 'configured' : 'degraded',
      },
      config: { ...redactedConfig(config), openai },
    };
  }
}
