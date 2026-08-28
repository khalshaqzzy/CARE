import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { HttpErrorFilter } from './common/http.filter';
import { correlationMiddleware } from './common/correlation.middleware';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ImportsModule } from './imports/imports.module';
import { VoicesModule } from './voices/voices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [AuthModule, AdminModule, ImportsModule, VoicesModule, NotificationsModule],
  controllers: [HealthController, MetricsController],
  providers: [PrismaService, { provide: APP_FILTER, useClass: HttpErrorFilter }],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(correlationMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
