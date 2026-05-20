import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateGroupCode } from './group-code.util';

const MAX_CODE_RETRIES = 8;

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(userId: string, name: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.memberships.length > 0) {
      throw new BadRequestException('User already belongs to a group');
    }

    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
      const code = generateGroupCode();
      try {
        const group = await this.prisma.group.create({
          data: {
            code,
            name,
            members: { create: { userId } },
          },
        });
        return { group: { id: group.id, code: group.code, name: group.name } };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as string[] | undefined)?.includes('code')
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new InternalServerErrorException('Could not generate unique group code');
  }

  async joinGroup(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.memberships.length > 0) {
      throw new BadRequestException('User already belongs to a group');
    }

    const group = await this.prisma.group.findUnique({ where: { code } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const dup = await this.prisma.groupMember.findFirst({
      where: { groupId: group.id, user: { username: user.username } },
    });
    if (dup) {
      throw new ConflictException('Username already taken in this group');
    }

    await this.prisma.groupMember.create({ data: { userId, groupId: group.id } });
    return { group: { id: group.id, code: group.code, name: group.name } };
  }

  async leaveGroup(userId: string): Promise<void> {
    const membership = await this.prisma.groupMember.findFirst({ where: { userId } });
    if (!membership) {
      throw new NotFoundException('Not in a group');
    }
    const { groupId } = membership;
    await this.prisma.$transaction(async (tx) => {
      await tx.gameSubscription.deleteMany({
        where: { userId, game: { groupId } },
      });
      await tx.groupMember.delete({
        where: { userId_groupId: { userId, groupId } },
      });
      const remaining = await tx.groupMember.count({ where: { groupId } });
      if (remaining === 0) {
        await tx.group.delete({ where: { id: groupId } });
      }
    });
  }

  async getMyGroup(userId: string) {
    const membership = await this.prisma.groupMember.findFirst({
      where: { userId },
      include: {
        group: {
          include: {
            members: { include: { user: true } },
            games: {
              include: {
                subscriptions: { where: { userId } },
                _count: { select: { subscriptions: true } },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
    if (!membership) {
      throw new NotFoundException('Not in a group');
    }
    const { group } = membership;
    return {
      id: group.id,
      code: group.code,
      name: group.name,
      createdAt: group.createdAt,
      members: group.members.map((m) => ({
        id: m.user.id,
        username: m.user.username,
        joinedAt: m.joinedAt,
      })),
      games: group.games.map((g) => ({
        id: g.id,
        name: g.name,
        imageUrl: g.imageUrl,
        minAccepts: g.minAccepts,
        createdAt: g.createdAt,
        subscribed: g.subscriptions.length > 0,
        subscriberCount: g._count.subscriptions,
      })),
    };
  }
}
