import { streamSSE } from 'hono/streaming';
import { convertToModelMessages, streamText, generateText, gateway, stepCountIs } from 'ai';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

import { chatRepository } from './../repositories/chat.repository.js';
import { chatBranchRepository } from './../repositories/chat-branch.repository.js';
import { getUserUsage, incrementUserUsage } from './usage.service.js';
import { db } from '../common/db.js';
import { chat, message, users } from '../db/schema.js';
import crypto from 'node:crypto';
import { messageRepository } from './../repositories/message.repository.js';

function getAssistantSystemPrompt(params?: { aiInstructions?: string | null }) {
  const base = [
    'You are a helpful assistant that can answer questions and help with tasks.',
    'Detect the language of the user\'s latest message and respond in that same language.',
    '',
    '=== ARTIFACT CREATION INSTRUCTIONS ===',
    'Use the "create_artifact" tool only when the user clearly requests a structured deliverable that should live in a side panel, such as:',
    '- Checklists, todo lists, task lists, or any list with checkboxes',
    '- Roadmaps, project plans, or timelines',
    '- Reports, analysis, or documents',
    '- Guides or step-by-step playbooks meant to be referenced later',
    '',
    'Do NOT call the tool for:',
    '- Small talk (greetings, “how are you?”, etc.)',
    '- Normal Q&A where a chat response is sufficient',
    '- Code generation requests (write code directly in the chat response)',
    '- Short answers that do not require a structured panel',
    '',
    'Artifacts must contain the final deliverable, not clarifying questions.',
    'If you need more details to produce the deliverable, ask the questions in the chat FIRST and wait for the user answers.',
    '',
    'When you have enough information and the user request matches the allowed types, you MUST:',
    '1. Call the create_artifact tool (do not just describe what you would create)',
    '2. Provide a clear title and a detailed prompt describing exactly what to generate',
    '3. While the artifact is being created, write a short confirmation message in chat, like:',
    '   "Aqui está a sua checklist!" / "Here is your roadmap:"',
    '',
    'If the user is ambiguous, ask a clarifying question instead of calling the tool.',
    '======================================',
  ].join('\n');

  const extra = params?.aiInstructions?.trim();
  if (!extra) return base;
  return `${base}\n\n${extra}`;
}

function extractLastUserMessageText(messages: any[]) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const last = messages[messages.length - 1];
  if (Array.isArray(last?.parts)) {
    const p = last.parts.find((x: any) => x?.type === 'text');
    return typeof p?.text === 'string' ? p.text : '';
  }
  return typeof last?.content === 'string' ? last.content : '';
}

function normalizeTitleInput(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function isGibberishTitleInput(value: string) {
  const raw = normalizeTitleInput(value);
  const lettersOnly = raw.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (!lettersOnly) return true;
  if (raw.length <= 4) return true;

  const uniqueChars = new Set(lettersOnly.toLowerCase()).size;
  const vowelCount = (lettersOnly.match(/[aeiouáàâãéèêíìîóòôõúùû]/gi) ?? [])
    .length;
  const vowelRatio = vowelCount / Math.max(lettersOnly.length, 1);

  if (uniqueChars <= 2) return true;
  if (lettersOnly.length <= 8 && vowelRatio < 0.25) return true;
  return false;
}

function isUndetectedSubjectTitle(title: string) {
  const normalized = normalizeTitleInput(title).toLowerCase();
  return (
    normalized === 'assunto não detectado' ||
    normalized === 'assunto nao detectado' ||
    normalized === 'título não detectado' ||
    normalized === 'titulo nao detectado'
  );
}

async function generateChatTitle(userMessage: string): Promise<string> {
  const normalizedUserMessage = normalizeTitleInput(userMessage);
  if (!normalizedUserMessage) return '';
  if (normalizedUserMessage.length <= 20 || isGibberishTitleInput(normalizedUserMessage)) {
    return normalizedUserMessage.substring(0, 50);
  }

  try {
    const { text } = await generateText({
      model: gateway('meta/llama-3.1-8b'),
      messages: [
        {
          role: 'system',
          content: [
            'Você cria títulos curtos e descritivos para conversas.',
            'Tarefa: gerar um único título em português com no máximo 6 palavras.',
            'Responda apenas com o título puro, sem frases como "Aqui está".',
            'Proibido usar primeira pessoa (ex.: "eu", "preciso", "quero").',
            'Se a mensagem vier em primeira pessoa, extraia somente o assunto.',
            'Não use aspas, markdown, listas, dois-pontos ou pontuação no final.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            'Gere o título seguindo exatamente as regras.',
            'Retorne apenas o título.',
            `Mensagem: ${normalizedUserMessage}`,
          ].join('\n'),
        },
      ],
    });
    const title = text
      .trim()
      .replace(/^[`\"']+|[`\"']+$/g, '')
      .replace(/[.!?…。]+\s*$/, '')
      .substring(0, 50)
      .trim();

    if (!title || isUndetectedSubjectTitle(title)) {
      return normalizedUserMessage.substring(0, 50);
    }
    return title;
  } catch {
    return normalizedUserMessage.substring(0, 50);
  }
}

function toHistoryFromClient(rawMessages: any[]) {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages
    .map((m) => {
      const role = m?.role;
      if (role !== 'user' && role !== 'assistant') return null;

      let text: string | null = null;
      if (Array.isArray(m?.parts)) {
        const p = m.parts.find((x: any) => x?.type === 'text');
        if (typeof p?.text === 'string') text = p.text;
      } else if (typeof m?.content === 'string') {
        text = m.content;
      }

      if (!text) return null;
      return {
        id: typeof m?.id === 'string' ? m.id : crypto.randomUUID(),
        role,
        parts: [{ type: 'text' as const, text }],
      };
    })
    .filter(Boolean) as any[];
}

export async function handleChatSse(c: Context) {
  const user = c.get('user') as { id: string } | null;
  if (!user?.id) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  c.header('Content-Type', 'text/event-stream; charset=utf-8');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  const body = await c.req.json();
  const rawMessages = Array.isArray(body?.messages) ? body.messages : body?.messages ?? [];
  const model: string | undefined = body?.model;
  let chatId: string | null = body?.chatId ?? null;
  let branchId: string | null = body?.branchId ?? null;
  const isEdit: boolean = body?.isEdit ?? false;
  const lastMessageId: string | undefined = body?.lastMessageId;

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new HTTPException(400, { message: 'Invalid request: messages array is required' });
  }

  const usage = await getUserUsage(user.id);
  if (!usage || usage.limitReached) {
    throw new HTTPException(403, { message: 'Message limit reached' });
  }

  const userText = extractLastUserMessageText(rawMessages);
  if (!userText) {
    throw new HTTPException(400, { message: 'Invalid request: last message text is required' });
  }

  const selectedModel = model || 'google/gemini-2.5-flash';
  const resolvedModel = gateway(selectedModel as any);
  const assistantMessageId = crypto.randomUUID();
  const history = toHistoryFromClient(rawMessages);

  let titlePromise: Promise<string> | null = null;

  if (chatId) {
    const existing = await chatRepository.findMetaForUser(chatId, user.id);
    if (!existing) {
      const created = await chatRepository.createWithId(chatId, user.id, 'New chat', model);
      titlePromise = generateChatTitle(userText);
    } else if (model) {
      await chatRepository.updateModel(chatId, model);
    }
  }

  if (!chatId) {
    const created = await chatRepository.create(user.id, 'New chat', model);
    chatId = created.id;
    titlePromise = generateChatTitle(userText);
  }

  const ensured = await chatBranchRepository.ensureDefaultBranch(chatId);
  const chatData = await db.select({ activeBranchId: chat.activeBranchId }).from(chat).where(eq(chat.id, chatId)).limit(1);
  const effectiveBranchId = branchId ?? chatData[0]?.activeBranchId ?? ensured?.id ?? null;
  if (!effectiveBranchId) {
    throw new HTTPException(500, { message: 'Failed to resolve chat branch' });
  }
  branchId = effectiveBranchId;

  if (isEdit && lastMessageId) {
    const forkMessageData = await db
      .select({ id: message.id, content: message.content })
      .from(message)
      .where(and(eq(message.id, lastMessageId), eq(message.chatId, chatId)))
      .limit(1);
    if (forkMessageData.length === 0) {
      throw new HTTPException(404, { message: 'Message not found' });
    }

    const messageId = lastMessageId;
    const newVersion = await messageRepository.createVersion(messageId, { type: 'text', text: userText });
    if (!newVersion || !newVersion.id) {
      throw new HTTPException(500, { message: 'Failed to create message version' });
    }
    await chatBranchRepository.forkBranchFromEdit({
      chatId: chatId!,
      parentBranchId: branchId!,
      forkMessageId: messageId,
      forkVersionId: newVersion.id,
    });

    const chatData2 = await db.select({ activeBranchId: chat.activeBranchId }).from(chat).where(eq(chat.id, chatId)).limit(1);
    branchId = chatData2[0]?.activeBranchId ?? branchId;
  }

  await incrementUserUsage(user.id);

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'message',
      data: JSON.stringify({ type: 'chat.created', chatId, branchId, assistantMessageId }),
    });

    let assistantText = '';
    let userMessageCreated = false;
    let profileAiInstructions: string | null = null;

    stream.onAbort(async () => {
      try {
        if (assistantText.trim()) {
          const createdAssistantMessage = await messageRepository.create(chatId!, 'assistant', { type: 'text', text: assistantText }, assistantMessageId);
          await chatBranchRepository.appendMessageToBranch(branchId!, createdAssistantMessage.id);
        }
      } catch {
      }
    });

    try {
      const [modelMessages, profileData] = await Promise.all([
        convertToModelMessages(history),
        db.select({ aiInstructions: users.aiInstructions }).from(users).where(eq(users.id, user.id)).limit(1),
      ]);
      profileAiInstructions = (profileData[0] as any)?.aiInstructions ?? null;

      if (!isEdit) {
        const createdUserMessage = await messageRepository.create(chatId!, 'user', { type: 'text', text: userText });
        await chatBranchRepository.appendMessageToBranch(branchId!, createdUserMessage.id);
        userMessageCreated = true;
      }

      const result = streamText({
        model: resolvedModel,
        messages: modelMessages,
        system: getAssistantSystemPrompt({
          aiInstructions: profileAiInstructions,
        }),
        stopWhen: stepCountIs(5),
        tools: {
          create_artifact: {
            description: 'Create an artifact (checklist, roadmap, report, code, document) when the user requests structured content. The artifact will be displayed in a side panel.',
            inputSchema: z.object({
              title: z.string().describe('Title of the artifact'),
              prompt: z.string().describe('Detailed description of what the user wants in the artifact'),
            }),
            execute: async ({ title, prompt }: { title: string; prompt: string }) => {
              try {
                await fetch(`${process.env.API_BASE_URL || 'http://localhost:3001'}/api/artifacts/process`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-source': 'nextjs-direct',
                  },
                  body: JSON.stringify({
                    chatId,
                    messageId: assistantMessageId,
                    userMessage: prompt,
                    title,
                  }),
                });
                return { success: true, message: 'Artifact creation queued' };
              } catch (error) {
                return { success: false, error: 'Failed to queue artifact' };
              }
            },
          },
        },
      });

      for await (const delta of result.textStream) {
        assistantText += delta;
        await stream.writeSSE({
          event: 'message',
          data: JSON.stringify({ type: 'response.output_text.delta', delta }),
        });
      }

      const createdAssistantMessage = await messageRepository.create(chatId!, 'assistant', { type: 'text', text: assistantText }, assistantMessageId);
      await chatBranchRepository.appendMessageToBranch(branchId!, createdAssistantMessage.id);

      if (titlePromise) {
        const title = await titlePromise;
        await chatRepository.rename(chatId!, title);
        await stream.writeSSE({ event: 'message', data: JSON.stringify({ type: 'chat.title', title }) });
      }

      await stream.writeSSE({ event: 'message', data: JSON.stringify({ type: 'response.completed', chatId, branchId }) });
      await stream.writeSSE({ event: 'message', data: '[DONE]' });
    } catch (err: any) {
      await stream.writeSSE({
        event: 'message',
        data: JSON.stringify({ type: 'response.error', error: err?.message || 'AI service temporarily unavailable' }),
      });
      await stream.writeSSE({ event: 'message', data: '[DONE]' });
    }
  });
}

export async function handleTemporaryChatSse(c: Context) {
  const user = c.get('user') as { id: string } | null;
  if (!user?.id) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  c.header('Content-Type', 'text/event-stream; charset=utf-8');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  const body = await c.req.json();
  const rawMessages = Array.isArray(body?.messages) ? body.messages : body?.messages ?? [];
  const model: string | undefined = body?.model;

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new HTTPException(400, { message: 'Invalid request: messages array is required' });
  }

  const usage = await getUserUsage(user.id);
  if (!usage || usage.limitReached) {
    throw new HTTPException(403, { message: 'Message limit reached' });
  }

  const userText = extractLastUserMessageText(rawMessages);
  if (!userText) {
    throw new HTTPException(400, { message: 'Invalid request: last message text is required' });
  }

  await incrementUserUsage(user.id);

  const history = toHistoryFromClient(rawMessages);
  const selectedModel = model || 'google/gemini-2.5-flash';
  const resolvedModel = gateway(selectedModel as any);
  let assistantText = '';

  const profileData = await db
    .select({ aiInstructions: users.aiInstructions })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const profile = profileData[0];

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'message',
      data: JSON.stringify({ type: 'chat.created', chatId: null }),
    });

    try {
      const modelMessages = await convertToModelMessages(history);
      const result = streamText({
        model: resolvedModel,
        messages: modelMessages,
        system: getAssistantSystemPrompt({
          aiInstructions: (profile as any)?.aiInstructions ?? null,
        }),
      });

      for await (const delta of result.textStream) {
        assistantText += delta;
        await stream.writeSSE({
          event: 'message',
          data: JSON.stringify({ type: 'response.output_text.delta', delta }),
        });
      }

      await stream.writeSSE({ event: 'message', data: JSON.stringify({ type: 'response.completed', chatId: null }) });
      await stream.writeSSE({ event: 'message', data: '[DONE]' });
    } catch (err: any) {
      await stream.writeSSE({
        event: 'message',
        data: JSON.stringify({ type: 'response.error', error: err?.message || 'AI service temporarily unavailable' }),
      });
      await stream.writeSSE({ event: 'message', data: '[DONE]' });
    }
  });
}
