import { IsString } from 'class-validator';

export class CreateSignalDto {
  @IsString()
  gameId!: string;
}
