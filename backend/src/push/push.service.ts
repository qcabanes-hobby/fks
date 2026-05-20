import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private publicKey = '';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) {
      throw new Error(
        'Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT environment variables',
      );
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  async saveSubscription(
    deviceId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
  ): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { pushEndpoint: endpoint, pushP256dh: p256dh, pushAuth: auth },
    });
  }

  async isDeviceSubscribed(deviceId: string): Promise<boolean> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { pushEndpoint: true, pushP256dh: true, pushAuth: true },
    });
    return !!(device?.pushEndpoint && device?.pushP256dh && device?.pushAuth);
  }

  async sendToUser(userId: string, payload: Record<string, unknown>): Promise<void> {
    const devices = await this.prisma.device.findMany({
      where: {
        userId,
        pushEndpoint: { not: null },
        pushP256dh: { not: null },
        pushAuth: { not: null },
      },
    });

    const body = JSON.stringify(payload);
    await Promise.all(devices.map((d) => this.sendToDevice(d.id, d.pushEndpoint!, d.pushP256dh!, d.pushAuth!, body)));
  }

  private async sendToDevice(
    deviceId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    body: string,
  ): Promise<void> {
    try {
      await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, body);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.device
          .update({
            where: { id: deviceId },
            data: { pushEndpoint: null, pushP256dh: null, pushAuth: null },
          })
          .catch(() => undefined);
        return;
      }
      this.logger.warn(`web-push error for device ${deviceId}: ${(err as Error).message}`);
    }
  }
}
