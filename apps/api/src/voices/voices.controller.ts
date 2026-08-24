import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Actor } from '../auth/auth.decorators';
import type { AuthActor } from '../auth/auth.types';
import { MediaService } from '../media/media.service';
import { VoicesService } from './voices.service';

@ApiTags('voices')
@ApiCookieAuth()
@Controller()
export class VoicesController {
  constructor(
    @Inject(VoicesService) private readonly voices: VoicesService,
    @Inject(MediaService) private readonly media: MediaService,
  ) {}
  @Post('drafts') createDraft(@Actor() actor: AuthActor, @Body() body: unknown) {
    return this.voices.createDraft(actor, body);
  }
  @Get('drafts/:id') getDraft(@Actor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.voices.getDraft(actor, id);
  }
  @Get('drafts/:id/preview') previewDraft(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.previewDraft(actor, id);
  }
  @Patch('drafts/:id') updateDraft(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.voices.updateDraft(actor, id, body);
  }
  @Delete('drafts/:id') deleteDraft(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.deleteDraft(actor, id);
  }
  @Post('drafts/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_000_000, files: 1 } }))
  addDraftAttachment(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.voices.addDraftAttachment(actor, id, file);
  }
  @Delete('drafts/:id/attachments/:attachmentId') removeDraftAttachment(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.voices.removeDraftAttachment(actor, id, attachmentId);
  }
  @Post('drafts/:id/classify') classify(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.classify(actor, id);
  }
  @Post('drafts/:id/manual-classification') manual(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.voices.manualClassification(actor, id, body);
  }
  @Post('drafts/:id/submit') submit(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.submit(actor, id, body, key);
  }
  @Get('voices') list(
    @Actor() actor: AuthActor,
    @Query() query: Parameters<VoicesService['list']>[1],
  ) {
    return this.voices.list(actor, query);
  }
  @Get('voices/:id') detail(@Actor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.voices.detail(actor, id);
  }
  @Get('voices/:id/timeline') timeline(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.timeline(actor, id);
  }
  @Post('voices/:id/ask') ask(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.ask(actor, id, body, key);
  }
  @Post('voices/:id/proceed') proceed(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.proceed(actor, id, body, key);
  }
  @Post('voices/:id/assign') assign(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.assign(actor, id, body, key);
  }
  @Post('voices/:id/reassign') reassign(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.reassign(actor, id, body, key);
  }
  @Get('voices/:id/messages') messages(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.messages(actor, id);
  }
  @Get('conversations') conversations(@Actor() actor: AuthActor) {
    return this.voices.conversations(actor);
  }
  @Post('voices/:id/messages')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 10_000_000 } }))
  message(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.addMessage(actor, id, body, files, key);
  }
  @Post('voices/:id/closure-evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_000_000, files: 1 } }))
  evidence(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.voices.stageEvidence(actor, id, file);
  }
  @Post('voices/:id/close') close(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.close(actor, id, body, key);
  }
  @Post('voices/:id/rate') rate(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.rate(actor, id, body, key);
  }
  @Get('dashboard') dashboard(@Actor() actor: AuthActor) {
    return this.voices.dashboard(actor);
  }
  @Get('media/:id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async mediaFile(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const media = await this.media.readAuthorized(id, actor.accountId);
    response
      .type(media.attachment.mimeType)
      .setHeader('Content-Disposition', `inline; filename="${id}.webp"`)
      .send(media.buffer);
  }
}
