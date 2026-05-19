import { clsx, type ClassValue } from 'clsx'
import { Platform } from 'react-native'
import { twMerge } from 'tailwind-merge'
import type { UIMessage, ModelMessage } from 'ai'

type DBMessage = {
  id: string;
  parts?: any;
  content?: any;
  role: string;
  createdAt?: Date | string;
};

type Document = {
  createdAt: Date;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isValidYoutubeUrl(url: string) {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return youtubeRegex.test(url);
}

export function isWeb() {
  return Platform.OS === 'web';
}
export function isNative() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
export function isIOS() {
  return Platform.OS === 'ios';
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function messageContentToParts(content: any): UIMessage['parts'] {
  if (Array.isArray(content)) {
    return content as UIMessage['parts'];
  }

  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  if (content?.type === 'text' && typeof content?.text === 'string') {
    return [{ type: 'text', text: content.text }];
  }

  if (content?.type === 'file' && typeof content?.url === 'string') {
    return [{ type: 'file', url: content.url, mediaType: content.mediaType } as any];
  }

  if (typeof content?.content === 'string') {
    return [{ type: 'text', text: content.content }];
  }

  return [];
}

export function convertToUIMessages(
  messages: Array<DBMessage>,
): Array<UIMessage> {
  return messages
    .map((message) => {
      const rawParts = Array.isArray(message.parts)
        ? message.parts
        : messageContentToParts(message.content);

      const toolInvocations: any[] = [];

      if (Array.isArray(rawParts)) {
        rawParts.forEach((part: any) => {
          if (part.type && String(part.type).startsWith('tool-')) {
            const toolName = String(part.type).replace('tool-', '');
            toolInvocations.push({
              toolName,
              toolCallId: part.toolCallId,
              state: part.state || 'result',
              input: part.input,
              output: part.output,
              result: part.result || part.output,
            });
          }
        });
      }

      return {
        id: message.id,
        parts: rawParts as UIMessage['parts'],
        role: message.role as UIMessage['role'],
        createdAt: message.createdAt ? new Date(message.createdAt) : undefined,
        toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
      };
    })
    .filter((message) => message.parts && message.parts.length > 0);
}

export function sanitizeResponseMessages(
  messages: Array<ModelMessage>,
): Array<ModelMessage> {
  return messages.filter((message) => {
    if (message.role === 'assistant') {
      if (typeof message.content === 'string') {
        return message.content.length > 0
      }
      return message.content.length > 0
    }
    return true
  })
}

export function sanitizeUIMessages(messages: Array<UIMessage>): Array<UIMessage> {
  return messages.filter(
    (message) => message.parts && message.parts.length > 0,
  );
}

export function getMostRecentUserMessage(messages: Array<ModelMessage>) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Array<Document>,
  index: number,
) {
  if (!documents) return new Date();
  if (index > documents.length) return new Date();

  return documents[index].createdAt;
}

export function getMessageIdFromAnnotations(message: UIMessage) {
  const metadata = message.metadata as any;
  if (metadata?.messageIdFromServer) {
    return metadata.messageIdFromServer;
  }
  return message.id;
}

export function getTextFromMessage(message: UIMessage) {
  const textPart = message.parts?.find((part: any) => part?.type === 'text' && typeof part?.text === 'string') as
    | { text: string }
    | undefined;

  return textPart?.text ?? '';
}
