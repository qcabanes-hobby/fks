import { randomBytes } from 'crypto';

export function generateAuthToken(): string {
  return randomBytes(32).toString('base64url');
}
