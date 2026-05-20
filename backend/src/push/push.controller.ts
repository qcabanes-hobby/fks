import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  getPublicKey() {
    return { publicKey: this.push.getPublicKey() };
  }

  @Get('status')
  @UseGuards(AuthGuard)
  async status(@CurrentUser() auth: AuthContext) {
    return { subscribed: await this.push.isDeviceSubscribed(auth.deviceId) };
  }

  @Post('subscribe')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async subscribe(@CurrentUser() auth: AuthContext, @Body() dto: SubscribePushDto) {
    await this.push.saveSubscription(auth.deviceId, dto.endpoint, dto.keys.p256dh, dto.keys.auth);
    return { ok: true };
  }
}
