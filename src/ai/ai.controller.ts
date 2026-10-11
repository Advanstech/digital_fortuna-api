import { Controller, Post, Body } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Public()
  @Post('autofill-listing')
  async autofillListing(@Body() body: { urlOrText: string }) {
    return this.aiService.extractListingFromInput(body.urlOrText || '');
  }

  @Post('due-diligence')
  async generateDueDiligence(@Body() body: any) {
    return this.aiService.generateDueDiligenceReport(body.listingDetails);
  }

  @Post('optimize-listing')
  async optimizeListing(@Body() body: { title: string; description: string }) {
    return this.aiService.optimizeListing(body.title, body.description);
  }
}
