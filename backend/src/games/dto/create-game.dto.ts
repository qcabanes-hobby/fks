import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class CreateGameDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  imageUrl?: string;
}
