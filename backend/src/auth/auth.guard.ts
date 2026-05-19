import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(req.header('authorization'));
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const device = await this.prisma.device.findUnique({
      where: { authToken: token },
      include: {
        user: {
          include: { memberships: true },
        },
      },
    });

    if (!device) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    const membership = device.user.memberships[0];
    const auth: AuthContext = {
      userId: device.userId,
      deviceId: device.id,
      groupId: membership ? membership.groupId : null,
    };
    req.auth = auth;

    // best-effort touch; ignore failures
    this.prisma.device
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }
  return value.trim();
}
