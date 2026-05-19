import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60_000;

@Injectable()
export class SignalRateLimitService {
  private readonly lastTrigger = new Map<string, number>();

  check(userId: string, gameId: string): { allowed: true } | { allowed: false; retryAfterSec: number } {
    const key = `${userId}:${gameId}`;
    const now = Date.now();
    const last = this.lastTrigger.get(key);
    if (last !== undefined && now - last < WINDOW_MS) {
      const retryAfterSec = Math.ceil((WINDOW_MS - (now - last)) / 1000);
      return { allowed: false, retryAfterSec };
    }
    this.lastTrigger.set(key, now);
    return { allowed: true };
  }
}
