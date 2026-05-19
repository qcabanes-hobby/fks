import { IsString, Matches } from 'class-validator';

export class JoinGroupDto {
  @IsString()
  @Matches(/^[A-HJ-NP-Z2-9]{5}$/, { message: 'invalid group code' })
  code!: string;
}
