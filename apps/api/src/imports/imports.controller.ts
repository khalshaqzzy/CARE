import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Actor, Roles } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { ImportsService } from './imports.service';

@ApiTags('provisioning')
@ApiCookieAuth()
@Roles(Role.CARE_ADMIN)
@Controller('admin/imports')
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly service: ImportsService) {}
  @Post(':type/preview')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5_000_000, files: 1 } }))
  preview(
    @Actor() actor: AuthActor,
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.preview(actor, type, file);
  }
  @Get(':id') detail(@Actor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(actor, id);
  }
  @Post(':id/confirm') confirm(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { expectedVersion?: number },
  ) {
    return this.service.confirm(actor, id, body.expectedVersion ?? 1);
  }
}
