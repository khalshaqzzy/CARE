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
  @Post('drafts') createDraft(@Actor() a: AuthActor, @Body() b: unknown) {
    return this.voices.createDraft(a, b);
  }
  @Get('drafts') listDrafts(
    @Actor() a: AuthActor,
    @Query() q: Parameters<VoicesService['listDrafts']>[1],
  ) {
    return this.voices.listDrafts(a, q ?? {});
  }
  @Get('drafts/:id') getDraft(@Actor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.voices.getDraft(a, id);
  }
  @Patch('drafts/:id') updateDraft(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.voices.updateDraft(a, id, b);
  }
  @Delete('drafts/:id') deleteDraft(@Actor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.voices.deleteDraft(a, id);
  }
  @Get('drafts/:id/preview') previewDraft(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.previewDraft(a, id);
  }
  @Post('drafts/:id/classify') classify(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.classify(a, id);
  }
  @Post('drafts/:id/manual-classification') manual(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
  ) {
    return this.voices.manualClassification(a, id, b);
  }
  @Post('drafts/:id/location-review') locationReview(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.reviewLocation(a, id);
  }
  @Get('drafts/:id/location-review') getLocationReview(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.getLocationReview(a, id);
  }
  @Post('drafts/:id/submit') submit(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.submit(a, id, b, key);
  }
  @Post('drafts/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_000_000, files: 1 } }))
  addDraftAttachment(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.voices.addDraftAttachment(a, id, file);
  }
  @Delete('drafts/:id/attachments/:attachmentId') removeDraftAttachment(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.voices.removeDraftAttachment(a, id, attachmentId);
  }

  @Get('voices') list(@Actor() a: AuthActor, @Query() q: Parameters<VoicesService['list']>[1]) {
    return this.voices.list(a, q);
  }
  @Get('work-items') workItems(
    @Actor() a: AuthActor,
    @Query() q: Parameters<VoicesService['workItems']>[1],
  ) {
    return this.voices.workItems(a, q ?? {});
  }
  @Get('voices/:id') detail(@Actor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.voices.detail(a, id);
  }
  @Get('voices/:id/timeline') timeline(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.timeline(a, id);
  }
  @Post('voices/:id/assignments') assign(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.assign(a, id, b, key);
  }
  @Post('voices/:id/assignments/reassign') reassign(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.reassign(a, id, b, key);
  }
  @Get('voices/:id/assignment-candidates') assignmentCandidates(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.assignmentCandidates(a, id);
  }
  @Post('voices/:id/ask') ask(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.ask(a, id, b, key);
  }
  @Post('voices/:id/proceed') proceed(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.proceed(a, id, b, key);
  }
  @Get('voices/:id/messages') messages(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.voices.messages(a, id);
  }
  @Get('conversations') conversations(@Actor() a: AuthActor) {
    return this.voices.conversations(a);
  }
  @Post('voices/:id/messages')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 10_000_000 } }))
  message(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.addMessage(a, id, b, files, key);
  }
  @Post('voices/:id/closure-evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_000_000, files: 1 } }))
  evidence(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.voices.stageEvidence(a, id, file);
  }
  @Post('voices/:id/close') close(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.close(a, id, b, key);
  }
  @Post('voices/:id/rate') rate(
    @Actor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key = '',
  ) {
    return this.voices.rate(a, id, b, key);
  }
  @Get('dashboard/general') dashboardGeneral(@Actor() a: AuthActor) {
    return this.voices.dashboardGeneral(a);
  }
  @Get('dashboard/private') dashboardPrivate(@Actor() a: AuthActor) {
    return this.voices.dashboardPrivate(a);
  }
  @Get('dashboard/member') dashboardMember(@Actor() a: AuthActor) {
    return this.voices.dashboardMember(a);
  }

  @Get('media/:id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async mediaFile(
    @Actor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const media = await this.media.readAuthorized(id, actor);
    response
      .type(media.attachment.mimeType)
      .setHeader('Content-Disposition', `inline; filename="${id}.webp"`)
      .send(media.buffer);
  }
}
