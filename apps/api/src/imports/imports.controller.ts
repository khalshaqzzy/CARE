import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Capabilities } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { ImportsService } from './imports.service';

@ApiTags('organization-imports')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/organization-imports')
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly service: ImportsService) {}

  @Post('preview')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_000_000, files: 1 } }))
  preview(@Actor() actor: AuthActor, @UploadedFile() file: Express.Multer.File) {
    return this.service.preview(actor, file);
  }

  @Get() list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list({ cursor, limit, status });
  }

  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Get(':id/changes') changes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ) {
    return this.service.changes(id, { cursor, limit, filter });
  }

  @Post(':id/confirm')
  @HttpCode(202)
  confirm(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body?: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('Idempotency-Key') idempotencyKeyAlt?: string,
  ) {
    const key = idempotencyKey ?? idempotencyKeyAlt;
    return this.service.confirm(actor, id, body, key);
  }
}

@ApiTags('organization')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/organization-snapshots')
export class OrganizationSnapshotsController {
  constructor(@Inject(ImportsService) private readonly service: ImportsService) {}

  @Get('current') current() {
    return this.service.getCurrentSnapshot();
  }
}

@ApiTags('organization')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/organization-units')
export class OrganizationUnitsController {
  constructor(@Inject(ImportsService) private readonly service: ImportsService) {}

  @Get() list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('division') division?: string,
  ) {
    return this.service.listOrganizationUnits({ cursor, limit, search, division });
  }

  @Get('filters/divisions') divisions(@Query('search') search?: string) {
    return this.service.listOrganizationDivisions(search);
  }

  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOrganizationUnit(id);
  }
}
