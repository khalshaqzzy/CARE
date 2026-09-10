import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { badRequest } from '../common/errors';
import { Actor, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { AuthActor } from './auth.types';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Public()
  @Post('login')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string' },
        password: { type: 'string', format: 'password' },
      },
    },
  })
  login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.publicAuth(request, response);
    return this.auth.login(body, response, request.ip ?? 'unknown', request.header('user-agent'));
  }
  private publicAuth(request: Request, response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const origin = request.header('origin');
    if (request.header('sec-fetch-site') === 'cross-site')
      throw badRequest('AUTH_ORIGIN_INVALID', 'Request origin is not allowed');
    if (origin) {
      let valid = false;
      try {
        const url = new URL(origin);
        valid = ['http:', 'https:'].includes(url.protocol) && url.host === request.get('host');
      } catch {
        /* An opaque or malformed origin is never trusted. */
      }
      if (!valid) throw badRequest('AUTH_ORIGIN_INVALID', 'Request origin is not allowed');
    }
  }
  @Public()
  @Post('login/start')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['noReg'],
      properties: { noReg: { type: 'string', minLength: 1, maxLength: 64 } },
    },
  })
  startLogin(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.publicAuth(request, response);
    return this.auth.startLogin(
      body,
      response,
      request.ip ?? 'unknown',
      request.header('user-agent'),
    );
  }
  @Public()
  @Post('password-reset/eligibility')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['noReg'],
      properties: { noReg: { type: 'string', minLength: 1, maxLength: 64 } },
    },
  })
  resetEligibility(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.publicAuth(request, response);
    return this.auth.resetEligibility(body, request.ip ?? 'unknown');
  }
  @Public()
  @Post('password-reset')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['noReg', 'birthDate'],
      properties: {
        noReg: { type: 'string', minLength: 1, maxLength: 64 },
        birthDate: { type: 'string', format: 'date' },
      },
    },
  })
  resetPassword(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.publicAuth(request, response);
    return this.auth.resetPassword(
      body,
      request.ip ?? 'unknown',
      String(request.headers['x-correlation-id'] ?? 'unknown'),
    );
  }
  @Post('logout') @ApiCookieAuth() logout(
    @Actor() actor: AuthActor,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(actor, response);
  }
  @Get('session') @ApiCookieAuth() session(@Actor() actor: AuthActor) {
    return this.auth.session(actor);
  }
  @Get('csrf') @ApiCookieAuth() csrf(@Actor() actor: AuthActor) {
    return this.auth.csrf(actor);
  }
  @Post('change-password')
  @ApiCookieAuth()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['newPassword'],
      properties: {
        currentPassword: { type: 'string' },
        newPassword: { type: 'string', minLength: 6, maxLength: 128 },
      },
    },
  })
  changePassword(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.auth.changePassword(actor, body);
  }
  @Post('defer-password-change')
  @ApiCookieAuth()
  deferPasswordChange(@Actor() actor: AuthActor, @Req() request: Request) {
    return this.auth.deferPasswordChange(
      actor,
      String(request.headers['x-correlation-id'] ?? 'unknown'),
    );
  }
}
