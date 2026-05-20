import { IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';

export class UpdateGameDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(50)
  minAccepts?: number;
}
