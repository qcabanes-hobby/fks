import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { GamesService } from './games.service';

@Controller('games')
@UseGuards(AuthGuard)
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() auth: AuthContext, @Body() dto: CreateGameDto) {
    return this.games.createGame(auth.userId, auth.groupId, dto.name, dto.imageUrl);
  }

  @Patch(':id')
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateGameDto,
  ) {
    return this.games.updateGame(auth.userId, auth.groupId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.games.deleteGame(auth.userId, auth.groupId, id);
  }

  @Post(':id/subscribe')
  @HttpCode(200)
  subscribe(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.games.subscribe(auth.userId, auth.groupId, id);
  }

  @Delete(':id/subscribe')
  @HttpCode(200)
  unsubscribe(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.games.unsubscribe(auth.userId, auth.groupId, id);
  }
}
