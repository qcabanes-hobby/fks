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

    const ownSubscription = await this.prisma.gameSubscription.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });
    if (!ownSubscription) {
      throw new BadRequestException('Subscribe to this game before sending a signal');
    }

    const otherSubscriberCount = await this.prisma.gameSubscription.count({
      where: { gameId, userId: { not: userId } },
    });
    if (otherSubscriberCount < 1) {
      throw new BadRequestException('Need at least one other subscriber to send a signal');
    }

    const openSignal = await this.prisma.signal.findFirst({
      where: { gameId, closedAt: null },
      select: { id: true },
    });
    if (openSignal) {
      throw new BadRequestException('A signal is already pending for this game');
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

    this.streams.emit(signal.id, { acceptedCount: 1, rejectedCount: 0, deliveredCount: 0 });
    return { signalId: signal.id };
  }

  async markDelivered(
    userId: string,
    signalId: string,
  ): Promise<{ acceptedCount: number; rejectedCount: number; deliveredCount: number; closed: boolean }> {
    const signal = await this.prisma.signal.findUnique({ where: { id: signalId } });
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }
    if (signal.triggeredById === userId) {
      return this.getCountsWithClosed(signalId);
    }
    const subscription = await this.prisma.gameSubscription.findUnique({
      where: { userId_gameId: { userId, gameId: signal.gameId } },
    });
    if (!subscription) {
      throw new ForbiddenException('Not a subscriber of this game');
    }
    await this.prisma.signalDelivery.upsert({
      where: { signalId_userId: { signalId, userId } },
      create: { signalId, userId },
      update: {},
    });
    const payload = await this.getCountsWithClosed(signalId);
    this.streams.emit(signalId, payload);
    return payload;
  }

  async respond(
    userId: string,
    signalId: string,
    response: 'accept' | 'reject',
  ): Promise<{ acceptedCount: number; rejectedCount: number; deliveredCount: number; closed: boolean }> {
    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      include: { game: true },
    });
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }
    if (signal.closedAt) {
      throw new BadRequestException('Signal is closed');
    }

    await this.prisma.$transaction([
      this.prisma.signalResponse.upsert({
        where: { signalId_userId: { signalId, userId } },
        create: { signalId, userId, response },
        update: { response, respondedAt: new Date() },
      }),
      this.prisma.signalDelivery.upsert({
        where: { signalId_userId: { signalId, userId } },
        create: { signalId, userId },
        update: {},
      }),
    ]);

    const counts = await this.getCounts(signalId);
    const allDone = await this.allSubscribersResponded(signal.gameId, signal.triggeredById, signalId);
    const thresholdReached = counts.acceptedCount >= signal.game.minAccepts;
    const shouldClose = allDone || thresholdReached;
    if (shouldClose) {
      await this.prisma.signal.update({ where: { id: signalId }, data: { closedAt: new Date() } });
    }
    if (thresholdReached && !allDone) {
      await this.broadcastCrewAssembled(signal.id, signal.gameId, signal.game.name, signal.triggeredById, counts.acceptedCount);
    }
    const payload = { ...counts, closed: shouldClose };
    this.streams.emit(signalId, payload);
    return payload;
  }

  private async broadcastCrewAssembled(
    signalId: string,
    gameId: string,
    gameName: string,
    triggererId: string,
    acceptedCount: number,
  ): Promise<void> {
    const [accepted, subscribers] = await Promise.all([
      this.prisma.signalResponse.findMany({
        where: { signalId, response: 'accept', userId: { not: triggererId } },
        select: { userId: true },
      }),
      this.prisma.gameSubscription.findMany({
        where: { gameId, userId: { not: triggererId } },
        select: { userId: true },
      }),
    ]);
    const respondedAccept = new Set(accepted.map((a) => a.userId));
    const pending = subscribers.filter((s) => !respondedAccept.has(s.userId));

    const crewPayload = { signalId, type: 'crew-assembled' as const, gameName, acceptedCount };
    const cancelPayload = { signalId, type: 'cancel' as const };

    await Promise.all([
      ...accepted.map((a) => this.push.sendToUser(a.userId, crewPayload)),
      ...pending.map((p) => this.push.sendToUser(p.userId, cancelPayload)),
    ]);
  }

  private async allSubscribersResponded(
    gameId: string,
    triggererId: string,
    signalId: string,
  ): Promise<boolean> {
    const [subscribers, responses] = await Promise.all([
      this.prisma.gameSubscription.findMany({
        where: { gameId, userId: { not: triggererId } },
        select: { userId: true },
      }),
      this.prisma.signalResponse.findMany({
        where: { signalId },
        select: { userId: true },
      }),
    ]);
    const respondedIds = new Set(responses.map((r) => r.userId));
    return subscribers.every((s) => respondedIds.has(s.userId));
  }

  async closeSignal(userId: string, signalId: string): Promise<void> {
    const signal = await this.prisma.signal.findUnique({ where: { id: signalId } });
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }
    if (signal.triggeredById !== userId) {
      throw new ForbiddenException('Only the sender can close this signal');
    }
    if (signal.closedAt) return;

    await this.prisma.signal.update({
      where: { id: signalId },
      data: { closedAt: new Date() },
    });

    const subscribers = await this.prisma.gameSubscription.findMany({
      where: { gameId: signal.gameId, userId: { not: userId } },
      select: { userId: true },
    });
    const responders = await this.prisma.signalResponse.findMany({
      where: { signalId },
      select: { userId: true },
    });
    const respondedIds = new Set(responders.map((r) => r.userId));
    const pending = subscribers.filter((s) => !respondedIds.has(s.userId));

    const payload = { signalId, type: 'cancel' as const };
    await Promise.all(pending.map((p) => this.push.sendToUser(p.userId, payload)));
  }

  async getSignal(signalId: string, viewerId?: string) {
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
    const [counts, totalSubscribers, viewerResponse] = await Promise.all([
      this.getCounts(signalId),
      this.prisma.gameSubscription.count({ where: { gameId: signal.gameId } }),
      viewerId
        ? this.prisma.signalResponse.findUnique({
            where: { signalId_userId: { signalId, userId: viewerId } },
            select: { response: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      id: signal.id,
      gameId: signal.gameId,
      gameName: signal.game.name,
      gameImageUrl: signal.game.imageUrl,
      triggeredBy: signal.triggeredBy.username,
      triggeredByUsername: signal.triggeredBy.username,
      triggeredAt: signal.triggeredAt,
      closedAt: signal.closedAt,
      acceptedCount: counts.acceptedCount,
      rejectedCount: counts.rejectedCount,
      deliveredCount: counts.deliveredCount,
      totalSubscribers,
      minAccepts: signal.game.minAccepts,
      userResponse: (viewerResponse?.response as 'accept' | 'reject' | undefined) ?? null,
    };
  }

  async getPendingForUser(userId: string, groupId: string | null) {
    if (!groupId) return null;
    const signal = await this.prisma.signal.findFirst({
      where: {
        closedAt: null,
        triggeredById: { not: userId },
        game: {
          groupId,
          subscriptions: { some: { userId } },
        },
        responses: { none: { userId } },
      },
      orderBy: { triggeredAt: 'desc' },
      select: { id: true },
    });
    return signal ? { signalId: signal.id } : null;
  }

  async getCounts(
    signalId: string,
  ): Promise<{ acceptedCount: number; rejectedCount: number; deliveredCount: number }> {
    const [acceptedCount, rejectedCount, deliveredCount] = await Promise.all([
      this.prisma.signalResponse.count({ where: { signalId, response: 'accept' } }),
      this.prisma.signalResponse.count({ where: { signalId, response: 'reject' } }),
      this.prisma.signalDelivery.count({ where: { signalId } }),
    ]);
    return { acceptedCount, rejectedCount, deliveredCount };
  }

  async getCountsWithClosed(
    signalId: string,
  ): Promise<{ acceptedCount: number; rejectedCount: number; deliveredCount: number; closed: boolean }> {
    const [counts, signal] = await Promise.all([
      this.getCounts(signalId),
      this.prisma.signal.findUnique({ where: { id: signalId }, select: { closedAt: true } }),
    ]);
    return { ...counts, closed: !!signal?.closedAt };
  }
}
