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
    // Null out any *other* device row that's currently holding this endpoint
    // before claiming it here. Without this, the unique index on
    // pushEndpoint would error on re-onboarding / IDB-clear flows where the
    // browser hands the same endpoint to a new Device row.
    await this.prisma.$transaction([
      this.prisma.device.updateMany({
        where: { pushEndpoint: endpoint, NOT: { id: deviceId } },
        data: { pushEndpoint: null, pushP256dh: null, pushAuth: null },
      }),
      this.prisma.device.update({
        where: { id: deviceId },
        data: { pushEndpoint: endpoint, pushP256dh: p256dh, pushAuth: auth },
      }),
    ]);
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
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await webpush.sendNotification(
          { endpoint, keys: { p256dh, auth } },
          body,
          { urgency: 'high' },
        );
        return;
      } catch (err) {
        lastErr = err;
        const statusCode = (err as { statusCode?: number }).statusCode;
        // Permanent: subscription is gone or rejected. Clear it so the
        // client re-prompts for permission/re-subscribes on next visit.
        if (statusCode === 403 || statusCode === 404 || statusCode === 410) {
          await this.clearPushFields(deviceId);
          return;
        }
        // Other 4xx (e.g., 413 payload too large, 400 bad VAPID): logging
        // only — retrying won't help and the endpoint isn't necessarily dead.
        if (statusCode && statusCode >= 400 && statusCode < 500) {
          this.logger.warn(
            `web-push ${statusCode} for device ${deviceId} (no retry): ${(err as Error).message}`,
          );
          return;
        }
        // 5xx or network error: retry with backoff.
        if (attempt < maxAttempts - 1) {
          await sleep(50 * 2 ** attempt);
          continue;
        }
      }
    }
    this.logger.warn(
      `web-push failed after ${maxAttempts} attempts for device ${deviceId}: ${(lastErr as Error)?.message}`,
    );
  }

  private async clearPushFields(deviceId: string): Promise<void> {
    await this.prisma.device
      .update({
        where: { id: deviceId },
        data: { pushEndpoint: null, pushP256dh: null, pushAuth: null },
      })
      .catch(() => undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
