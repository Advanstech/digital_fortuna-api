import { Controller, Post, Get, Body, Param, UseGuards, Request, Patch, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { KycGuard } from '../auth/kyc.guard';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

class CreateDealDto {
  @IsUUID()
  listingId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  agreedPrice?: number;
}

class SendMessageDto {
  @IsString()
  @MaxLength(5000)
  content!: string;
}

class UpdateDealStatusDto {
  @IsEnum(['negotiation', 'loi_signed', 'due_diligence', 'apa_signed', 'escrow', 'closed', 'cancelled'])
  status!: 'negotiation' | 'loi_signed' | 'due_diligence' | 'apa_signed' | 'escrow' | 'closed' | 'cancelled';
}

class GenerateDocumentDto {
  @IsEnum(['loi', 'apa'])
  documentType!: 'loi' | 'apa';
}

@ApiTags('Deals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @UseGuards(KycGuard)
  @Post()
  @ApiOperation({ summary: 'Open a deal room on a live listing' })
  createDeal(@Request() req: any, @Body() body: CreateDealDto) {
    return this.dealsService.createDeal(body.listingId, req.user.userId, body.agreedPrice);
  }

  @Get('my-deals')
  @ApiOperation({ summary: 'Deals where I am buyer or seller' })
  getUserDeals(@Request() req: any) {
    return this.dealsService.getUserDeals(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a deal (participants only)' })
  getDeal(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.dealsService.getDeal(id, req.user.userId, req.user.role);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message in a deal room' })
  sendMessage(@Param('id', ParseUUIDPipe) id: string, @Request() req: any, @Body() body: SendMessageDto) {
    return this.dealsService.sendMessage(id, req.user.userId, body.content, req.user.role);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'List messages in a deal room' })
  getMessages(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.dealsService.getMessages(id, req.user.userId, req.user.role);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Advance the deal status along the acquisition pipeline' })
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDealStatusDto, @Request() req: any) {
    return this.dealsService.updateDealStatus(id, body.status, req.user.userId, req.user.role);
  }

  @Post(':id/generate-document')
  @ApiOperation({ summary: 'Generate an LOI or APA with AI for this deal' })
  generateLegalDocument(@Param('id', ParseUUIDPipe) id: string, @Body() body: GenerateDocumentDto, @Request() req: any) {
    return this.dealsService.generateLegalDocument(id, body.documentType, req.user.userId, req.user.role);
  }
}
