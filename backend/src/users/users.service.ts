import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateAuthToken } from '../auth/token.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(username: string): Promise<{ user: { id: string; username: string }; authToken: string }> {
    const authToken = generateAuthToken();
    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          devices: { create: { authToken } },
        },
      });
      return { user: { id: user.id, username: user.username }, authToken };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Username already taken');
      }
      throw e;
    }
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

    const authToken = generateAuthToken();
    try {
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
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Username already taken');
      }
      throw e;
    }
  }

  async loginByUsername(
    username: string,
  ): Promise<{ user: { id: string; username: string }; authToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const authToken = generateAuthToken();
    await this.prisma.device.create({ data: { userId: user.id, authToken } });

    return { user: { id: user.id, username: user.username }, authToken };
  }
}
