export interface AuthContext {
  userId: string;
  deviceId: string;
  groupId: string | null;
}

declare module 'express' {
  interface Request {
    auth?: AuthContext;
  }
}
