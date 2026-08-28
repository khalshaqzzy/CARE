import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from '../prisma.service';
import { AuthController } from './auth.controller';
import { AuthGuard, CsrfGuard, MutationThrottleGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PolicyService } from './policy.service';
import { ThrottleService } from './throttle.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    PrismaService,
    AuthService,
    PolicyService,
    ThrottleService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: MutationThrottleGuard },
  ],
  exports: [AuthService, PolicyService],
})
export class AuthModule {}
