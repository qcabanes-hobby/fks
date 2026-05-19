import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/auth.types';

@Injectable()
export class SseAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = typeof req.query.token === 'string' ? req.query.token : null;
    if (!token) {
      throw new UnauthorizedException('Missing token query parameter');
    }

    const device = await this.prisma.device.findUnique({
      where: { authToken: token },
      include: { user: { include: { memberships: true } } },
    });
    if (!device) {
      throw new UnauthorizedException('Invalid token');
    }

    const membership = device.user.memberships[0];
    const auth: AuthContext = {
      userId: device.userId,
      deviceId: device.id,
      groupId: membership ? membership.groupId : null,
    };
    req.auth = auth;
    return true;
  }
}
