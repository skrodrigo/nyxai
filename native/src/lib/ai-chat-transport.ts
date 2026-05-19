import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatRequestOptions, ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

type BackendChatEvent =
  | { type: 'chat.created'; chatId: string; branchId?: string | null; assistantMessageId?: string }
  | { type: 'response.output_text.delta'; delta: string }
  | { type: 'response.completed'; chatId: string; branchId?: string | null }
  | { type: 'chat.title'; title: string }
  | { type: 'response.error'; error: string };

type NativeAiChatTransportOptions<UI_MESSAGE extends UIMessage> = {
  api: string;
  token?: string | null;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  prepareBody?: (options: {
    messages: UI_MESSAGE[];
    chatId: string;
    requestBody?: Record<string, unknown>;
  }) => Promise<Record<string, unknown>> | Record<string, unknown>;
  onChatCreated?: (event: Extract<BackendChatEvent, { type: 'chat.created' }>) => void;
  onChatTitle?: (title: string) => void;
};

function parseSseLines(buffer: string) {
  const parts = buffer.split('\n\n');
  return {
    complete: parts.slice(0, -1),
    rest: parts.length > 0 ? parts[parts.length - 1] ?? '' : '',
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

function createError(message: string) {
  return new Error(message || 'Chat request failed');
}

export class NativeAiChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  private api: string;
  private token?: string | null;
  private headers?: Record<string, string>;
  private body?: Record<string, unknown>;
  private prepareBody?: NativeAiChatTransportOptions<UI_MESSAGE>['prepareBody'];
  private onChatCreated?: NativeAiChatTransportOptions<UI_MESSAGE>['onChatCreated'];
  private onChatTitle?: NativeAiChatTransportOptions<UI_MESSAGE>['onChatTitle'];

  constructor(options: NativeAiChatTransportOptions<UI_MESSAGE>) {
    this.api = options.api;
    this.token = options.token;
    this.headers = options.headers;
    this.body = options.body;
    this.prepareBody = options.prepareBody;
    this.onChatCreated = options.onChatCreated;
    this.onChatTitle = options.onChatTitle;
  }

  async sendMessages(
    options: {
      trigger: 'submit-message' | 'regenerate-message';
      chatId: string;
      messageId: string | undefined;
      messages: UI_MESSAGE[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const storedToken = await AsyncStorage.getItem('session');
    const token = this.token ?? storedToken;
    const requestBody = (await this.prepareBody?.({
      messages: options.messages,
      chatId: options.chatId,
      requestBody: options.body,
    })) ?? {};

    const response = await expoFetch(this.api, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.headers ?? {}),
        ...((options.headers as Record<string, string> | undefined) ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        ...this.body,
        ...requestBody,
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const payload = await response.json();
        message = payload?.error || payload?.message || message;
      } catch {
      }
      throw createError(message);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw createError('No stream reader available');
    }

    const decoder = new TextDecoder();

    return new ReadableStream<UIMessageChunk>({
      start: async controller => {
        let buffer = '';
        let textStarted = false;
        let assistantMessageId = `assistant-${options.chatId}`;

        const ensureTextStarted = () => {
          if (textStarted) return;
          textStarted = true;
          controller.enqueue({ type: 'text-start', id: assistantMessageId });
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const { complete, rest } = parseSseLines(buffer);
            buffer = rest;

            for (const block of complete) {
              const data = extractData(block);
              if (!data || data === '[DONE]') continue;

              const event = JSON.parse(data) as BackendChatEvent;

              if (event.type === 'chat.created') {
                assistantMessageId = event.assistantMessageId || assistantMessageId;
                this.onChatCreated?.(event);
                continue;
              }

              if (event.type === 'chat.title') {
                this.onChatTitle?.(event.title);
                continue;
              }

              if (event.type === 'response.output_text.delta') {
                ensureTextStarted();
                controller.enqueue({
                  type: 'text-delta',
                  id: assistantMessageId,
                  delta: event.delta || '',
                });
                continue;
              }

              if (event.type === 'response.completed') {
                ensureTextStarted();
                controller.enqueue({ type: 'text-end', id: assistantMessageId });
                continue;
              }

              if (event.type === 'response.error') {
                throw createError(event.error);
              }
            }
          }

          if (textStarted) {
            controller.close();
          } else {
            controller.enqueue({ type: 'text-start', id: assistantMessageId });
            controller.enqueue({ type: 'text-end', id: assistantMessageId });
            controller.close();
          }
        } catch (error) {
          controller.error(error instanceof Error ? error : createError('Stream failed'));
        } finally {
          reader.releaseLock();
        }
      },
      cancel: async () => {
        await reader.cancel();
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
