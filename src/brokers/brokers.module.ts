import { Module } from '@nestjs/common';
import { BrokersController } from './brokers.controller';
import { BrokersService } from './brokers.service';
import { DbModule } from '../db/db.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DbModule, AiModule],
  controllers: [BrokersController],
  providers: [BrokersService],
})
export class BrokersModule {}
