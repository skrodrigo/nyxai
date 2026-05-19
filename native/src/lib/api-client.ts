import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UIMessage } from 'ai';

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: string;
  updatedAt: string;
};

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

type ChatStreamEvent =
  | { type: 'chat.created'; chatId: string; branchId?: string | null; assistantMessageId?: string }
  | { type: 'response.output_text.delta'; delta: string }
  | { type: 'response.completed'; chatId: string; branchId?: string | null }
  | { type: 'chat.title'; title: string }
  | { type: 'response.error'; error: string };

function getApiBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is not configured');
  }
  return baseUrl.replace(/\/$/, '');
}

function resolveUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

async function parseResponseError(response: Response) {
  const body = await response.json().catch(() => null);
  const message = body?.error || body?.message || response.statusText || `Request failed (${response.status})`;
  return new Error(message);
}

export async function requestApi<T>(path: string, options: RequestOptions = {}) {
  const storedToken = await AsyncStorage.getItem('session');
  const token = options.token ?? storedToken;

  const response = await fetch(resolveUrl(path), {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    throw await parseResponseError(response);
  }

  return (await response.json()) as T;
}

function parseSseLines(buffer: string) {
  const parts = buffer.split('\n\n');
  return {
    complete: parts.slice(0, -1),
    rest: parts[parts.length - 1] ?? '',
  };
}

function extractData(block: string) {
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) {
      return line.slice(5).trim();
    }
  }
  return '';
}

export const authApi = {
  register(data: { name: string; email: string; password: string }) {
    return requestApi<{ otpRequired?: boolean }>('/api/auth/register', {
      method: 'POST',
      body: data,
    });
  },
  login(data: { email: string; password: string }) {
    return requestApi<{ token?: string; otpRequired?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: data,
    });
  },
  me(token: string) {
    return requestApi<ApiUser>('/api/auth/me', { token });
  },
  requestOtp(email: string) {
    return requestApi<{ success: boolean }>('/api/auth/otp/request', {
      method: 'POST',
      body: { email },
    });
  },
  verifyOtp(email: string, code: string) {
    return requestApi<{ token: string }>('/api/auth/otp/verify', {
      method: 'POST',
      body: { email, code },
    });
  },
};

export const chatsApi = {
  list(token?: string | null) {
    return requestApi<{ success: boolean; data: Array<{ id: string; title: string; updatedAt: string; pinnedAt?: string | null }> }>('/api/chats', { token });
  },
  getById(id: string, token?: string | null, branchId?: string | null) {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return requestApi<{ success: boolean; data: { id: string; title: string; activeBranchId?: string | null; messages: any[] } }>(`/api/chats/${id}${query}`, { token });
  },
};

export const chatApi = {
  async streamChat(params: {
    token?: string | null;
    body: {
      messages: UIMessage[];
      model?: string;
      webSearch?: boolean;
      chatId?: string;
      branchId?: string | null;
    };
    onEvent: (event: ChatStreamEvent) => void;
  }) {
    const storedToken = await AsyncStorage.getItem('session');
    const token = params.token ?? storedToken;

    const response = await fetch(resolveUrl('/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(params.body),
    });

    if (!response.ok) {
      throw await parseResponseError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No stream reader available');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { complete, rest } = parseSseLines(buffer);
      buffer = rest;

      for (const block of complete) {
        const data = extractData(block);
        if (!data || data === '[DONE]') continue;

        const payload = JSON.parse(data);
        if (!payload?.type) continue;

        if (payload.type === 'chat.created') {
          params.onEvent({
            type: 'chat.created',
            chatId: payload.chatId,
            branchId: payload.branchId ?? null,
            assistantMessageId: payload.assistantMessageId,
          });
        } else if (payload.type === 'response.output_text.delta') {
          params.onEvent({ type: 'response.output_text.delta', delta: payload.delta || '' });
        } else if (payload.type === 'response.completed') {
          params.onEvent({
            type: 'response.completed',
            chatId: payload.chatId,
            branchId: payload.branchId ?? null,
          });
        } else if (payload.type === 'chat.title') {
          params.onEvent({ type: 'chat.title', title: payload.title || '' });
        } else if (payload.type === 'response.error') {
          params.onEvent({ type: 'response.error', error: payload.error || 'Unknown error' });
        }
      }
    }
  },
};
