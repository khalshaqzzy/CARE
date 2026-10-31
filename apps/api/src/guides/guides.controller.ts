import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Actor, Capabilities, Public } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { GUIDE_MAX_BYTES, GuidesService } from './guides.service';

// One byte over the limit reaches the service, which answers with GUIDE_FILE_TOO_LARGE.
const upload = FileInterceptor('file', { limits: { fileSize: GUIDE_MAX_BYTES + 1, files: 1 } });

@ApiTags('workforce')
@ApiCookieAuth()
@Controller('guides')
export class GuidesController {
  constructor(@Inject(GuidesService) private readonly guides: GuidesService) {}

  @Get() list(@Actor() actor: AuthActor) {
    return this.guides.listForActor(actor);
  }

  // Public so the device PDF viewer (outside the PWA cookie jar on iOS) can open it.
  @Public()
  @Get(':id/file')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async file(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response) {
    const { guide, buffer } = await this.guides.readFile(id);
    const name = (guide.fileName ?? 'panduan.pdf').replace(/[^\w.\- ]/g, '_');
    response
      .type('application/pdf')
      .setHeader('Content-Disposition', `inline; filename="${name}"`)
      .send(buffer);
  }
}

@ApiTags('admin-guides')
@ApiCookieAuth()
@Capabilities('CARE_ADMIN')
@Controller('admin/guides')
export class AdminGuidesController {
  constructor(@Inject(GuidesService) private readonly guides: GuidesService) {}

  @Get() list() {
    return this.guides.listAll();
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  create(
    @Actor() actor: AuthActor,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    return this.guides.create(actor, file, body);
  }

  @Post('videos') createVideo(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.guides.createVideo(actor, body);
  }

  @Put('order') reorder(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.guides.reorder(actor, body);
  }

  @Patch(':id') update(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.guides.update(actor, id, body);
  }

  @Put(':id/file')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload)
  replaceFile(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.guides.replaceFile(actor, id, file);
  }

  @Delete(':id') delete(@Actor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.guides.delete(actor, id);
  }
}
