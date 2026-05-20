import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Sse,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Observable, defer, from, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthGuard } from '../auth/auth.guard';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateSignalDto } from './dto/create-signal.dto';
import { RespondSignalDto } from './dto/respond-signal.dto';
import { RateLimitedExceptionFilter } from './rate-limit.filter';
import { SignalStreamService } from './signal-stream.service';
import { SignalsService } from './signals.service';
import { SseAuthGuard } from './sse-auth.guard';

@Controller()
export class SignalsController {
  constructor(
    private readonly signals: SignalsService,
    private readonly streams: SignalStreamService,
  ) {}

  @Post('signals')
  @HttpCode(201)
  @UseGuards(AuthGuard)
  @UseFilters(RateLimitedExceptionFilter)
  trigger(@CurrentUser() auth: AuthContext, @Body() dto: CreateSignalDto) {
    return this.signals.trigger(auth.userId, auth.groupId, dto.gameId);
  }

  @Post('signals/:id/respond')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  respond(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: RespondSignalDto,
  ) {
    return this.signals.respond(auth.userId, id, dto.response);
  }

  @Get('signals/pending')
  @UseGuards(AuthGuard)
  pending(@CurrentUser() auth: AuthContext) {
    return this.signals.getPendingForUser(auth.userId, auth.groupId);
  }

  @Get('signals/:id')
  @UseGuards(AuthGuard)
  get(@Param('id') id: string) {
    return this.signals.getSignal(id);
  }

  @Post('signals/:id/close')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  close(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.signals.closeSignal(auth.userId, id);
  }

  @Sse('/sse/signals/:id')
  @UseGuards(SseAuthGuard)
  sseStream(
    @Param('id') id: string,
  ): Observable<{ data: { acceptedCount: number; rejectedCount: number; closed?: boolean } }> {
    const initial$ = defer(() => from(this.signals.getCountsWithClosed(id)));
    const updates$ = this.streams.stream(id);
    return merge(initial$, updates$).pipe(map((counts) => ({ data: counts })));
  }
}
