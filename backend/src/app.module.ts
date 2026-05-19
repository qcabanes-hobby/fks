import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { GamesModule } from './games/games.module';
import { GroupsModule } from './groups/groups.module';
import { PrismaModule } from './prisma/prisma.module';
import { PushModule } from './push/push.module';
import { SignalsModule } from './signals/signals.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    GamesModule,
    PushModule,
    SignalsModule,
  ],
})
export class AppModule {}
