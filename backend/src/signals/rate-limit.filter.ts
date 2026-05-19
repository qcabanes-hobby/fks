import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { RateLimitedException } from './signals.service';

@Catch(RateLimitedException)
export class RateLimitedExceptionFilter implements ExceptionFilter {
  catch(exception: RateLimitedException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.setHeader('Retry-After', String(exception.retryAfterSec));
    res.status(exception.getStatus()).json(exception.getResponse());
  }
}
