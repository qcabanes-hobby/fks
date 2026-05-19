import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateAuthToken } from '../auth/token.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(username: string): Promise<{ user: { id: string; username: string }; authToken: string }> {
    const authToken = generateAuthToken();
    const user = await this.prisma.user.create({
      data: {
        username,
        devices: { create: { authToken } },
      },
    });
    return { user: { id: user.id, username: user.username }, authToken };
  }

  async createUserAndJoinGroup(
    username: string,
    groupCode: string,
  ): Promise<{
    user: { id: string; username: string };
    group: { id: string; code: string; name: string };
    authToken: string;
  }> {
    const group = await this.prisma.group.findUnique({ where: { code: groupCode } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    await this.assertUsernameAvailableInGroup(group.id, username);

    const authToken = generateAuthToken();
    const user = await this.prisma.user.create({
      data: {
        username,
        devices: { create: { authToken } },
        memberships: { create: { groupId: group.id } },
      },
    });

    return {
      user: { id: user.id, username: user.username },
      group: { id: group.id, code: group.code, name: group.name },
      authToken,
    };
  }

  async loginByUsername(
    username: string,
    groupCode?: string,
  ): Promise<{ user: { id: string; username: string }; authToken: string }> {
    let candidates: { id: string; username: string }[];

    if (groupCode) {
      const group = await this.prisma.group.findUnique({
        where: { code: groupCode },
        include: { members: { include: { user: true } } },
      });
      if (!group) {
        throw new NotFoundException('Group not found');
      }
      candidates = group.members
        .filter((m) => m.user.username === username)
        .map((m) => ({ id: m.user.id, username: m.user.username }));
    } else {
      const users = await this.prisma.user.findMany({ where: { username } });
      candidates = users.map((u) => ({ id: u.id, username: u.username }));
    }

    if (candidates.length === 0) {
      throw new NotFoundException('User not found');
    }
    if (candidates.length > 1) {
      throw new BadRequestException('Multiple users match; provide a group code');
    }

    const userId = candidates[0]!.id;
    const authToken = generateAuthToken();
    await this.prisma.device.create({ data: { userId, authToken } });

    return { user: candidates[0]!, authToken };
  }

  private async assertUsernameAvailableInGroup(groupId: string, username: string): Promise<void> {
    const existing = await this.prisma.groupMember.findFirst({
      where: { groupId, user: { username } },
    });
    if (existing) {
      throw new ConflictException('Username already taken in this group');
    }
  }
}
