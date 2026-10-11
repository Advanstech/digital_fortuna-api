import { Module } from '@nestjs/common';
import { ValuationController } from './valuation.controller';
import { ValuationService } from './valuation.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ValuationController],
  providers: [ValuationService],
  exports: [ValuationService],
})
export class ValuationModule {}
