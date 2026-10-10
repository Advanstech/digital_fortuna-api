import { Controller, Post, Get, Body, Param, UseGuards, Request, Patch, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { CreateOfferDto } from '../common/dto/offer.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Offers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Make an offer on a live listing' })
  @ApiResponse({ status: 201, description: 'Offer created' })
  @ApiResponse({ status: 400, description: 'Listing unavailable or duplicate pending offer' })
  createOffer(@Body() body: CreateOfferDto, @Request() req: any) {
    return this.offersService.createOffer(body, req.user.userId);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Offers I have made as a buyer' })
  getMyOffers(@Request() req: any) {
    return this.offersService.getMyOffers(req.user.userId);
  }

  @Get('received')
  @ApiOperation({ summary: 'Offers received on my listings as a seller' })
  getReceivedOffers(@Request() req: any) {
    return this.offersService.getReceivedOffers(req.user.userId);
  }

  @Get('listing/:listingId')
  @ApiOperation({ summary: 'Offers on a listing (seller sees all, buyers see their own)' })
  getListingOffers(@Param('listingId', ParseUUIDPipe) listingId: string, @Request() req: any) {
    return this.offersService.getListingOffers(listingId, req.user.userId);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Accept an offer (seller only). Creates a deal room.' })
  @ApiResponse({ status: 200, description: 'Offer accepted and deal created' })
  acceptOffer(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.offersService.acceptOffer(id, req.user.userId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject an offer (seller only)' })
  rejectOffer(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.offersService.rejectOffer(id, req.user.userId);
  }

  @Patch(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw a pending offer (buyer only)' })
  withdrawOffer(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.offersService.withdrawOffer(id, req.user.userId);
  }
}
