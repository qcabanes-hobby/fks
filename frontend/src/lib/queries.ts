import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';
import { setActiveSignal, setToken } from './auth';
import type { AuthResult, Game, Group, GroupWithMembers, Signal, User } from './types';

export const qk = {
  me: ['me'] as const,
  group: ['group'] as const,
  games: ['games'] as const,
  signal: (id: string) => ['signal', id] as const,
};

export function useMe() {
  return useQuery<User>({
    queryKey: qk.me,
    queryFn: () => apiRequest<User>('/api/users/me'),
  });
}

export function useGroup(enabled = true) {
  return useQuery<GroupWithMembers>({
    queryKey: qk.group,
    queryFn: () => apiRequest<GroupWithMembers>('/api/groups/me'),
    enabled,
  });
}

interface CreateUserInput {
  username: string;
}
export function useCreateUser() {
  return useMutation<AuthResult, Error, CreateUserInput>({
    mutationFn: (input) => apiRequest<AuthResult>('/api/users', { method: 'POST', body: input, auth: false }),
    onSuccess: (res) => {
      setToken(res.authToken);
    },
  });
}

interface JoinGroupInput {
  username: string;
  groupCode: string;
}
export function useJoinGroup() {
  return useMutation<AuthResult, Error, JoinGroupInput>({
    mutationFn: (input) => apiRequest<AuthResult>('/api/users/join', { method: 'POST', body: input, auth: false }),
    onSuccess: (res) => {
      setToken(res.authToken);
    },
  });
}

interface LoginByUsernameInput {
  username: string;
}
export function useLoginByUsername() {
  return useMutation<AuthResult, Error, LoginByUsernameInput>({
    mutationFn: (input) =>
      apiRequest<AuthResult>('/api/users/me/login-by-username', { method: 'POST', body: input, auth: false }),
    onSuccess: (res) => {
      setToken(res.authToken);
    },
  });
}

interface CreateGroupInput {
  name: string;
}
export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation<{ group: Group }, Error, CreateGroupInput>({
    mutationFn: (input) => apiRequest<{ group: Group }>('/api/groups', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.group });
    },
  });
}

interface JoinGroupByCodeInput {
  code: string;
}
export function useJoinGroupByCode() {
  const qc = useQueryClient();
  return useMutation<{ group: Group }, Error, JoinGroupByCodeInput>({
    mutationFn: (input) => apiRequest<{ group: Group }>('/api/groups/join', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.group });
    },
  });
}

export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => apiRequest<void>('/api/groups/me', { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.group });
      qc.invalidateQueries({ queryKey: qk.games });
    },
  });
}

export function useGames() {
  return useQuery<Game[]>({
    queryKey: qk.games,
    queryFn: async () => {
      const group = await apiRequest<GroupWithMembers>('/api/groups/me');
      return group.games ?? [];
    },
  });
}

interface CreateGameInput {
  name: string;
  imageUrl?: string;
}
export function useCreateGame() {
  const qc = useQueryClient();
  return useMutation<Game, Error, CreateGameInput>({
    mutationFn: (input) => apiRequest<Game>('/api/games', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.games });
      qc.invalidateQueries({ queryKey: qk.group });
    },
  });
}

export function useUpdateGame() {
  const qc = useQueryClient();
  return useMutation<Game, Error, { id: string; patch: { name?: string; imageUrl?: string } }>({
    mutationFn: ({ id, patch }) =>
      apiRequest<Game>(`/api/games/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.games });
      qc.invalidateQueries({ queryKey: qk.group });
    },
  });
}

export function useDeleteGame() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiRequest<void>(`/api/games/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.games });
      qc.invalidateQueries({ queryKey: qk.group });
    },
  });
}

export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (gameId) => apiRequest<void>(`/api/games/${gameId}/subscribe`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.games });
      qc.invalidateQueries({ queryKey: qk.group });
    },
  });
}

export function useUnsubscribe() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (gameId) => apiRequest<void>(`/api/games/${gameId}/subscribe`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.games });
      qc.invalidateQueries({ queryKey: qk.group });
    },
  });
}

interface TriggerSignalInput {
  gameId: string;
}
export function useTriggerSignal() {
  return useMutation<{ signalId: string }, Error, TriggerSignalInput>({
    mutationFn: (input) => apiRequest<{ signalId: string }>('/api/signals', { method: 'POST', body: input }),
    onSuccess: (res) => {
      setActiveSignal(res.signalId);
    },
  });
}

interface RespondInput {
  signalId: string;
  response: 'accept' | 'reject';
}
export function useRespondToSignal() {
  const qc = useQueryClient();
  return useMutation<void, Error, RespondInput>({
    mutationFn: ({ signalId, response }) =>
      apiRequest<void>(`/api/signals/${signalId}/respond`, { method: 'POST', body: { response } }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.signal(vars.signalId) });
    },
  });
}

export function useCloseSignal() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (signalId) => apiRequest<void>(`/api/signals/${signalId}/close`, { method: 'POST' }),
    onSuccess: (_d, signalId) => {
      qc.invalidateQueries({ queryKey: qk.signal(signalId) });
    },
  });
}

export async function fetchPendingSignal(): Promise<{ signalId: string } | null> {
  return apiRequest<{ signalId: string } | null>('/api/signals/pending');
}

export async function reportSignalDelivered(signalId: string): Promise<void> {
  try {
    await apiRequest<unknown>(`/api/signals/${signalId}/delivered`, { method: 'POST' });
  } catch {}
}

export function useSignal(signalId: string | undefined, options?: { refetchInterval?: number | false }) {
  return useQuery<Signal>({
    queryKey: signalId ? qk.signal(signalId) : ['signal', 'none'],
    queryFn: () => apiRequest<Signal>(`/api/signals/${signalId}`),
    enabled: !!signalId,
    refetchInterval: options?.refetchInterval ?? false,
  });
}
