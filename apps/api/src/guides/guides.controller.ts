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
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Actor, Capabilities } from '../auth/auth.decorators';
import { forbiddenAsNotFound } from '../common/errors';
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

  // Signed-in accounts only, and only guides listed for them (CARE Admin reads all).
  // The in-app viewer (pdf.js) fetches it same-origin with the session cookie and
  // Range requests; `?download=1` returns the original bytes as an attachment.
  @Get(':id/file')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async file(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download: string | undefined,
    @Res() response: Response,
  ) {
    const { guide, path } = await this.guides.readFile(actor, id);
    const disposition = download === '1' ? 'attachment' : 'inline';
    // sendFile answers Range requests, so the in-app viewer can show the first
    // page before the whole PDF has downloaded.
    await new Promise<void>((resolve, reject) =>
      response.sendFile(
        path,
        {
          // The path is server-generated under MEDIA_ROOT, which may sit in a dot folder.
          dotfiles: 'allow',
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': contentDisposition(disposition, guide.fileName),
          },
        },
        (error?: Error & { status?: number }) => {
          if (!error || response.headersSent) return resolve();
          reject(error.status === 404 ? forbiddenAsNotFound() : error);
        },
      ),
    );
  }
}

/**
 * RFC 6266 header that keeps the uploaded file name: an ASCII `filename` for
 * old clients and a UTF-8 `filename*` for the rest.
 */
export function contentDisposition(type: 'inline' | 'attachment', fileName: string | null) {
  // Drop control characters (no header injection) and path separators.
  let name = Array.from(fileName ?? '')
    .filter(
      (char) => char.charCodeAt(0) > 0x1f && char !== '\u007f' && char !== '/' && char !== '\\',
    )
    .join('')
    .trim();
  if (!name) name = 'panduan.pdf';
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  const ascii = name.replace(/[^\w.\- ]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
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
