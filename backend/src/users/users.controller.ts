import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { JoinUserDto } from './dto/join-user.dto';
import { LoginByUsernameDto } from './dto/login-by-username.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateUserDto) {
    return this.users.createUser(dto.username);
  }

  @Post('join')
  @HttpCode(201)
  join(@Body() dto: JoinUserDto) {
    return this.users.createUserAndJoinGroup(dto.username, dto.groupCode);
  }

  @Post('me/login-by-username')
  @HttpCode(200)
  loginByUsername(@Body() dto: LoginByUsernameDto) {
    return this.users.loginByUsername(dto.username, dto.groupCode);
  }
}
