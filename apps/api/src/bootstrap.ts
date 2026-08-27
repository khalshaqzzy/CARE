import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { SafeJsonLogger } from './common/json-logger';

export async function createApp(): Promise<INestApplication> {
  loadConfig();
  const app = await NestFactory.create(AppModule, { logger: new SafeJsonLogger() });
  const trustProxyHops = loadConfig().TRUST_PROXY_HOPS;
  if (trustProxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready', 'release.json', 'metrics'] });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CARE API')
      .setVersion('1.0.0')
      .setDescription('CARE Enterprise Member Voice backend contract')
      .addCookieAuth(
        loadConfig().SESSION_COOKIE_NAME,
        { type: 'apiKey', in: 'cookie', name: loadConfig().SESSION_COOKIE_NAME },
        'cookie',
      )
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  return app;
}
