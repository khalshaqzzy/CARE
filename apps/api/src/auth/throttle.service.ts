import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hmac256 } from '../common/crypto';
import { AppError } from '../common/errors';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';

type ThrottleRow = { count: number };

@Injectable()
export class ThrottleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async consume(bucket: string, identifier: string, limit: number, windowMs: number) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowMs);
    const keyHash = hmac256(loadConfig().AUTH_THROTTLE_SECRET, `${bucket}:${identifier}`);
    const rows = await this.prisma.$queryRaw<ThrottleRow[]>(Prisma.sql`
      INSERT INTO "RequestThrottle" ("keyHash", "bucket", "count", "windowStart", "expiresAt")
      VALUES (${keyHash}, ${bucket}, 1, ${now}, ${expiresAt})
      ON CONFLICT ("keyHash") DO UPDATE SET
        "count" = CASE WHEN "RequestThrottle"."expiresAt" <= ${now}
          THEN 1 ELSE "RequestThrottle"."count" + 1 END,
        "windowStart" = CASE WHEN "RequestThrottle"."expiresAt" <= ${now}
          THEN ${now} ELSE "RequestThrottle"."windowStart" END,
        "expiresAt" = CASE WHEN "RequestThrottle"."expiresAt" <= ${now}
          THEN ${expiresAt} ELSE "RequestThrottle"."expiresAt" END
      RETURNING "count"
    `);
    if ((rows[0]?.count ?? limit + 1) > limit)
      throw new AppError('RATE_LIMITED', 'Too many requests; try again later', 429);
  }
}
