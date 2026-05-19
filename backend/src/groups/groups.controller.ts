import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateGroupDto } from './dto/create-group.dto';
import { JoinGroupDto } from './dto/join-group.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() auth: AuthContext, @Body() dto: CreateGroupDto) {
    return this.groups.createGroup(auth.userId, dto.name);
  }

  @Post('join')
  @HttpCode(200)
  join(@CurrentUser() auth: AuthContext, @Body() dto: JoinGroupDto) {
    return this.groups.joinGroup(auth.userId, dto.code);
  }

  @Get('me')
  me(@CurrentUser() auth: AuthContext) {
    return this.groups.getMyGroup(auth.userId);
  }

  @Delete('me')
  @HttpCode(204)
  leave(@CurrentUser() auth: AuthContext) {
    return this.groups.leaveGroup(auth.userId);
  }
}
