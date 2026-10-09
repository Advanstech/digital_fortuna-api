import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { DbModule } from '../db/db.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DbModule, AiModule],
  controllers: [DealsController],
  providers: [DealsService],
})
export class DealsModule {}
