import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
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
    return this.auth.login(body, response, request.ip ?? 'unknown', request.header('user-agent'));
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
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { type: 'string' },
        newPassword: { type: 'string', minLength: 6, maxLength: 128 },
      },
    },
  })
  changePassword(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.auth.changePassword(actor, body);
  }
}
