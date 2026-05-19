import { IsOptional, IsString, Matches } from 'class-validator';

export class LoginByUsernameDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,20}$/, {
    message: 'username must be 3-20 chars (letters, digits, _ or -)',
  })
  username!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-HJ-NP-Z2-9]{5}$/, { message: 'invalid group code' })
  groupCode?: string;
}
