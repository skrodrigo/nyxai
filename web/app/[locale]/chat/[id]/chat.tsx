'use client';

import type { AttachmentData } from '@/components/ai-elements/attachments';
import {
  PromptInput,
  PromptInputAttachmentButton,
  PromptInputContent,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputWebSearchButton
} from '@/components/ai-elements/prompt-input';
import { ArtifactRenderer } from '@/components/artifact-renderer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from '@/components/ui/icon';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toApiErrorPayload } from '@/data/api-error';
import { type Artifact } from '@/data/artifacts';
import { chatService } from '@/data/chat';
import { chatsService } from '@/data/chats';
import { imagesService } from '@/data/images';
import { modelSupportsWebSearch } from '@/data/model-capabilities';
import { subscriptionService } from '@/data/subscription';
import { useArtifacts } from '@/hooks/use-artifacts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebar } from '@/components/ui/sidebar';
import { UIMessage, useChat } from '@ai-sdk/react';
import { Archive03Icon, Cancel01Icon, Delete02Icon, Edit03Icon, GiftIcon, BubbleChatAddIcon, BubbleChatTemporaryIcon, MoreHorizontalIcon, PinIcon, PinOffIcon, Share03Icon } from '@hugeicons/core-free-icons';
import { nanoid } from 'nanoid';
import { useTranslations } from 'next-intl';
import NextImage from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AttachmentsInline } from './_components/attachments-inline';
import { ChatMessages } from './_components/chat-messages';
import { DeleteDialog } from './_components/delete-dialog';
import { RenameDialog } from './_components/rename-dialog';
import { ShareDialog } from './_components/share-dialog';
import { SpotlightDialog } from './_components/spotlight-dialog';
import { routing } from '@/i18n/routing';

const models = [
  {
    name: 'Gemini',
    value: 'google/gemini-2.5-flash',
    icon: <NextImage src="/models/gemini.svg" alt="Gemini" width={20} height={20} priority quality={100} />,
  },
  {
    name: 'ChatGPT',
    value: 'openai/gpt-5-nano',
    icon: <NextImage src="/models/chatgpt.svg" alt="openai" width={20} height={20} priority quality={100} />,
  },
  {
    name: 'Claude',
    value: 'anthropic/claude-haiku-4.5',
    icon: <NextImage src="/models/claude.svg" alt="claude" width={20} height={20} priority quality={100} />,
    off: false,
  },
  {
    name: 'DeepSeek',
    value: 'deepseek/deepseek-v3.2',
    icon: <NextImage src="/models/deepseek.svg" alt="deepseek" width={20} height={20} priority quality={100} />,
  },
  {
    name: 'Kimi',
    value: 'moonshotai/kimi-k2.5',
    icon: <NextImage src="/models/kimi.svg" alt="moonshotai" width={18} height={18} priority quality={100} />,
  },
  {
    name: 'Grok',
    value: 'xai/grok-code-fast-1',
    icon: <NextImage src="/models/grok.svg" alt="xai" width={20} height={20} priority quality={100} />,
  },
  {
    name: 'GLM',
    value: 'zai/glm-5',
    icon: <NextImage src="/models/zai.svg" alt="zai" width={20} height={20} priority quality={100} />,
  },
];

const imageModels = [
  {
    name: 'Recraft',
    value: 'recraft/recraft-v4-pro',
    icon: <NextImage src="/models/recraft.svg" alt="recraft" width={18} height={18} priority quality={100} />,
  },
  {
    name: 'Grok Imagine',
    value: 'xai/grok-imagine-image-pro',
    icon: <NextImage src="/models/xai.svg" alt="xai" className='mr-1' width={14} height={14} priority quality={100} />,
  },
  {
    name: 'DALL-E',
    value: 'openai/dall-e-3',
    icon: <NextImage src="/models/dalle.svg" alt="openai" width={20} height={20} priority quality={100} />,
  },
]

const NEW_CHAT_TEXT_MODEL_KEY = 'new-chat-text-model'
const NEW_CHAT_IMAGE_MODEL_KEY = 'new-chat-image-model'
const NEW_CHAT_TAB_KEY = 'new-chat-tab'

function chatModelKey(chatId: string, key: string) {
  return `chat:${chatId}:${key}`
}

function toUiMessages(rawMessages: any[]): UIMessage[] {
  if (!Array.isArray(rawMessages)) return []
  return rawMessages
    .map((message) => {
      const content = message?.content
      if (message.role !== 'user' && message.role !== 'assistant') return null

      let parsedContent = content
      if (typeof content === 'string') {
        try {
          parsedContent = JSON.parse(content)
        } catch {
          parsedContent = { type: 'text', text: content }
        }
      }

      if (parsedContent?.type === 'file' && typeof parsedContent?.url === 'string') {
        return {
          id: message.id,
          role: message.role,
          parts: [
            {
              type: 'file',
              url: parsedContent.url,
              mediaType:
                typeof parsedContent?.mediaType === 'string'
                  ? parsedContent.mediaType
                  : undefined,
            },
          ],
        } as UIMessage
      }

      const text =
        typeof parsedContent === 'string'
          ? parsedContent
          : typeof parsedContent?.text === 'string'
            ? parsedContent.text
            : typeof parsedContent?.content === 'string'
              ? parsedContent.content
              : null

      if (!text) return null

      return {
        id: message.id,
        role: message.role,
        parts: [{ type: 'text', text }],
      } as UIMessage
    })
    .filter(Boolean) as UIMessage[]
}

function getLocaleFromPathname(pathname: string | null) {
  if (!pathname) return null
  const parts = pathname.split('/').filter(Boolean)
  const candidate = parts[0] ?? null
  if (!candidate) return null
  if (!routing.locales.includes(candidate as typeof routing.locales[number])) return null
  return candidate
}

export function Chat({
  chatId,
  initialMessages,
  initialBranchId,
  initialModel,
  initialTitle,
  initialPinnedAt,
}: {
  chatId?: string
  initialMessages: UIMessage[]
  initialBranchId?: string | null
  initialModel?: string
  initialTitle?: string
  initialPinnedAt?: string | null
}) {
  const t = useTranslations('chat')
  const router = useRouter();
  const pathname = usePathname()
  const [runtimeChatId, setRuntimeChatId] = useState<string | undefined>(chatId)
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const attachmentsRef = useRef<AttachmentData[]>([]);
  const effectiveChatId = chatId ?? runtimeChatId
  const hasFileMessage = Array.isArray(initialMessages)
    ? initialMessages.some((m) => (m as any)?.parts?.some((p: any) => p?.type === 'file'))
    : false
  const initialModelTab: 'text' | 'image' =
    (initialModel && imageModels.some((m) => m.value === initialModel)) || hasFileMessage
      ? 'image'
      : 'text'
  const [model, setModel] = useState<string>(() => {
    if (initialModel && models.some((m) => m.value === initialModel)) return initialModel
    return models[0].value
  })
  const [modelTab, setModelTab] = useState<'text' | 'image'>(initialModelTab)
  const [imageModel, setImageModel] = useState<string>(() => {
    if (initialModel === 'openai/gpt-5-nano' && hasFileMessage) return 'openai/dall-e-3'
    if (initialModel && imageModels.some((m) => m.value === initialModel)) return initialModel
    return imageModels[0].value
  })
  const [title, setTitle] = useState(initialTitle ?? '')
  const [webSearch, setWebSearch] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [isPinned, setIsPinned] = useState(Boolean(initialPinnedAt))
  const [isLoading, setIsLoading] = useState(false);
  const [isTemporary, setIsTemporary] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  const [spotlightChats, setSpotlightChats] = useState<{ id: string; title: string }[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(initialBranchId ?? null)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)

  const { artifacts, selectedArtifact, isPanelOpen, openPanel, closePanel } = useArtifacts({
    chatId: effectiveChatId,
    enabled: Boolean(effectiveChatId),
  })

  const isMobile = useIsMobile()
  const { state: sidebarState } = useSidebar()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedTab = localStorage.getItem(NEW_CHAT_TAB_KEY)
    if (!hasFileMessage && !initialModel) {
      if (savedTab === 'text' || savedTab === 'image') setModelTab(savedTab)
    }

    const savedTextModel = localStorage.getItem(NEW_CHAT_TEXT_MODEL_KEY)
    if (!initialModel && savedTextModel && models.some((m) => m.value === savedTextModel)) {
      setModel(savedTextModel)
    }

    const savedImageModel = localStorage.getItem(NEW_CHAT_IMAGE_MODEL_KEY)
    if (
      !initialModel &&
      savedImageModel &&
      imageModels.some((m) => m.value === savedImageModel)
    ) {
      setImageModel(savedImageModel)
    }
  }, [hasFileMessage, initialModel])

  const handleCloseArtifactPanel = useCallback(() => {
    setSelectedArtifactId(null)
    closePanel()
  }, [closePanel])

  const handleOpenArtifact = useCallback((artifact: Artifact) => {
    if (isPanelOpen && selectedArtifactId === artifact.id) {
      handleCloseArtifactPanel()
      return
    }

    setSelectedArtifactId(artifact.id)
    openPanel(artifact)
  }, [handleCloseArtifactPanel, isPanelOpen, openPanel, selectedArtifactId])

  const selectedModel = models.find((m) => m.value === model);
  const selectedImageModel = imageModels.find((m) => m.value === imageModel)
  const canWebSearch = modelSupportsWebSearch(model);
  const [isPro, setIsPro] = useState<boolean | null>(null);

  useEffect(() => {
    setRuntimeChatId(chatId)
  }, [chatId])

  const { messages, status, regenerate, setMessages } = useChat({
    onError: (error: any) => {
      try {
        const errorBody = JSON.parse(error.message);
        if (errorBody.error === 'Message limit reached') {
          const returnTo = pathname ? `?returnTo=${encodeURIComponent(pathname)}` : ''
          router.push(`/upgrade${returnTo}`)
        }
      } catch (e) { }
    },
  });

  const isNewChat = !chatId && messages.length === 0

  useEffect(() => {
    if (initialMessages.length) {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  useEffect(() => {
    setActiveBranchId(initialBranchId ?? null)
  }, [initialBranchId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!chatId) return

    const savedTab = localStorage.getItem(chatModelKey(chatId, 'tab'))
    if (savedTab === 'text' || savedTab === 'image') {
      setModelTab(savedTab)
    }

    const savedTextModel = localStorage.getItem(chatModelKey(chatId, 'textModel'))
    if (savedTextModel && models.some((m) => m.value === savedTextModel)) {
      setModel(savedTextModel)
    }

    const savedImageModel = localStorage.getItem(chatModelKey(chatId, 'imageModel'))
    if (savedImageModel && imageModels.some((m) => m.value === savedImageModel)) {
      setImageModel(savedImageModel)
    }
  }, [chatId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!chatId) {
      localStorage.setItem(NEW_CHAT_TAB_KEY, modelTab)
      if (models.some((m) => m.value === model)) {
        localStorage.setItem(NEW_CHAT_TEXT_MODEL_KEY, model)
      }
      if (imageModels.some((m) => m.value === imageModel)) {
        localStorage.setItem(NEW_CHAT_IMAGE_MODEL_KEY, imageModel)
      }
      return
    }

    localStorage.setItem(chatModelKey(chatId, 'tab'), modelTab)
    if (models.some((m) => m.value === model)) {
      localStorage.setItem(chatModelKey(chatId, 'textModel'), model)
    }
    if (imageModels.some((m) => m.value === imageModel)) {
      localStorage.setItem(chatModelKey(chatId, 'imageModel'), imageModel)
    }
  }, [chatId, imageModel, model, modelTab])

  const applySelectedModel = useCallback(async (value: string) => {
    const isText = models.some((m) => m.value === value)
    const isImage = imageModels.some((m) => m.value === value)

    if (isText) {
      setModelTab('text')
      setModel(value)
      if (!modelSupportsWebSearch(value)) {
        setWebSearch(false)
      }
      if (chatId) {
        try {
          await chatService.updateModel(chatId, value)
        } catch {
        }
      }
      return
    }

    if (isImage) {
      setModelTab('image')
      setImageModel(value)
      if (chatId) {
        try {
          await chatService.updateModel(chatId, value)
        } catch {
        }
      }
    }
  }, [chatId])

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.type !== 'file') continue;
        if (!attachment.url) continue;
        URL.revokeObjectURL(attachment.url);
      }
    };
  }, []);

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const subscription = await subscriptionService.get();
        const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
        setIsPro(Boolean(isActive));
      } catch (error) {
        setIsPro(false);
      }
    };
    checkSubscription();
  }, []);

  useEffect(() => {
    if (!spotlightOpen) return
    async function load() {
      try {
        const res = await chatsService.list()
        const data = res?.data
        setSpotlightChats(Array.isArray(data) ? data : [])
      } catch {
        setSpotlightChats([])
      }
    }
    load()
  }, [spotlightOpen])

  function handleAddAttachments(files: File[]) {
    const next = files.map<AttachmentData>((file) => ({
      id: nanoid(),
      type: 'file',
      filename: file.name,
      mediaType: file.type,
      url: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...next]);
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => {
      const current = prev.find((a) => a.id === id);
      if (current?.type === 'file' && current.url) {
        URL.revokeObjectURL(current.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming) return;

    if (isPro === false) {
      const returnTo = pathname ? `?returnTo=${encodeURIComponent(pathname)}` : ''
      router.push(`/upgrade${returnTo}`)
      return;
    }

    setInput('');

    const userMessageId = nanoid()
    const userMessage: UIMessage = {
      id: userMessageId,
      role: 'user',
      parts: [{ type: 'text', text: trimmedInput }],
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    const assistantMessage: UIMessage = {
      id: nanoid(),
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
    };

    const assistantMessageIdRef = { current: assistantMessage.id }
    let assistantMessageIdFromServer: string | null = null

    const generatedChatId = !effectiveChatId ? nanoid() : null
    const requestChatId = effectiveChatId || generatedChatId

    if (generatedChatId && !isTemporary) {
      setRuntimeChatId(generatedChatId)
      if (typeof window !== 'undefined') {
        const locale = getLocaleFromPathname(pathname)
        const nextPath = locale ? `/${locale}/chat/${generatedChatId}` : `/chat/${generatedChatId}`
        window.history.replaceState(null, '', nextPath)
        window.dispatchEvent(new Event('chats:refresh'))
      }
    }

    setMessages([...updatedMessages, assistantMessage]);
    setIsStreaming(true);

    try {
      if (modelTab === 'image') {
        const result = await imagesService.generate({
          chatId: effectiveChatId,
          prompt: trimmedInput,
          model: imageModel,
          returnBase64Preview: true,
        })

        const imageSrc = result.base64Preview
          ? `data:${result.mediaType};base64,${result.base64Preview}`
          : result.imageUrl

        setMessages((prev: UIMessage[]) =>
          prev.map((msg: UIMessage) =>
            msg.id === assistantMessage.id
              ? {
                ...msg,
                parts: [
                  {
                    type: 'file',
                    mediaType: result.mediaType,
                    url: imageSrc,
                  },
                ],
              }
              : msg,
          ),
        )

        setIsStreaming(false)

        if (result.chatId) {
          try {
            const payload = await chatsService.getById(result.chatId)
            const chat = payload?.data
            if (Array.isArray(chat?.messages)) {
              setMessages(toUiMessages(chat.messages))
            }
            if (typeof chat?.activeBranchId === 'string') {
              setActiveBranchId(chat.activeBranchId)
            }
          } catch {
          }
        }

        if (!chatId && !isTemporary && result.chatId) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('chats:refresh'))

            const locale = getLocaleFromPathname(pathname)
            const nextPath = locale
              ? `/${locale}/chat/${result.chatId}`
              : `/chat/${result.chatId}`
            setRuntimeChatId(result.chatId)
            window.history.replaceState(null, '', nextPath)
            router.replace(nextPath)
          }
          return
        }

        return
      }

      let accumulatedText = ''
      let createdChatId: string | null = null

      const streamFn = isTemporary
        ? chatService.streamTemporaryChat
        : chatService.streamChat

      await streamFn({
        body: {
          messages: updatedMessages,
          model,
          webSearch: canWebSearch ? webSearch : false,
          chatId: requestChatId,
          branchId: activeBranchId,
        },
        onEvent: (ev) => {
          if (ev.type === 'chat.created') {
            createdChatId = ev.chatId
            if (!effectiveChatId) {
              setRuntimeChatId(ev.chatId)
              if (typeof window !== 'undefined' && !isTemporary) {
                const locale = getLocaleFromPathname(pathname)
                const nextPath = locale ? `/${locale}/chat/${ev.chatId}` : `/chat/${ev.chatId}`
                window.history.replaceState(null, '', nextPath)
                window.dispatchEvent(new Event('chats:refresh'))
              }
            }
            if (typeof ev.branchId === 'string') setActiveBranchId(ev.branchId)
            if (typeof ev.assistantMessageId === 'string') {
              const prevId = assistantMessageIdRef.current
              const newId = ev.assistantMessageId
              assistantMessageIdFromServer = newId
              assistantMessageIdRef.current = newId
              setMessages((prev: UIMessage[]) =>
                prev.map((msg: UIMessage) =>
                  msg.id === prevId || msg.id === assistantMessage.id
                    ? { ...msg, id: newId }
                    : msg,
                ),
              )
            }
            if (typeof window !== 'undefined' && !isTemporary) {
              window.dispatchEvent(new Event('chats:refresh'))
            }
          }

          if (ev.type === 'response.completed') {
            if (!createdChatId) createdChatId = ev.chatId
            if (typeof ev.branchId === 'string') setActiveBranchId(ev.branchId)
          }

          if (ev.type === 'response.output_text.delta') {
            accumulatedText += ev.delta
            setMessages((prev: UIMessage[]) =>
              prev.map((msg: UIMessage) =>
                msg.id === assistantMessageIdRef.current || msg.id === assistantMessage.id
                  ? { ...msg, parts: [{ type: 'text', text: accumulatedText }] }
                  : msg,
              ),
            )
          }

          if (ev.type === 'chat.title') {
            setTitle(ev.title)
            router.refresh()
          }

          if (ev.type === 'response.error') {
            throw new Error(ev.error)
          }
        },
      })

      setIsStreaming(false)

      const finalChatId = chatId || createdChatId
      if (finalChatId) {
        try {
          const payload = await chatsService.getById(finalChatId, activeBranchId)
          const chat = payload?.data

          if (Array.isArray(chat?.messages)) {
            setMessages(toUiMessages(chat.messages))
          }
          if (typeof chat?.activeBranchId === 'string') {
            setActiveBranchId(chat.activeBranchId)
          }

          const lastAssistant = Array.isArray(chat?.messages)
            ? [...chat.messages].reverse().find((m: any) => m?.role === 'assistant')
            : null

        } catch {
        }
      }

      if (!chatId && !isTemporary && createdChatId) {
        const locale = getLocaleFromPathname(pathname)
        const nextPath = locale
          ? `/${locale}/chat/${createdChatId}`
          : `/chat/${createdChatId}`
        router.replace(nextPath)
      }
    } catch (error) {
      setIsStreaming(false);
      setMessages((prev: UIMessage[]) => prev.slice(0, -1));
      toast.error(toApiErrorPayload(error).error);
    }
  };

  const handleShare = () => {
    if (!chatId) return;
    setShareDialogOpen(true);
    setIsLoading(true);
    startTransition(async () => {
      const result = await chatsService.share(chatId);
      const data = result?.data;
      if (result?.success && data?.sharePath) {
        const url = new URL(window.location.href);
        url.pathname = `/share/${data.sharePath}`;
        setShareLink(url.toString());
      }
      setIsLoading(false);
    });
  };

  const handleArchive = () => {
    if (!chatId) return;
    setIsLoading(true);
    startTransition(async () => {
      const result = await chatsService.archive(chatId);
      if (result?.success) {
        router.push('/chat');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('chats:refresh'));
        }
      }
      setIsLoading(false);
    });
  };

  const handleDelete = () => {
    if (!chatId) return;
    setIsLoading(true);
    startTransition(async () => {
      const result = await chatsService.delete(chatId);
      if (result?.success) {
        router.push('/chat');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('chats:refresh'));
        }
      }
      setIsLoading(false);
      setDeleteDialogOpen(false);
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink);
  };

  const handleOpenShareLink = () => {
    if (!shareLink) return;
    window.open(shareLink, '_blank', 'noopener,noreferrer');
  };

  const handleTemporaryChat = () => {
    setIsTemporary((prev) => !prev);
  };

  const handleTogglePin = () => {
    if (!chatId) return
    setIsLoading(true)
    startTransition(async () => {
      try {
        if (isPinned) {
          await chatsService.unpin(chatId)
          setIsPinned(false)
        } else {
          await chatsService.pin(chatId)
          setIsPinned(true)
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('chats:refresh'))
        }
      } finally {
        setIsLoading(false)
      }
    })
  }

  const handleOpenRename = () => {
    if (!chatId) return
    setRenameValue(title || initialTitle || '')
    setRenameDialogOpen(true)
  }

  const handleRename = () => {
    if (!chatId) return
    const nextTitle = renameValue.trim()
    if (!nextTitle) return
    setIsLoading(true)
    startTransition(async () => {
      try {
        await chatsService.rename({
          id: chatId,
          title: nextTitle,
        })
        setTitle(nextTitle)
        setRenameDialogOpen(false)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('chats:refresh'))
        }
        router.refresh()
      } finally {
        setIsLoading(false)
      }
    })
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden p-2 md:p-0">
      {isMobile ? (
        <>
          <div className="flex flex-col h-full w-full overflow-hidden">
            <div className="flex items-center justify-between gap-2 shrink-0 py-1 px-2 z-20 bg-background">
              <div className='flex items-center justify-center gap-2'>
                <SidebarTrigger />
                <PromptInputModelSelect
                  onValueChange={applySelectedModel}
                  value={modelTab === 'text' ? model : imageModel}
                >
                  <PromptInputModelSelectTrigger>
                    {modelTab === 'text' && selectedModel && (
                      <div className="flex items-center gap-2">
                        {selectedModel.icon}
                        <span className="font-medium">{selectedModel.name}</span>
                      </div>
                    )}
                    {modelTab === 'image' && selectedImageModel && (
                      <div className="flex items-center gap-2">
                        {selectedImageModel.icon}
                        <span className="font-medium">{selectedImageModel.name}</span>
                      </div>
                    )}
                  </PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    <div className='pb-2'>
                      <Tabs value={modelTab} onValueChange={(v) => setModelTab(v as 'text' | 'image')}>
                        <TabsList className="w-full">
                          <TabsTrigger className="flex-1" value="text">
                            Texto
                          </TabsTrigger>
                          <TabsTrigger className="flex-1" value="image">
                            Imagem
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    {(modelTab === 'text' ? models : imageModels).map((m) => {
                      const Icon = m.icon
                      return (
                        <PromptInputModelSelectItem
                          key={m.value}
                          value={m.value}
                          disabled={(m as { off?: boolean }).off}
                        >
                          <div className="flex items-center gap-2">
                            {Icon}
                            <span className="font-medium">{m.name}</span>
                            {(m as { off?: boolean }).off && (
                              <span className="text-xs text-amber-500">
                                {t('comingSoon')}
                              </span>
                            )}
                          </div>
                        </PromptInputModelSelectItem>
                      )
                    })}
                  </PromptInputModelSelectContent>
                </PromptInputModelSelect>
              </div>
              {effectiveChatId && (
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" onClick={handleShare}
                          disabled={isPending || isStreaming}
                          className="p-1">
                          <Icon icon={Share03Icon} className="size-5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={6}>
                        {t('share')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenu>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <button type="button" disabled={isStreaming}
                              className="p-1">
                              <Icon icon={MoreHorizontalIcon} className="size-6" />
                            </button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>{t('moreOptions')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleTogglePin} disabled={isPending || isLoading || isStreaming}>
                        <Icon
                          icon={isPinned ? PinOffIcon : PinIcon}
                          className="text-muted-foreground mr-2 size-[18px]"
                        />
                        <span>{isPinned ? t('unpin') : t('pin')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleOpenRename} disabled={isPending || isLoading || isStreaming}>
                        <Icon icon={Edit03Icon} className="text-muted-foreground mr-2 size-[18px]" />
                        <span>{t('rename')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleArchive} disabled={isPending || isStreaming}>
                        <Icon icon={Archive03Icon} className="text-muted-foreground mr-2 size-[18px]" />
                        <span>{t('archive')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="focus:bg-destructive/20"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={isPending || isStreaming}
                      >
                        <Icon icon={Delete02Icon} className="text-muted-foreground mr-2 size-[18px]" />
                        <span>{t('delete')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {!effectiveChatId && (
                <div className="ml-auto flex items-center gap-2">
                  {isPro === false && (
                    <Button
                      onClick={() => router.push('/upgrade')}
                      variant="secondary"
                      className="h-8 md:hidden"
                    >
                      <Icon icon={GiftIcon} className="size-[18px]" />
                      Upgrade
                    </Button>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleTemporaryChat}
                          title={isTemporary ? t('returnToNormalChat') : t('temporaryChat')}
                        >
                          {isTemporary ? (
                            <Icon icon={BubbleChatTemporaryIcon} className='size-6' />
                          ) : (
                            <Icon icon={BubbleChatAddIcon} className='size-6' />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={6}>
                        {isTemporary ? t('returnToNormalChat') : t('temporaryChat')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
              {!chatId && isPro === false && (
                <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
                  <Button
                    onClick={() => router.push('/upgrade')}
                    variant="secondary"
                    className="mb-1 h-9"
                  >
                    <Icon icon={GiftIcon} className="size-[18px]" />
                    Upgrade
                  </Button>
                </div>
              )}
            </div>
            <SidebarInset className="flex-1 overflow-y-auto min-h-0 scrollbar-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
              {isNewChat ? (
                <div className="flex flex-col items-center justify-center h-full px-4">
                  <div className="w-full max-w-3xl">
                    <h1 className="text-2xl md:text-2xl font-medium tracking-tight text-center">{isTemporary ? t('temporaryChatTitle') : t('newChatTitle')}</h1>
                    <div className="mt-6">
                      <AttachmentsInline
                        attachments={attachments}
                        onRemoveAttachment={handleRemoveAttachment}
                      />
                      <PromptInput onSubmit={handleSubmit}>
                        <PromptInputContent
                          leftContent={
                            <>
                              <PromptInputAttachmentButton
                                onFilesSelected={handleAddAttachments}
                                variant="ghost"
                                className="size-8"
                              />
                              {canWebSearch && (
                                <PromptInputWebSearchButton
                                  active={webSearch}
                                  onClick={() => setWebSearch(!webSearch)}
                                />
                              )}
                            </>
                          }
                          rightContent={<PromptInputSubmit disabled={!input || isStreaming} status={isStreaming ? 'streaming' : status} className="size-8" />}
                        >
                          <PromptInputTextarea
                            autoFocus
                            onChange={(e) => setInput(e.target.value)}
                            value={input}
                          />
                        </PromptInputContent>
                      </PromptInput>
                    </div>
                  </div>
                </div>
              ) : (
                <ChatMessages
                  chatId={chatId}
                  activeBranchId={activeBranchId}
                  canWebSearch={canWebSearch}
                  isStreaming={isStreaming}
                  isTemporary={isTemporary}
                  messages={messages}
                  model={model}
                  status={status}
                  webSearch={webSearch}
                  setActiveBranchId={setActiveBranchId}
                  setIsStreaming={setIsStreaming}
                  setMessages={setMessages}
                  regenerate={regenerate}
                  router={router}
                  artifacts={artifacts}
                  onOpenArtifact={handleOpenArtifact}
                  selectedArtifactId={selectedArtifactId}
                  setSelectedArtifactId={setSelectedArtifactId}
                />
              )}
            </SidebarInset>
            {!isNewChat && (
              <div className="shrink-0 py-2 bg-transparent">
                <div className="rounded-md w-full max-w-3xl mx-auto px-2 md:px-0">
                  <AttachmentsInline
                    attachments={attachments}
                    onRemoveAttachment={handleRemoveAttachment}
                  />
                  <PromptInput onSubmit={handleSubmit}>
                    <PromptInputContent
                      leftContent={
                        <>
                          <PromptInputAttachmentButton
                            onFilesSelected={handleAddAttachments}
                            variant="ghost"
                            className="size-8"
                          />
                          {canWebSearch && (
                            <PromptInputWebSearchButton
                              active={webSearch}
                              onClick={() => setWebSearch(!webSearch)}
                            />
                          )}
                        </>
                      }
                      rightContent={<PromptInputSubmit disabled={!input || isStreaming} status={isStreaming ? 'streaming' : status} className="size-8" />}
                    >
                      <PromptInputTextarea
                        autoFocus
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === '/' && !input.trim()) {
                            e.preventDefault()
                            setSpotlightOpen(true)
                          }
                        }}
                        value={input}
                      />
                    </PromptInputContent>
                  </PromptInput>
                </div>
              </div>
            )}

            <ShareDialog
              open={shareDialogOpen}
              onOpenChange={setShareDialogOpen}
              shareLink={shareLink}
              onOpenShareLink={handleOpenShareLink}
              onCopy={copyToClipboard}
            />

            <DeleteDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
              isPending={isPending}
              isLoading={isLoading}
              onConfirm={handleDelete}
              onCancel={() => setDeleteDialogOpen(false)}
            />

            <RenameDialog
              open={renameDialogOpen}
              onOpenChange={setRenameDialogOpen}
              value={renameValue}
              onChangeValue={setRenameValue}
              isPending={isPending}
              isLoading={isLoading}
              onCancel={() => setRenameDialogOpen(false)}
              onSave={handleRename}
            />

            <SpotlightDialog
              open={spotlightOpen}
              onOpenChange={setSpotlightOpen}
              chats={spotlightChats}
              onSelectChat={(id) => {
                setSpotlightOpen(false)
                router.push(`/chat/${id}`)
              }}
            />
          </div>
          {isPanelOpen && selectedArtifact && (
            <Drawer
              open
              direction="bottom"
              onOpenChange={(open) => {
                if (open) return
                handleCloseArtifactPanel()
              }}
            >
              <DrawerContent className="p-0 max-h-[98vh] overflow-hidden">
                <div className="flex flex-col h-full min-h-0">
                  <div className="flex items-center p-4 border-b shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-semibold truncate">{selectedArtifact.title}</h3>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden p-2">
                    {selectedArtifact.status === 'processing' ? (
                      <div className="flex items-center justify-center h-40">
                        <div className="flex flex-col items-center gap-3">
                          <div className="size-8 border border-border border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground">Generating artifact...</p>
                        </div>
                      </div>
                    ) : selectedArtifact.status === 'failed' ? (
                      <div className="flex items-center justify-center h-40">
                        <p className="text-sm text-destructive">Failed to generate artifact</p>
                      </div>
                    ) : (
                      <ArtifactRenderer content={selectedArtifact.content} />
                    )}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
          <ResizablePanel defaultSize={isPanelOpen ? 60 : 100} id="chat-panel">
            <div className="relative flex flex-col h-full w-full overflow-x-hidden">
              <div className="absolute top-0 left-0 right-0 py-1 flex items-center justify-between gap-2 z-20 bg-background px-2">
                {sidebarState === 'collapsed' ? <SidebarTrigger /> : null}
                <PromptInputModelSelect
                  onValueChange={applySelectedModel}
                  value={modelTab === 'text' ? model : imageModel}
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PromptInputModelSelectTrigger>
                          {modelTab === 'text' && selectedModel && (
                            <div className="flex items-center gap-2">
                              {selectedModel.icon}
                              <span className="font-medium">{selectedModel.name}</span>
                            </div>
                          )}
                          {modelTab === 'image' && selectedImageModel && (
                            <div className="flex items-center gap-2">
                              {selectedImageModel.icon}
                              <span className="font-medium">{selectedImageModel.name}</span>
                            </div>
                          )}
                        </PromptInputModelSelectTrigger>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={6}>{t('selectModel')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <PromptInputModelSelectContent>
                    <div className="pb-2">
                      <Tabs value={modelTab} onValueChange={(v) => setModelTab(v as 'text' | 'image')}>
                        <TabsList className="w-full">
                          <TabsTrigger className="flex-1" value="text">
                            Texto
                          </TabsTrigger>
                          <TabsTrigger className="flex-1" value="image">
                            Imagem
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    {(modelTab === 'text' ? models : imageModels).map((m) => {
                      const Icon = m.icon
                      return (
                        <PromptInputModelSelectItem
                          key={m.value}
                          value={m.value}
                          disabled={(m as { off?: boolean }).off}
                        >
                          <div className="flex items-center gap-2">
                            {Icon}
                            <span className="font-medium">{m.name}</span>
                            {(m as { off?: boolean }).off && (
                              <span className="text-xs text-amber-500">
                                {t('comingSoon')}
                              </span>
                            )}
                          </div>
                        </PromptInputModelSelectItem>
                      )
                    })}
                  </PromptInputModelSelectContent>
                </PromptInputModelSelect>
                {effectiveChatId && (
                  <>
                    <div className="flex-1 text-center px-4 hidden md:block">
                      <span className="font-medium text-sm text-muted-foreground/60 truncate block max-w-[200px] md:max-w-[400px] mx-auto">{title || initialTitle || 'New chat'}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={handleShare}
                              disabled={isPending || isStreaming}
                              className="p-1 flex justify-center items-center">
                              <Icon icon={Share03Icon} className="size-6 md:size-5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" sideOffset={6}>
                            {t('share')}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <DropdownMenu>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <button type="button" disabled={isStreaming}
                                  className="p-1 flex justify-center items-center">
                                  <Icon icon={MoreHorizontalIcon} className="size-6 md:size-5" />
                                </button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={6}>{t('moreOptions')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handleTogglePin} disabled={isPending || isLoading || isStreaming}>
                            <Icon
                              icon={isPinned ? PinOffIcon : PinIcon}
                              className="text-muted-foreground mr-2 size-[18px]"
                            />
                            <span>{isPinned ? t('unpin') : t('pin')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleOpenRename} disabled={isPending || isLoading || isStreaming}>
                            <Icon icon={Edit03Icon} className="text-muted-foreground mr-2 size-[18px]" />
                            <span>{t('rename')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleArchive} disabled={isPending || isStreaming}>
                            <Icon icon={Archive03Icon} className="text-muted-foreground mr-2 size-[18px]" />
                            <span>{t('archive')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="focus:bg-destructive/20"
                            onClick={() => setDeleteDialogOpen(true)}
                            disabled={isPending || isStreaming}
                          >
                            <Icon icon={Delete02Icon} className="text-muted-foreground mr-2 size-[18px]" />
                            <span>{t('delete')}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </>
                )}
                {!effectiveChatId && (
                  <div className="ml-auto flex items-center gap-2">
                    {isPro === false && (
                      <Button
                        onClick={() => router.push('/upgrade')}
                        variant="secondary"
                        className="h-8 md:hidden"
                      >
                        <Icon icon={GiftIcon} className="size-[18px]" />
                        Upgrade
                      </Button>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={handleTemporaryChat}
                            title={isTemporary ? t('returnToNormalChat') : t('temporaryChat')}
                          >
                            {isTemporary ? (
                              <Icon icon={BubbleChatTemporaryIcon} className="size-[18px] md:size-[18px]" />
                            ) : (
                              <Icon icon={BubbleChatAddIcon} className="size-[18px] md:size-[18px]" />
                            )}
                            <span className="sr-only">{isTemporary ? t('returnToNormalChat') : t('temporaryChat')}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={6}>
                          {isTemporary ? t('returnToNormalChat') : t('temporaryChat')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
                {!chatId && isPro === false && (
                  <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
                    <Button
                      onClick={() => router.push('/upgrade')}
                      variant="secondary"
                      className="mb-1 h-9"
                    >
                      <Icon icon={GiftIcon} className="size-[18px]" />
                      Upgrade
                    </Button>
                  </div>
                )}
              </div>
              <SidebarInset className="flex-1 overflow-y-auto min-h-0 scrollbar-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
                {isNewChat ? (
                  <div className="flex flex-col items-center justify-center h-full px-4">
                    <div className="w-full max-w-3xl">
                      <h1 className="text-2xl md:text-2xl font-medium tracking-tight text-center">{isTemporary ? t('temporaryChatTitle') : t('newChatTitle')}</h1>
                      <div className="mt-6">
                        <AttachmentsInline
                          attachments={attachments}
                          onRemoveAttachment={handleRemoveAttachment}
                        />
                        <PromptInput onSubmit={handleSubmit}>
                          <PromptInputContent
                            leftContent={
                              <>
                                <PromptInputAttachmentButton
                                  onFilesSelected={handleAddAttachments}
                                  variant="ghost"
                                  className="size-8"
                                />
                                {canWebSearch && (
                                  <PromptInputWebSearchButton
                                    active={webSearch}
                                    onClick={() => setWebSearch(!webSearch)}
                                  />
                                )}
                              </>
                            }
                            rightContent={<PromptInputSubmit disabled={!input || isStreaming} status={isStreaming ? 'streaming' : status} className="size-8" />}
                          >
                            <PromptInputTextarea
                              autoFocus
                              onChange={(e) => setInput(e.target.value)}
                              value={input}
                            />
                          </PromptInputContent>
                        </PromptInput>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ChatMessages
                    chatId={chatId}
                    activeBranchId={activeBranchId}
                    canWebSearch={canWebSearch}
                    isStreaming={isStreaming}
                    isTemporary={isTemporary}
                    messages={messages}
                    model={model}
                    status={status}
                    webSearch={webSearch}
                    setActiveBranchId={setActiveBranchId}
                    setIsStreaming={setIsStreaming}
                    setMessages={setMessages}
                    regenerate={regenerate}
                    router={router}
                    artifacts={artifacts}
                    onOpenArtifact={handleOpenArtifact}
                    selectedArtifactId={selectedArtifactId}
                    setSelectedArtifactId={setSelectedArtifactId}
                  />
                )}
              </SidebarInset>
              {!isNewChat && (
                <div className="shrink-0 pb-4 bg-background">
                  <div className="rounded-md w-full max-w-3xl mx-auto">
                    <AttachmentsInline
                      attachments={attachments}
                      onRemoveAttachment={handleRemoveAttachment}
                    />
                    <PromptInput onSubmit={handleSubmit}>
                      <PromptInputContent
                        leftContent={
                          <>
                            <PromptInputAttachmentButton
                              onFilesSelected={handleAddAttachments}
                              variant="ghost"
                              className="size-8"
                            />
                            {canWebSearch && (
                              <PromptInputWebSearchButton
                                active={webSearch}
                                onClick={() => setWebSearch(!webSearch)}
                              />
                            )}
                          </>
                        }
                        rightContent={<PromptInputSubmit disabled={!input || isStreaming} status={isStreaming ? 'streaming' : status} className="size-8" />}
                      >
                        <PromptInputTextarea
                          autoFocus
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === '/' && !input.trim()) {
                              e.preventDefault()
                              setSpotlightOpen(true)
                            }
                          }}
                          value={input}
                        />
                      </PromptInputContent>
                    </PromptInput>
                  </div>
                </div>
              )}

              <ShareDialog
                open={shareDialogOpen}
                onOpenChange={setShareDialogOpen}
                shareLink={shareLink}
                onOpenShareLink={handleOpenShareLink}
                onCopy={copyToClipboard}
              />

              <DeleteDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                isPending={isPending}
                isLoading={isLoading}
                onConfirm={handleDelete}
                onCancel={() => setDeleteDialogOpen(false)}
              />

              <RenameDialog
                open={renameDialogOpen}
                onOpenChange={setRenameDialogOpen}
                value={renameValue}
                onChangeValue={setRenameValue}
                isPending={isPending}
                isLoading={isLoading}
                onCancel={() => setRenameDialogOpen(false)}
                onSave={handleRename}
              />

              <SpotlightDialog
                open={spotlightOpen}
                onOpenChange={setSpotlightOpen}
                chats={spotlightChats}
                onSelectChat={(id) => {
                  setSpotlightOpen(false)
                  router.push(`/chat/${id}`)
                }}
              />
            </div>
          </ResizablePanel>
          {isPanelOpen && selectedArtifact && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={40} id="artifact-panel">
                <div className="flex flex-col h-full bg-sidebar border-l">
                  <div className="flex items-center justify-between p-4 border-b shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-semibold truncate">{selectedArtifact.title}</h3>
                    </div>
                    <button
                      onClick={handleCloseArtifactPanel}
                      className="p-1.5 hover:bg-muted cursor-pointer rounded-md transition-colors shrink-0"
                    >
                      <Icon icon={Cancel01Icon} className="size-[18px]" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto scrollbar-hidden p-2">
                    {selectedArtifact.status === 'processing' ? (
                      <div className="flex items-center justify-center h-40">
                        <div className="flex flex-col items-center gap-3">
                          <div className="size-8 border border-border border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground">Generating artifact...</p>
                        </div>
                      </div>
                    ) : selectedArtifact.status === 'failed' ? (
                      <div className="flex items-center justify-center h-40">
                        <p className="text-sm text-destructive">Failed to generate artifact</p>
                      </div>
                    ) : (
                      <ArtifactRenderer content={selectedArtifact.content} />
                    )}
                  </div>
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
    </div>
  )
}

