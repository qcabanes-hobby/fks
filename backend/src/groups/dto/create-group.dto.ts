import { IsString, Length } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @Length(1, 60)
  name!: string;
}
