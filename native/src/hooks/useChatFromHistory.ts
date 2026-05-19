import { useState, useEffect } from "react";
import type { UIMessage } from "ai";
import { chatsApi } from '@/lib/api-client';
import { convertToUIMessages } from "@/lib/utils";

type ChatIdState = {
  id: string;
  from: "history" | "newChat";
} | null;

interface UseChatFromHistoryProps {
  chatId: ChatIdState;
  token: string | null;
}

export function useChatFromHistory({ chatId, token }: UseChatFromHistoryProps) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (chatId?.id && chatId.from === "history" && token) {
      setLoading(true);
      chatsApi
        .getById(chatId.id, token)
        .then((res) => {
          const messages = res?.data?.messages ?? [];

          if (messages.length) {
            setInitialMessages(convertToUIMessages(messages));
          } else {
            setInitialMessages([]);
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error('>>> Error fetching chat messages:', err);
          setInitialMessages([]);
          setLoading(false);
        });
    }
  }, [chatId, token]);

  return { initialMessages, loading };
}
