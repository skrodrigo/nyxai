import { Ionicons } from '@expo/vector-icons';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toast } from '@/components/sonner';
import { ChatInput } from '@/components/ui/chat-input';
import { useChatFromHistory } from '@/hooks/useChatFromHistory';
import { NativeAiChatTransport } from '@/lib/ai-chat-transport';
import { chatsApi } from '@/lib/api-client';
import { useStore } from '@/lib/globalStore';
import { convertToUIMessages, getTextFromMessage } from '@/lib/utils';
import { useAuth } from '@/services/auth/useAuth';

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ message?: string }>();
  const initialPrompt = typeof params.message === 'string' ? params.message : '';
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<ComponentRef<typeof ChatInput>>(null);
  const [input, setInput] = useState('');
  const [hasAutoSent, setHasAutoSent] = useState(false);
  const [title, setTitle] = useState('New chat');
  const { token, isAuthenticated } = useAuth();
  const chatId = useStore((state) => state.chatId);
  const setChatId = useStore((state) => state.setChatId);
  const { initialMessages, loading } = useChatFromHistory({
    chatId,
    token: token ?? null,
  });

  const transport = useMemo(
    () =>
      new NativeAiChatTransport<UIMessage>({
        api: `${process.env.EXPO_PUBLIC_API_URL}/api/chat`,
        token,
        onChatCreated: event => {
          setChatId({ id: event.chatId, from: 'newChat' });
        },
        onChatTitle: nextTitle => {
          setTitle(nextTitle || 'Chat');
        },
        prepareBody: ({ messages, chatId: requestChatId }) => ({
          messages,
          model: 'openai/gpt-5-nano',
          chatId: chatId?.id || (requestChatId !== 'new-chat' ? requestChatId : undefined),
        }),
      }),
    [chatId?.id, setChatId, token],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    clearError,
  } = useChat<UIMessage>({
    id: chatId?.id || 'new-chat',
    transport,
    onError: err => {
      toast.error(err.message || 'Falha ao enviar mensagem');
    },
  });

  useEffect(() => {
    if (chatId?.from === 'history') {
      setMessages(initialMessages);
    }
  }, [chatId, initialMessages, setMessages]);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    if (!chatId?.id || !token) return;

    chatsApi
      .getById(chatId.id, token)
      .then((response) => {
        const chat = response.data;
        setTitle(chat.title || 'Chat');
        if (Array.isArray(chat.messages) && chat.messages.length > 0) {
          setMessages(convertToUIMessages(chat.messages));
        }
      })
      .catch(() => {});
  }, [chatId?.id, setMessages, token]);

  const canAutoSend = useMemo(
    () => Boolean(initialPrompt.trim()) && !hasAutoSent && isAuthenticated && status === 'ready',
    [hasAutoSent, initialPrompt, isAuthenticated, status],
  );

  useEffect(() => {
    if (!canAutoSend) return;
    setHasAutoSent(true);
    void sendMessage({ text: initialPrompt.trim() });
  }, [canAutoSend, initialPrompt, sendMessage]);

  const handleSubmit = async (rawMessage: string) => {
    const text = rawMessage.trim();
    if (!text) return;
    if (!isAuthenticated) {
      toast.error('Faça login para conversar');
      return;
    }
    clearError();
    setInput('');
    await sendMessage({ text });
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-row items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Pressable className="h-10 w-10 items-center justify-center" onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#9ca3af" />
          </Pressable>
          <Text className="flex-1 text-center text-base font-semibold text-black dark:text-white">
            {title}
          </Text>
          <View className="h-10 w-10" />
        </View>

        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4 py-4"
          contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
        >
          {loading ? (
            <View className="mt-6 items-center">
              <ActivityIndicator />
            </View>
          ) : messages.length === 0 ? (
            <View className="mt-10 items-center">
              <Text className="text-center text-zinc-500">Comece uma conversa.</Text>
            </View>
          ) : (
            messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <View
                  key={message.id}
                  className={`max-w-[85%] rounded-3xl px-4 py-3 ${
                    isUser
                      ? 'self-end bg-black dark:bg-white'
                      : 'self-start bg-zinc-100 dark:bg-zinc-900'
                  }`}
                >
                  <Text
                    className={isUser ? 'text-white dark:text-black' : 'text-black dark:text-white'}
                  >
                    {getTextFromMessage(message)}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>

        {error ? (
          <View className="px-4 pb-2">
            <Text className="text-sm text-red-500">{error.message}</Text>
          </View>
        ) : null}

        <ChatInput
          ref={inputRef}
          input={input}
          onChangeText={setInput}
          onSubmit={handleSubmit}
          scrollViewRef={scrollViewRef}
          focusOnMount={!initialPrompt}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
