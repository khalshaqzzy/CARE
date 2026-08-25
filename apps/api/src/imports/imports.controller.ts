import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
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

  @Get() list() {
    return this.service.list();
  }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
  @Get(':id/changes') changes(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.changes(id);
  }

  @Post(':id/confirm')
  @HttpCode(202)
  confirm(@Actor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.confirm(actor, id);
  }
}
