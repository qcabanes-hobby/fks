import { IsString, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,20}$/, {
    message: 'username must be 3-20 chars (letters, digits, _ or -)',
  })
  username!: string;
}
