import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { forbiddenAsNotFound } from '../common/errors';
import { AdminService } from './admin.service';

/** Division Admin: read-only workforce accounts and login counts of its own division. */
@ApiTags('division-admin')
@ApiCookieAuth()
@Capabilities('DIVISION_ADMIN')
@Controller('division-admin/accounts')
export class DivisionAccountsController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}

  private scope(actor: AuthActor) {
    if (!actor.directorate || !actor.division) throw forbiddenAsNotFound();
    return { directorate: actor.directorate, division: actor.division };
  }

  @Get() accounts(
    @Actor() actor: AuthActor,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('section') section?: string,
    @Query('loggedIn') loggedIn?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.accounts({
      ...this.scope(actor),
      kind: 'WORKFORCE',
      search,
      status,
      department,
      section,
      loggedIn,
      cursor,
      limit,
    });
  }

  @Get('login-summary') loginSummary(
    @Actor() actor: AuthActor,
    @Query('department') department?: string,
  ) {
    return this.service.loginSummary({ ...this.scope(actor), department });
  }
}
