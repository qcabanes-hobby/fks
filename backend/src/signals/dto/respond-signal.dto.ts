import { IsIn, IsString } from 'class-validator';

export class RespondSignalDto {
  @IsString()
  @IsIn(['accept', 'reject'])
  response!: 'accept' | 'reject';
}
