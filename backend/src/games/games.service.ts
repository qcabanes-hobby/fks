import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  async createGame(userId: string, groupId: string | null, name: string, imageUrl?: string) {
    if (!groupId) {
      throw new BadRequestException('User is not in a group');
    }
    const game = await this.prisma.game.create({
      data: { groupId, name, imageUrl: imageUrl ?? null },
    });
    return {
      id: game.id,
      name: game.name,
      imageUrl: game.imageUrl,
      minAccepts: game.minAccepts,
      createdAt: game.createdAt,
    };
  }

  async updateGame(
    userId: string,
    groupId: string | null,
    gameId: string,
    patch: { name?: string; imageUrl?: string; minAccepts?: number },
  ) {
    await this.assertMemberOfGameGroup(groupId, gameId);
    const data: { name?: string; imageUrl?: string | null; minAccepts?: number } = {};
    if (patch.name !== undefined) {
      data.name = patch.name;
    }
    if (patch.imageUrl !== undefined) {
      data.imageUrl = patch.imageUrl;
    }
    if (patch.minAccepts !== undefined) {
      data.minAccepts = patch.minAccepts;
    }
    const game = await this.prisma.game.update({ where: { id: gameId }, data });
    return {
      id: game.id,
      name: game.name,
      imageUrl: game.imageUrl,
      minAccepts: game.minAccepts,
      createdAt: game.createdAt,
    };
  }

  async deleteGame(userId: string, groupId: string | null, gameId: string): Promise<void> {
    await this.assertMemberOfGameGroup(groupId, gameId);
    await this.prisma.game.delete({ where: { id: gameId } });
  }

  async subscribe(userId: string, groupId: string | null, gameId: string) {
    await this.assertMemberOfGameGroup(groupId, gameId);
    await this.prisma.gameSubscription.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: { userId, gameId },
      update: {},
    });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, groupId: string | null, gameId: string) {
    await this.assertMemberOfGameGroup(groupId, gameId);
    await this.prisma.gameSubscription
      .delete({ where: { userId_gameId: { userId, gameId } } })
      .catch(() => undefined);
    return { subscribed: false };
  }

  private async assertMemberOfGameGroup(groupId: string | null, gameId: string): Promise<void> {
    if (!groupId) {
      throw new ForbiddenException('User is not in a group');
    }
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    if (game.groupId !== groupId) {
      throw new ForbiddenException('Game does not belong to your group');
    }
  }
}
