import { Injectable } from '@angular/core';

import type {
  InviteInfo,
  Me,
  SeatGrant,
} from '../../shared/protocol';

@Injectable({ providedIn: 'root' })
export class Api {
  avatarsTaken(code: string): Promise<{ taken: string[] }> {
    return request(
      `/api/join/avatars?code=${encodeURIComponent(code)}`,
    );
  }

  createGame(settings: {
    avatar?: string;
    mode: 'classic' | 'tycoon';
    secretHoldings: boolean;
  }): Promise<SeatGrant> {
    return request('/api/games', {
      body: JSON.stringify(settings),
      method: 'POST',
    });
  }

  invite(gameId: string): Promise<InviteInfo> {
    return request(
      `/api/games/${encodeURIComponent(gameId)}/invites`,
      {
        method: 'POST',
      },
    );
  }

  join(
    code: string,
    name: string,
    avatar?: string,
  ): Promise<SeatGrant> {
    return request('/api/join', {
      body: JSON.stringify({ avatar, code, name }),
      method: 'POST',
    });
  }

  async logout(): Promise<void> {
    await request('/auth/logout', { method: 'POST' });
  }

  me(): Promise<Me | null> {
    return request<Me>('/api/me').catch(() => null);
  }
}

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: init?.body
      ? { 'content-type': 'application/json' }
      : {},
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (body as { error?: string }).error ?? response.statusText,
    );
  }
  return body as T;
}
