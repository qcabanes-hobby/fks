export interface User {
  id: string;
  username: string;
}

export interface Group {
  id: string;
  code: string;
  name: string;
}

export interface Game {
  id: string;
  groupId: string;
  name: string;
  imageUrl?: string | null;
  subscribed?: boolean;
  subscriberCount?: number;
}

export interface GroupWithMembers extends Group {
  members: User[];
  games: Game[];
}

export interface Signal {
  id: string;
  gameId: string;
  gameName?: string;
  gameImageUrl?: string | null;
  triggeredById: string;
  triggeredByUsername?: string;
  triggeredAt: string;
  acceptedCount: number;
  rejectedCount?: number;
  totalSubscribers?: number;
}

export interface AuthResult {
  user: User;
  group?: Group | null;
  authToken: string;
}
