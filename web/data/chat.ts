type ChatStreamEvent =
  | { type: 'chat.created'; chatId: string; branchId?: string | null; assistantMessageId?: string }
  | { type: 'response.output_text.delta'; delta: string }
  | { type: 'response.completed'; chatId: string; branchId?: string | null }
  | { type: 'chat.title'; title: string }
  | { type: 'response.error'; error: string };

function parseSseLines(buffer: string) {
  const parts = buffer.split('\n\n');
  const complete = parts.slice(0, -1);
  const rest = parts[parts.length - 1] ?? '';
  return { complete, rest };
}

function extractData(block: string) {
  const lines = block.split('\n');
  for (const line of lines) {
    if (line.startsWith('data:')) {
      return line.slice('data:'.length).trim();
    }
  }
  return '';
}

export const chatService = {
  async streamChat(params: {
    body: any;
    onEvent: (ev: ChatStreamEvent) => void;
  }) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params.body),
      cache: 'no-store',
    });

    if (!res.ok) {
      let err: any = null;
      try {
        err = await res.json();
      } catch {
      }
      const code = err?.statusCode ?? res.status;
      throw new Error(JSON.stringify({ statusCode: code, error: err?.error || `Chat request failed (${code})` }));
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No reader available');

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
        if (!data) continue;
        if (data === '[DONE]') return;

        let json: any;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }

        if (!json?.type) continue;

        if (json.type === 'chat.created') {
          params.onEvent({ type: 'chat.created', chatId: json.chatId, branchId: json.branchId ?? null, assistantMessageId: json.assistantMessageId });
        } else if (json.type === 'response.output_text.delta') {
          params.onEvent({ type: 'response.output_text.delta', delta: json.delta || '' });
        } else if (json.type === 'response.completed') {
          params.onEvent({ type: 'response.completed', chatId: json.chatId, branchId: json.branchId ?? null });
        } else if (json.type === 'chat.title') {
          params.onEvent({ type: 'chat.title', title: json.title });
        } else if (json.type === 'response.error') {
          params.onEvent({ type: 'response.error', error: json.error || 'Unknown error' });
        }
      }
    }
  },

  async streamTemporaryChat(params: {
    body: any;
    onEvent: (ev: ChatStreamEvent) => void;
  }) {
    const res = await fetch('/api/chat/temporary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params.body),
      cache: 'no-store',
    });

    if (!res.ok) {
      let err: any = null;
      try {
        err = await res.json();
      } catch {
      }
      const code = err?.statusCode ?? res.status;
      throw new Error(JSON.stringify({ statusCode: code, error: err?.error || `Temporary chat request failed (${code})` }));
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No reader available');

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
        if (!data) continue;
        if (data === '[DONE]') return;

        let json: any;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }

        if (!json?.type) continue;

        if (json.type === 'chat.created') {
          params.onEvent({ type: 'chat.created', chatId: json.chatId });
        } else if (json.type === 'response.output_text.delta') {
          params.onEvent({ type: 'response.output_text.delta', delta: json.delta || '' });
        } else if (json.type === 'response.completed') {
          params.onEvent({ type: 'response.completed', chatId: json.chatId });
        } else if (json.type === 'response.error') {
          params.onEvent({ type: 'response.error', error: json.error || 'Unknown error' });
        }
      }
    }
  },

  async updateModel(chatId: string, model: string) {
    const res = await fetch(`/api/chats/${chatId}/model`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model }),
      cache: 'no-store',
    });

    if (!res.ok) {
      let err: any = null;
      try {
        err = await res.json();
      } catch { }
      const code = err?.statusCode ?? res.status;
      throw new Error(JSON.stringify({ statusCode: code, error: err?.error || `Update model failed (${code})` }));
    }

    return res.json();
  },
};
