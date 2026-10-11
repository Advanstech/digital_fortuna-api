import { Controller, Post, Get, Body, Param, Patch, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DueDiligenceService } from './due-diligence.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { IsOptional, IsString, IsInt, IsUUID } from 'class-validator';

class AddDocumentDto {
  @IsString() category!: string;
  @IsString() fileName!: string;
  @IsString() fileUrl!: string;
  @IsOptional() @IsInt() fileSize?: number;
  @IsOptional() @IsString() mimeType?: string;
}

class ReviewDocumentDto {
  @IsString() status!: string; // approved, flagged, rejected
  @IsOptional() @IsString() reviewNotes?: string;
}

class UpdateChecklistItemDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() documentId?: string;
}

@ApiTags('Due Diligence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('due-diligence')
export class DueDiligenceController {
  constructor(private readonly ddService: DueDiligenceService) {}

  @Get('deal/:dealId')
  @ApiOperation({ summary: 'Get or create the DD room for a deal' })
  getOrCreateRoom(@Param('dealId', ParseUUIDPipe) dealId: string, @Request() req: any) {
    return this.ddService.getOrCreateRoom(dealId, req.user.userId, req.user.role);
  }

  @Patch('deal/:dealId/checklist/:itemId')
  @ApiOperation({ summary: 'Update a checklist item (status, notes, link document)' })
  updateChecklistItem(
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateChecklistItemDto,
    @Request() req: any,
  ) {
    return this.ddService.updateChecklistItem(itemId, dealId, req.user.userId, req.user.role, body);
  }

  @Post('deal/:dealId/documents')
  @ApiOperation({ summary: 'Upload a document to the DD room' })
  addDocument(
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Body() body: AddDocumentDto,
    @Request() req: any,
  ) {
    return this.ddService.addDocument(dealId, req.user.userId, req.user.role, body);
  }

  @Patch('deal/:dealId/documents/:documentId/review')
  @ApiOperation({ summary: 'Review a DD document (approve/flag/reject)' })
  reviewDocument(
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: ReviewDocumentDto,
    @Request() req: any,
  ) {
    return this.ddService.reviewDocument(documentId, dealId, req.user.userId, req.user.role, body);
  }
}
