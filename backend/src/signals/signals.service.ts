import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export class RateLimitedException extends HttpException {
  constructor(public readonly retryAfterSec: number) {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests', retryAfterSec },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { SignalRateLimitService } from './rate-limit.service';
import { SignalStreamService } from './signal-stream.service';

@Injectable()
export class SignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly streams: SignalStreamService,
    private readonly rateLimit: SignalRateLimitService,
  ) {}

  async trigger(
    userId: string,
    groupId: string | null,
    gameId: string,
  ): Promise<{ signalId: string }> {
    if (!groupId) {
      throw new BadRequestException('User is not in a group');
    }
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    if (game.groupId !== groupId) {
      throw new ForbiddenException('Game does not belong to your group');
    }

    const rl = this.rateLimit.check(userId, gameId);
    if (!rl.allowed) {
      throw new RateLimitedException(rl.retryAfterSec);
    }

    const triggerer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!triggerer) {
      throw new NotFoundException('Triggerer not found');
    }

    const signal = await this.prisma.signal.create({
      data: {
        gameId,
        triggeredById: userId,
        responses: { create: { userId, response: 'accept' } },
      },
    });

    const subscribers = await this.prisma.gameSubscription.findMany({
      where: { gameId, userId: { not: userId } },
      select: { userId: true },
    });

    const payload = {
      signalId: signal.id,
      gameId: game.id,
      gameName: game.name,
      gameImageUrl: game.imageUrl,
      triggeredBy: triggerer.username,
      currentAccepted: 1,
    };

    await Promise.all(subscribers.map((s) => this.push.sendToUser(s.userId, payload)));

    this.streams.emit(signal.id, 1);
    return { signalId: signal.id };
  }

  async respond(
    userId: string,
    signalId: string,
    response: 'accept' | 'reject',
  ): Promise<{ acceptedCount: number }> {
    const signal = await this.prisma.signal.findUnique({ where: { id: signalId } });
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }

    await this.prisma.signalResponse.upsert({
      where: { signalId_userId: { signalId, userId } },
      create: { signalId, userId, response },
      update: { response, respondedAt: new Date() },
    });

    const acceptedCount = await this.prisma.signalResponse.count({
      where: { signalId, response: 'accept' },
    });
    this.streams.emit(signalId, acceptedCount);
    return { acceptedCount };
  }

  async getSignal(signalId: string) {
    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      include: {
        game: true,
        triggeredBy: true,
      },
    });
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }
    const acceptedCount = await this.prisma.signalResponse.count({
      where: { signalId, response: 'accept' },
    });
    return {
      id: signal.id,
      gameId: signal.gameId,
      gameName: signal.game.name,
      gameImageUrl: signal.game.imageUrl,
      triggeredBy: signal.triggeredBy.username,
      triggeredAt: signal.triggeredAt,
      acceptedCount,
    };
  }

  async getAcceptedCount(signalId: string): Promise<number> {
    return this.prisma.signalResponse.count({
      where: { signalId, response: 'accept' },
    });
  }
}
