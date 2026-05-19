import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';
import { SignalRateLimitService } from './rate-limit.service';
import { SignalStreamService } from './signal-stream.service';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';
import { SseAuthGuard } from './sse-auth.guard';

@Module({
  imports: [AuthModule, PushModule],
  controllers: [SignalsController],
  providers: [SignalsService, SignalStreamService, SignalRateLimitService, SseAuthGuard],
})
export class SignalsModule {}
